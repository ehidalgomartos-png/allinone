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
const PROVIDERS = ['instagram', 'facebook', 'tiktok', 'youtube', 'x'];
const publicDir = path.join(__dirname, 'public');

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-secret-change-me') {
  throw new Error('En producción debes definir JWT_SECRET.');
}

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
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
    bio: row.bio,
    avatar: row.avatar,
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
    comments_count: Number(row.comments_count || 0)
  };
}

async function getPosts(userId, discover = false) {
  const where = discover
    ? ''
    : `WHERE p.user_id = $1 OR EXISTS (
         SELECT 1 FROM follows f
         WHERE f.follower_id = $1 AND f.followed_id = p.user_id
       )`;

  const params = [userId];
  const { rows } = await pool.query(`
    SELECT
      p.id, p.user_id, p.text, p.media_id, p.media_type, p.source, p.external_url, p.created_at,
      u.username, u.name, u.avatar,
      COUNT(DISTINCT l.user_id)::int AS likes_count,
      COUNT(DISTINCT c.id)::int AS comments_count,
      EXISTS(
        SELECT 1 FROM likes lx
        WHERE lx.post_id = p.id AND lx.user_id = $1
      ) AS liked
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN likes l ON l.post_id = p.id
    LEFT JOIN comments c ON c.post_id = p.id
    ${where}
    GROUP BY p.id, u.id
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 100
  `, params);
  return rows.map(normalizePost);
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, version: '0.2.0', database: 'postgresql' });
}));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { username, name, email, password } = req.body;
  if (!username || !name || !email || !password) return res.status(400).json({ error: 'Faltan datos' });

  const normalizedUsername = String(username).trim().toLowerCase();
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedName = String(name).trim().slice(0, 100);
  const plainPassword = String(password);

  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(normalizedUsername)) {
    return res.status(400).json({ error: 'El usuario debe tener 3-30 caracteres: letras, números, _ o .' });
  }
  if (!normalizedEmail.includes('@') || normalizedEmail.length > 255) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  if (plainPassword.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

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
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE email = $1 OR username = $1 LIMIT 1',
    [value]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) {
    return res.status(401).json({ error: 'Datos incorrectos' });
  }
  res.json({ token: tokenFor(user), user: safeUser(user) });
}));

app.get('/api/me', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(safeUser(rows[0]));
}));

app.patch('/api/me', auth, asyncRoute(async (req, res) => {
  const name = req.body.name !== undefined ? String(req.body.name).trim().slice(0, 100) : null;
  const bio = req.body.bio !== undefined ? String(req.body.bio).slice(0, 1000) : null;
  const avatar = req.body.avatar !== undefined ? String(req.body.avatar).slice(0, 2000) : null;
  const { rows } = await pool.query(`
    UPDATE users SET
      name = COALESCE($2, name),
      bio = COALESCE($3, bio),
      avatar = COALESCE($4, avatar)
    WHERE id = $1
    RETURNING *
  `, [req.user.id, name, bio, avatar]);
  res.json(safeUser(rows[0]));
}));

app.post('/api/upload', auth, upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta archivo' });
  const { rows } = await pool.query(`
    INSERT INTO media (user_id, mime_type, original_name, size_bytes, data)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
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
  const text = String(req.body.text || '').trim().slice(0, 10000);
  const mediaId = req.body.media_id ? String(req.body.media_id) : null;
  const mediaType = ['image', 'video'].includes(req.body.media_type) ? req.body.media_type : 'none';
  const publishTo = Array.isArray(req.body.publish_to)
    ? [...new Set(req.body.publish_to.filter((provider) => PROVIDERS.includes(provider)))]
    : [];

  if (!text && !mediaId) return res.status(400).json({ error: 'El post está vacío' });

  const result = await withTransaction(async (client) => {
    if (mediaId) {
      const media = await client.query('SELECT id FROM media WHERE id = $1 AND user_id = $2', [mediaId, req.user.id]);
      if (!media.rowCount) {
        const err = new Error('Archivo multimedia inválido');
        err.status = 400;
        throw err;
      }
    }

    const postResult = await client.query(`
      INSERT INTO posts (user_id, text, media_id, media_type, source)
      VALUES ($1, $2, $3, $4, 'native')
      RETURNING id
    `, [req.user.id, text, mediaId, mediaId ? mediaType : 'none']);
    const postId = postResult.rows[0].id;

    for (const provider of publishTo) {
      await client.query(`
        INSERT INTO cross_posts (post_id, provider, status)
        VALUES ($1, $2, 'queued')
        ON CONFLICT (post_id, provider) DO NOTHING
      `, [postId, provider]);
    }
    return { postId };
  });

  res.json({ id: result.postId, queued: publishTo });
}));

app.get('/api/feed', auth, asyncRoute(async (req, res) => {
  res.json(await getPosts(req.user.id, false));
}));

app.get('/api/discover', auth, asyncRoute(async (req, res) => {
  res.json(await getPosts(req.user.id, true));
}));

app.post('/api/posts/:id/like', auth, asyncRoute(async (req, res) => {
  const postId = req.params.id;
  const result = await withTransaction(async (client) => {
    const exists = await client.query('SELECT 1 FROM posts WHERE id = $1', [postId]);
    if (!exists.rowCount) {
      const err = new Error('Publicación no encontrada');
      err.status = 404;
      throw err;
    }
    const deleted = await client.query(
      'DELETE FROM likes WHERE user_id = $1 AND post_id = $2 RETURNING user_id',
      [req.user.id, postId]
    );
    let liked = false;
    if (!deleted.rowCount) {
      await client.query(
        'INSERT INTO likes (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.user.id, postId]
      );
      liked = true;
    }
    const count = await client.query('SELECT COUNT(*)::int AS count FROM likes WHERE post_id = $1', [postId]);
    return { liked, count: count.rows[0].count };
  });
  res.json(result);
}));

app.post('/api/posts/:id/comments', auth, asyncRoute(async (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'Comentario vacío' });
  const { rows } = await pool.query(`
    INSERT INTO comments (post_id, user_id, text)
    SELECT p.id, $2, $3 FROM posts p WHERE p.id = $1
    RETURNING id
  `, [req.params.id, req.user.id, text]);
  if (!rows[0]) return res.status(404).json({ error: 'Publicación no encontrada' });
  res.json({ ok: true, id: rows[0].id });
}));

app.get('/api/posts/:id/comments', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT c.id, c.post_id, c.user_id, c.text, c.created_at, u.username, u.name, u.avatar
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.post_id = $1
    ORDER BY c.created_at ASC, c.id ASC
  `, [req.params.id]);
  res.json(rows);
}));

app.get('/api/users', auth, asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 100);
  const pattern = `%${q}%`;
  const { rows } = await pool.query(`
    SELECT id, username, name, email, bio, avatar, created_at
    FROM users
    WHERE id <> $1
      AND ($2 = '%%' OR username ILIKE $2 OR name ILIKE $2)
    ORDER BY created_at DESC
    LIMIT 30
  `, [req.user.id, pattern]);
  res.json(rows);
}));

app.post('/api/users/:id/follow', auth, asyncRoute(async (req, res) => {
  const followedId = req.params.id;
  if (String(followedId) === String(req.user.id)) return res.status(400).json({ error: 'No puedes seguirte' });

  const result = await withTransaction(async (client) => {
    const userExists = await client.query('SELECT 1 FROM users WHERE id = $1', [followedId]);
    if (!userExists.rowCount) {
      const err = new Error('Usuario no encontrado');
      err.status = 404;
      throw err;
    }
    const deleted = await client.query(
      'DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2 RETURNING follower_id',
      [req.user.id, followedId]
    );
    if (deleted.rowCount) return { following: false };
    await client.query(
      'INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, followedId]
    );
    return { following: true };
  });
  res.json(result);
}));

app.get('/api/social-accounts', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT provider, external_username, status, import_enabled, publish_enabled FROM social_accounts WHERE user_id = $1',
    [req.user.id]
  );
  const byProvider = new Map(rows.map((row) => [row.provider, row]));
  res.json(PROVIDERS.map((provider) => byProvider.get(provider) || {
    provider,
    status: 'disconnected',
    external_username: '',
    import_enabled: true,
    publish_enabled: true
  }));
}));

app.post('/api/social-accounts/:provider/mock-connect', auth, asyncRoute(async (req, res) => {
  const provider = req.params.provider;
  if (!PROVIDERS.includes(provider)) return res.status(400).json({ error: 'Proveedor inválido' });
  const externalUsername = String(req.body.external_username || `@${req.user.username}`).slice(0, 255);
  await pool.query(`
    INSERT INTO social_accounts (user_id, provider, external_username, status)
    VALUES ($1, $2, $3, 'connected')
    ON CONFLICT (user_id, provider)
    DO UPDATE SET external_username = EXCLUDED.external_username, status = 'connected', updated_at = NOW()
  `, [req.user.id, provider, externalUsername]);
  res.json({ ok: true, note: 'Conexión simulada en V0.2. OAuth real llegará en la siguiente fase.' });
}));

app.get('/api/cross-posts', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT cp.id, cp.post_id, cp.provider, cp.status, cp.external_post_id, cp.error, cp.created_at, cp.updated_at,
           p.text, p.media_id
    FROM cross_posts cp
    JOIN posts p ON p.id = cp.post_id
    WHERE p.user_id = $1
    ORDER BY cp.created_at DESC, cp.id DESC
  `, [req.user.id]);
  res.json(rows.map((row) => ({ ...row, media_url: row.media_id ? `/media/${row.media_id}` : '' })));
}));

app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'El archivo supera el límite de 10 MB de esta versión' });
  }
  const status = err.status || 500;
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message });
});

async function start() {
  await initDb();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OmniSocial V0.2 en http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('No se pudo iniciar OmniSocial:', err);
  process.exit(1);
});
