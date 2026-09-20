const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
require('dotenv').config();

const { pool, initDb, withTransaction } = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const publicDir = path.join(__dirname, 'public');

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-secret-change-me') {
  throw new Error('En producción debes definir JWT_SECRET.');
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) return cb(null, true);
    cb(new Error('Solo se permiten imágenes o vídeos.'));
  }
});

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida' });
  }
}

function safeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    bio: row.bio || '',
    avatar: row.avatar || '',
    website: row.website || '',
    location: row.location || '',
    created_at: row.created_at
  };
}

function tokenFor(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}

function normalizePost(row) {
  return {
    ...row,
    media_url: row.media_id ? `/media/${row.media_id}` : '',
    likes_count: Number(row.likes_count || 0),
    comments_count: Number(row.comments_count || 0),
    saved: Boolean(row.saved),
    liked: Boolean(row.liked),
    own: Boolean(row.own)
  };
}

async function postQuery(userId, { mode = 'following', profileId = null, search = '', limit = 60 } = {}) {
  const params = [userId];
  const clauses = [];

  if (mode === 'following') {
    clauses.push(`(p.user_id = $1 OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followed_id = p.user_id))`);
  }
  if (profileId) {
    params.push(profileId);
    clauses.push(`p.user_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`(p.text ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.name ILIKE $${params.length})`);
  }

  // Los posts de seguidores solo son visibles para seguidores; los públicos se ven siempre.
  clauses.push(`(p.visibility = 'public' OR p.user_id = $1 OR (p.visibility = 'followers' AND EXISTS (SELECT 1 FROM follows vf WHERE vf.follower_id = $1 AND vf.followed_id = p.user_id)))`);

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit);

  const { rows } = await pool.query(`
    SELECT
      p.id, p.user_id, p.text, p.media_id, p.media_type, p.source, p.visibility, p.created_at, p.edited_at,
      u.username, u.name, u.avatar,
      COUNT(DISTINCT l.user_id)::int AS likes_count,
      COUNT(DISTINCT c.id)::int AS comments_count,
      EXISTS(SELECT 1 FROM likes lx WHERE lx.post_id = p.id AND lx.user_id = $1) AS liked,
      EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = $1) AS saved,
      (p.user_id = $1) AS own
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN likes l ON l.post_id = p.id
    LEFT JOIN comments c ON c.post_id = p.id
    ${where}
    GROUP BY p.id, u.id
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT $${params.length}
  `, params);
  return rows.map(normalizePost);
}

async function addNotification(client, { userId, actorId, type, postId = null, text = '' }) {
  if (String(userId) === String(actorId)) return;
  await client.query(`
    INSERT INTO notifications (user_id, actor_id, type, post_id, text)
    VALUES ($1, $2, $3, $4, $5)
  `, [userId, actorId, type, postId, String(text || '').slice(0, 500)]);
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, version: '0.4.1', database: 'postgresql', mode: 'own-community' });
}));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { username, name, email, password } = req.body;
  if (!username || !name || !email || !password) return res.status(400).json({ error: 'Faltan datos' });

  const normalizedUsername = String(username).trim().toLowerCase();
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedName = String(name).trim().slice(0, 100);
  const plainPassword = String(password);

  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(normalizedUsername)) return res.status(400).json({ error: 'El usuario debe tener 3-30 caracteres: letras, números, _ o .' });
  if (!normalizedEmail.includes('@') || normalizedEmail.length > 255) return res.status(400).json({ error: 'Email inválido' });
  if (plainPassword.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  const passwordHash = await bcrypt.hash(plainPassword, 10);
  try {
    const { rows } = await pool.query(`
      INSERT INTO users (username, name, email, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [normalizedUsername, normalizedName, normalizedEmail, passwordHash]);
    const user = rows[0];
    res.json({ token: tokenFor(user), user: safeUser(user) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Usuario o email ya existe' });
    throw err;
  }
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const value = String(req.body.emailOrUsername || '').trim().toLowerCase();
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 OR username = $1 LIMIT 1', [value]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) return res.status(401).json({ error: 'Datos incorrectos' });
  res.json({ token: tokenFor(user), user: safeUser(user) });
}));

app.get('/api/me', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.*,
      (SELECT COUNT(*)::int FROM follows WHERE followed_id = u.id) AS followers_count,
      (SELECT COUNT(*)::int FROM follows WHERE follower_id = u.id) AS following_count,
      (SELECT COUNT(*)::int FROM posts WHERE user_id = u.id) AS posts_count,
      (SELECT COUNT(*)::int FROM notifications WHERE user_id = u.id AND read_at IS NULL) AS unread_notifications
    FROM users u WHERE u.id = $1
  `, [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ ...safeUser(rows[0]), followers_count: rows[0].followers_count, following_count: rows[0].following_count, posts_count: rows[0].posts_count, unread_notifications: rows[0].unread_notifications });
}));

app.patch('/api/me', auth, asyncRoute(async (req, res) => {
  const name = req.body.name !== undefined ? String(req.body.name).trim().slice(0, 100) : null;
  const bio = req.body.bio !== undefined ? String(req.body.bio).trim().slice(0, 500) : null;
  const avatar = req.body.avatar !== undefined ? String(req.body.avatar).trim().slice(0, 2000) : null;
  const website = req.body.website !== undefined ? String(req.body.website).trim().slice(0, 500) : null;
  const location = req.body.location !== undefined ? String(req.body.location).trim().slice(0, 120) : null;
  const { rows } = await pool.query(`
    UPDATE users SET
      name = COALESCE($2, name), bio = COALESCE($3, bio), avatar = COALESCE($4, avatar),
      website = COALESCE($5, website), location = COALESCE($6, location)
    WHERE id = $1 RETURNING *
  `, [req.user.id, name, bio, avatar, website, location]);
  res.json(safeUser(rows[0]));
}));

app.post('/api/upload', auth, upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta archivo' });
  const { rows } = await pool.query(`
    INSERT INTO media (user_id, mime_type, original_name, size_bytes, data)
    VALUES ($1, $2, $3, $4, $5) RETURNING id
  `, [req.user.id, req.file.mimetype, req.file.originalname, req.file.size, req.file.buffer]);
  const mediaId = rows[0].id;
  res.json({ media_id: mediaId, url: `/media/${mediaId}`, mime: req.file.mimetype });
}));

app.get('/media/:id', asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT mime_type, data FROM media WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).end();
  res.set('Content-Type', rows[0].mime_type);
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(rows[0].data);
}));

app.post('/api/posts', auth, asyncRoute(async (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 5000);
  const mediaId = req.body.media_id ? String(req.body.media_id) : null;
  const mediaType = ['image', 'video'].includes(req.body.media_type) ? req.body.media_type : 'none';
  const visibility = ['public', 'followers'].includes(req.body.visibility) ? req.body.visibility : 'public';
  if (!text && !mediaId) return res.status(400).json({ error: 'La publicación está vacía' });

  if (mediaId) {
    const media = await pool.query('SELECT id FROM media WHERE id = $1 AND user_id = $2', [mediaId, req.user.id]);
    if (!media.rowCount) return res.status(400).json({ error: 'Archivo multimedia inválido' });
  }
  const { rows } = await pool.query(`
    INSERT INTO posts (user_id, text, media_id, media_type, source, visibility)
    VALUES ($1, $2, $3, $4, 'native', $5) RETURNING id
  `, [req.user.id, text, mediaId, mediaId ? mediaType : 'none', visibility]);
  res.json({ id: rows[0].id });
}));

app.delete('/api/posts/:id', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Publicación no encontrada' });
  res.json({ ok: true });
}));

app.get('/api/feed', auth, asyncRoute(async (req, res) => {
  res.json(await postQuery(req.user.id, { mode: 'following' }));
}));

app.get('/api/discover', auth, asyncRoute(async (req, res) => {
  // Para ti: publicaciones públicas, con una pequeña priorización por interacción reciente.
  const { rows } = await pool.query(`
    SELECT
      p.id, p.user_id, p.text, p.media_id, p.media_type, p.source, p.visibility, p.created_at, p.edited_at,
      u.username, u.name, u.avatar,
      COUNT(DISTINCT l.user_id)::int AS likes_count,
      COUNT(DISTINCT c.id)::int AS comments_count,
      EXISTS(SELECT 1 FROM likes lx WHERE lx.post_id = p.id AND lx.user_id = $1) AS liked,
      EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = $1) AS saved,
      (p.user_id = $1) AS own
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN likes l ON l.post_id = p.id
    LEFT JOIN comments c ON c.post_id = p.id
    WHERE p.visibility = 'public' OR p.user_id = $1
    GROUP BY p.id, u.id
    ORDER BY ((COUNT(DISTINCT l.user_id) * 2) + COUNT(DISTINCT c.id)) DESC, p.created_at DESC
    LIMIT 80
  `, [req.user.id]);
  res.json(rows.map(normalizePost));
}));

app.get('/api/bookmarks', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      p.id, p.user_id, p.text, p.media_id, p.media_type, p.source, p.visibility, p.created_at, p.edited_at,
      u.username, u.name, u.avatar,
      COUNT(DISTINCT l.user_id)::int AS likes_count,
      COUNT(DISTINCT c.id)::int AS comments_count,
      EXISTS(SELECT 1 FROM likes lx WHERE lx.post_id = p.id AND lx.user_id = $1) AS liked,
      TRUE AS saved,
      (p.user_id = $1) AS own
    FROM bookmarks bk
    JOIN posts p ON p.id = bk.post_id
    JOIN users u ON u.id = p.user_id
    LEFT JOIN likes l ON l.post_id = p.id
    LEFT JOIN comments c ON c.post_id = p.id
    WHERE bk.user_id = $1
    GROUP BY p.id, u.id, bk.created_at
    ORDER BY bk.created_at DESC
  `, [req.user.id]);
  res.json(rows.map(normalizePost));
}));

app.post('/api/posts/:id/like', auth, asyncRoute(async (req, res) => {
  const postId = req.params.id;
  const result = await withTransaction(async (client) => {
    const post = await client.query('SELECT id, user_id FROM posts WHERE id = $1', [postId]);
    if (!post.rowCount) { const err = new Error('Publicación no encontrada'); err.status = 404; throw err; }
    const deleted = await client.query('DELETE FROM likes WHERE user_id = $1 AND post_id = $2 RETURNING user_id', [req.user.id, postId]);
    let liked = false;
    if (!deleted.rowCount) {
      await client.query('INSERT INTO likes (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, postId]);
      liked = true;
      await addNotification(client, { userId: post.rows[0].user_id, actorId: req.user.id, type: 'like', postId });
    }
    const count = await client.query('SELECT COUNT(*)::int AS count FROM likes WHERE post_id = $1', [postId]);
    return { liked, count: count.rows[0].count };
  });
  res.json(result);
}));

app.post('/api/posts/:id/bookmark', auth, asyncRoute(async (req, res) => {
  const result = await withTransaction(async (client) => {
    const exists = await client.query('SELECT 1 FROM posts WHERE id = $1', [req.params.id]);
    if (!exists.rowCount) { const err = new Error('Publicación no encontrada'); err.status = 404; throw err; }
    const deleted = await client.query('DELETE FROM bookmarks WHERE user_id = $1 AND post_id = $2 RETURNING user_id', [req.user.id, req.params.id]);
    if (deleted.rowCount) return { saved: false };
    await client.query('INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id]);
    return { saved: true };
  });
  res.json(result);
}));

app.post('/api/posts/:id/comments', auth, asyncRoute(async (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: 'Comentario vacío' });
  const result = await withTransaction(async (client) => {
    const post = await client.query('SELECT id, user_id FROM posts WHERE id = $1', [req.params.id]);
    if (!post.rowCount) { const err = new Error('Publicación no encontrada'); err.status = 404; throw err; }
    const { rows } = await client.query('INSERT INTO comments (post_id, user_id, text) VALUES ($1, $2, $3) RETURNING id', [req.params.id, req.user.id, text]);
    await addNotification(client, { userId: post.rows[0].user_id, actorId: req.user.id, type: 'comment', postId: req.params.id, text });
    return rows[0];
  });
  res.json({ ok: true, id: result.id });
}));

app.get('/api/posts/:id/comments', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT c.id, c.post_id, c.user_id, c.text, c.created_at, u.username, u.name, u.avatar,
           (c.user_id = $2) AS own
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = $1 ORDER BY c.created_at ASC, c.id ASC
  `, [req.params.id, req.user.id]);
  res.json(rows);
}));

app.delete('/api/comments/:id', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM comments WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Comentario no encontrado' });
  res.json({ ok: true });
}));

app.get('/api/users', auth, asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const pattern = `%${q}%`;
  const { rows } = await pool.query(`
    SELECT u.id, u.username, u.name, u.bio, u.avatar, u.location, u.created_at,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followed_id = u.id) AS following,
      (SELECT COUNT(*)::int FROM follows WHERE followed_id = u.id) AS followers_count
    FROM users u
    WHERE u.id <> $1 AND ($2 = '%%' OR u.username ILIKE $2 OR u.name ILIKE $2 OR u.bio ILIKE $2)
    ORDER BY followers_count DESC, u.created_at DESC LIMIT 50
  `, [req.user.id, pattern]);
  res.json(rows);
}));

app.get('/api/users/:username', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.*,
      (SELECT COUNT(*)::int FROM follows WHERE followed_id = u.id) AS followers_count,
      (SELECT COUNT(*)::int FROM follows WHERE follower_id = u.id) AS following_count,
      (SELECT COUNT(*)::int FROM posts WHERE user_id = u.id) AS posts_count,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followed_id = u.id) AS following,
      (u.id = $1) AS own
    FROM users u WHERE LOWER(u.username) = LOWER($2) LIMIT 1
  `, [req.user.id, req.params.username]);
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  const row = rows[0];
  res.json({ ...safeUser(row), followers_count: row.followers_count, following_count: row.following_count, posts_count: row.posts_count, following: row.following, own: row.own });
}));

app.get('/api/users/:username/posts', auth, asyncRoute(async (req, res) => {
  const found = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1', [req.params.username]);
  if (!found.rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(await postQuery(req.user.id, { mode: 'all', profileId: found.rows[0].id }));
}));

app.post('/api/users/:id/follow', auth, asyncRoute(async (req, res) => {
  const followedId = req.params.id;
  if (String(followedId) === String(req.user.id)) return res.status(400).json({ error: 'No puedes seguirte' });
  const result = await withTransaction(async (client) => {
    const userExists = await client.query('SELECT 1 FROM users WHERE id = $1', [followedId]);
    if (!userExists.rowCount) { const err = new Error('Usuario no encontrado'); err.status = 404; throw err; }
    const deleted = await client.query('DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2 RETURNING follower_id', [req.user.id, followedId]);
    if (deleted.rowCount) return { following: false };
    await client.query('INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, followedId]);
    await addNotification(client, { userId: followedId, actorId: req.user.id, type: 'follow' });
    return { following: true };
  });
  res.json(result);
}));

app.get('/api/search', auth, asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (!q) return res.json({ users: [], posts: [] });
  const pattern = `%${q}%`;
  const users = await pool.query(`
    SELECT u.id, u.username, u.name, u.bio, u.avatar,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followed_id = u.id) AS following
    FROM users u WHERE u.id <> $1 AND (u.username ILIKE $2 OR u.name ILIKE $2 OR u.bio ILIKE $2)
    ORDER BY u.name LIMIT 20
  `, [req.user.id, pattern]);
  const posts = await postQuery(req.user.id, { mode: 'all', search: q, limit: 30 });
  res.json({ users: users.rows, posts });
}));

app.get('/api/trending', auth, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    WITH words AS (
      SELECT regexp_matches(LOWER(text), '#[[:alnum:]_áéíóúñü]+', 'g') AS m
      FROM posts WHERE created_at > NOW() - INTERVAL '30 days' AND visibility = 'public'
    )
    SELECT m[1] AS tag, COUNT(*)::int AS count
    FROM words GROUP BY m[1] ORDER BY count DESC, tag ASC LIMIT 10
  `);
  res.json(rows);
}));

app.get('/api/notifications', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT n.id, n.type, n.post_id, n.text, n.read_at, n.created_at,
           a.id AS actor_id, a.username, a.name, a.avatar
    FROM notifications n
    LEFT JOIN users a ON a.id = n.actor_id
    WHERE n.user_id = $1
    ORDER BY n.created_at DESC LIMIT 100
  `, [req.user.id]);
  res.json(rows);
}));

app.post('/api/notifications/read', auth, asyncRoute(async (req, res) => {
  await pool.query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
}));

app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'El archivo supera el límite de 12 MB de esta versión' });
  const status = err.status || 500;
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message });
});

async function start() {
  await initDb();
  app.listen(PORT, '0.0.0.0', () => console.log(`OmniSocial V0.4.1 en http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('No se pudo iniciar OmniSocial:', err);
  process.exit(1);
});
