const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const { pool, initDb, withTransaction } = require('./src/db');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: true, credentials: true } });
const onlineUsers = new Map();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const CURRENT_TERMS_VERSION = '2026-09-20';
const publicDir = path.join(__dirname, 'public');

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-secret-change-me') {
  throw new Error('En producción debes definir JWT_SECRET.');
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors());
app.use((req,res,next) => {
  res.set('X-Content-Type-Options','nosniff');
  res.set('X-Frame-Options','DENY');
  res.set('Referrer-Policy','strict-origin-when-cross-origin');
  res.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  next();
});
app.use('/api', (_req,res,next) => { res.set('Cache-Control','no-store'); next(); });
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) return cb(null, true);
    cb(new Error('Solo se permiten imágenes o vídeos.'));
  }
});

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query('SELECT id,username,email,role,account_status FROM users WHERE id=$1', [decoded.id]);
    const dbUser = rows[0];
    if (!dbUser) return res.status(401).json({ error: 'La cuenta ya no existe' });
    if (dbUser.account_status === 'suspended') return res.status(403).json({ error: 'Esta cuenta está suspendida' });
    req.user = { ...decoded, ...dbUser };
    return next();
  } catch (err) {
    if (err?.status) return next(err);
    return res.status(401).json({ error: 'Sesión inválida' });
  }
}

function configuredAdminEmails() {
  return new Set(String(process.env.ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean));
}

function isAdminRecord(user = {}) {
  return user.role === 'admin' || configuredAdminEmails().has(String(user.email || '').toLowerCase());
}

async function adminOnly(req, res, next) {
  try {
    if (isAdminRecord(req.user)) return next();
    return res.status(403).json({ error: 'Acceso reservado a administración' });
  } catch (err) {
    next(err);
  }
}

function safeUser(row, includePrivate = false) {
  if (!row) return null;
  const user = {
    id: row.id,
    username: row.username,
    name: row.name,
    bio: row.bio || '',
    avatar: row.avatar || '',
    website: row.website || '',
    location: row.location || '',
    headline: row.headline || '',
    interests: row.interests || '',
    cover: row.cover || '',
    account_private: Boolean(row.account_private),
    created_at: row.created_at
  };
  if (includePrivate) {
    user.email = row.email;
    user.message_policy = row.message_policy || 'everyone';
    user.onboarding_completed = row.onboarding_completed !== false;
    user.is_admin = isAdminRecord(row);
    user.account_status = row.account_status || 'active';
    user.terms_version = row.terms_version || '';
    user.terms_accepted_at = row.terms_accepted_at || null;
    user.age_confirmed_at = row.age_confirmed_at || null;
  }
  return user;
}

function tokenFor(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}


async function blockState(a, b, client = pool) {
  const { rows } = await client.query(`
    SELECT
      EXISTS(SELECT 1 FROM blocks WHERE blocker_id=$1 AND blocked_id=$2) AS i_blocked,
      EXISTS(SELECT 1 FROM blocks WHERE blocker_id=$2 AND blocked_id=$1) AS blocked_me
  `, [a,b]);
  return { iBlocked:Boolean(rows[0]?.i_blocked), blockedMe:Boolean(rows[0]?.blocked_me) };
}

async function assertNotBlocked(a, b, client = pool) {
  const state = await blockState(a,b,client);
  if (state.iBlocked || state.blockedMe) {
    const err = new Error('Esta interacción no está disponible');
    err.status = 403;
    throw err;
  }
}

async function canMessageUser(senderId, recipientId, client = pool) {
  const blocked = await blockState(senderId, recipientId, client);
  if (blocked.iBlocked || blocked.blockedMe) return false;
  const { rows } = await client.query('SELECT message_policy FROM users WHERE id=$1',[recipientId]);
  if (!rows[0]) return false;
  const policy = rows[0].message_policy || 'everyone';
  if (policy === 'everyone') return true;
  if (policy === 'nobody') return false;
  if (policy === 'followers') {
    const q = await client.query('SELECT 1 FROM follows WHERE follower_id=$1 AND followed_id=$2',[senderId,recipientId]);
    return q.rowCount > 0;
  }
  if (policy === 'friends') {
    const [a,b] = friendshipPair(senderId,recipientId);
    const q = await client.query('SELECT 1 FROM friendships WHERE user1_id=$1 AND user2_id=$2',[a,b]);
    return q.rowCount > 0;
  }
  return false;
}



function mediaIdFromStoredUrl(value) {
  const match = /^\/media\/(\d+)$/.exec(String(value || ''));
  return match ? Number(match[1]) : null;
}

async function removeProfileMedia(userId, field) {
  if (!['avatar', 'cover'].includes(field)) throw new Error('Campo de perfil no válido');
  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT ${field} AS value FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (!rows[0]) throw new Error('Usuario no encontrado');
    const current = rows[0].value || '';
    const mediaId = mediaIdFromStoredUrl(current);
    await client.query(`UPDATE users SET ${field} = '' WHERE id = $1`, [userId]);
    if (mediaId) {
      await client.query(`
        DELETE FROM media m
         WHERE m.id = $1 AND m.user_id = $2
           AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.media_id = m.id)
           AND NOT EXISTS (SELECT 1 FROM stories s WHERE s.media_id = m.id)
           AND NOT EXISTS (SELECT 1 FROM messages msg WHERE msg.media_id = m.id)
      `, [mediaId, userId]);
    }
    return { ok: true };
  });
}


function isOnline(userId) {
  return (onlineUsers.get(String(userId)) || 0) > 0;
}

async function presenceTargets(userId) {
  const { rows } = await pool.query(`
    SELECT CASE WHEN user1_id = $1 THEN user2_id ELSE user1_id END AS id
      FROM friendships WHERE user1_id = $1 OR user2_id = $1
    UNION
    SELECT CASE WHEN user1_id = $1 THEN user2_id ELSE user1_id END AS id
      FROM conversations WHERE user1_id = $1 OR user2_id = $1
  `, [userId]);
  const visible = [];
  for (const row of rows) {
    const bs = await blockState(userId,row.id).catch(()=>({iBlocked:false,blockedMe:false}));
    if (!bs.iBlocked && !bs.blockedMe) visible.push(String(row.id));
  }
  return visible;
}

async function broadcastPresence(userId, online) {
  const targets = await presenceTargets(userId).catch(() => []);
  for (const id of targets) io.to(`user:${id}`).emit('presence', { userId: Number(userId), online, lastSeenAt: online ? null : new Date().toISOString() });
}

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('No autenticado'));
    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query('SELECT id,username,email,role,account_status FROM users WHERE id=$1', [decoded.id]);
    if (!rows[0] || rows[0].account_status === 'suspended') return next(new Error('Cuenta no disponible'));
    socket.user = { ...decoded, ...rows[0] };
    next();
  } catch {
    next(new Error('Sesión inválida'));
  }
});

io.on('connection', async (socket) => {
  const userId = String(socket.user.id);
  socket.join(`user:${userId}`);
  const previous = onlineUsers.get(userId) || 0;
  onlineUsers.set(userId, previous + 1);
  if (previous === 0) await broadcastPresence(userId, true);

  socket.on('typing', async (payload = {}) => {
    try {
      const conversationId = Number(payload.conversationId);
      if (!Number.isInteger(conversationId)) return;
      const { rows } = await pool.query(`SELECT user1_id,user2_id FROM conversations WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)`, [conversationId, socket.user.id]);
      if (!rows[0]) return;
      const otherId = Number(rows[0].user1_id) === Number(socket.user.id) ? rows[0].user2_id : rows[0].user1_id;
      if (!(await canMessageUser(socket.user.id,otherId))) return;
      io.to(`user:${otherId}`).emit('typing', { conversationId, userId: Number(socket.user.id), typing: Boolean(payload.typing) });
    } catch {}
  });

  socket.on('disconnect', async () => {
    const count = Math.max(0, (onlineUsers.get(userId) || 1) - 1);
    if (count) onlineUsers.set(userId, count);
    else {
      onlineUsers.delete(userId);
      await pool.query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [userId]).catch(() => {});
      await broadcastPresence(userId, false);
    }
  });
});

function normalizePost(row) {
  return {
    ...row,
    media_url: row.media_id ? `/media/${row.media_id}` : '',
    likes_count: Number(row.likes_count || 0),
    comments_count: Number(row.comments_count || 0),
    saved: Boolean(row.saved),
    liked: Boolean(row.liked),
    own: Boolean(row.own),
    repost_of_id: row.repost_of_id ? Number(row.repost_of_id) : null
  };
}

async function enrichReposts(userId, posts = []) {
  const ids = [...new Set(posts.map(p => Number(p.repost_of_id)).filter(Boolean))];
  if (!ids.length) return posts;
  const { rows } = await pool.query(`
    SELECT p.id,p.user_id,p.text,p.media_id,p.media_type,p.visibility,p.created_at,p.edited_at,
           u.username,u.name,u.avatar,
           (u.account_status='active' AND (p.user_id=$1 OR (NOT u.account_private) OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=p.user_id))
            AND (p.visibility='public' OR p.user_id=$1 OR
             (p.visibility='followers' AND EXISTS(
               SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.followed_id=p.user_id
             )))
            AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$1))
            AND NOT EXISTS(SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=p.user_id))) AS can_view
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.id = ANY($2::bigint[])
  `,[userId,ids]);
  const map = new Map(rows.map(r => [Number(r.id), r]));
  return posts.map(post => {
    const original = map.get(Number(post.repost_of_id));
    if (!post.repost_of_id) return post;
    if (!original || !original.can_view) return { ...post, repost: { unavailable:true } };
    return { ...post, repost: {
      id:Number(original.id), user_id:Number(original.user_id), text:original.text || '',
      media_type:original.media_type || 'none',
      media_url:original.media_id ? `/media/${original.media_id}` : '',
      visibility:original.visibility, created_at:original.created_at, edited_at:original.edited_at,
      username:original.username, name:original.name, avatar:original.avatar || ''
    }};
  });
}

function extractMentions(text = '') {
  const matches = String(text).match(/(^|\s)@([a-zA-Z0-9_.]{3,30})/g) || [];
  return [...new Set(matches.map(x => x.trim().slice(1).toLowerCase()))].slice(0, 20);
}

async function notifyMentions(client, { text, actorId, postId = null }) {
  const usernames = extractMentions(text);
  if (!usernames.length) return;
  const { rows } = await client.query(
    'SELECT id,username FROM users WHERE LOWER(username) = ANY($1::text[])',
    [usernames]
  );
  for (const user of rows) {
    if (Number(user.id) === Number(actorId)) continue;
    await addNotification(client, { userId:user.id, actorId, type:'mention', postId, text:String(text || '').slice(0,220) });
  }
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

  // Privacidad V0.9: bloqueos, perfiles privados y silencios en feeds automáticos.
  clauses.push(`NOT EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$1))`);
  clauses.push(`(p.user_id=$1 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=p.user_id))`);
  if (!profileId) clauses.push(`NOT EXISTS (SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=p.user_id)`);
  clauses.push(`u.account_status = 'active'`);
  clauses.push(`(p.visibility = 'public' OR p.user_id = $1 OR (p.visibility = 'followers' AND EXISTS (SELECT 1 FROM follows vf WHERE vf.follower_id = $1 AND vf.followed_id = p.user_id)))`);

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit);

  const { rows } = await pool.query(`
    SELECT
      p.id, p.user_id, p.text, p.media_id, p.media_type, p.source, p.visibility, p.created_at, p.edited_at, p.repost_of_id,
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
  return enrichReposts(userId, rows.map(normalizePost));
}

async function addNotification(client, { userId, actorId, type, postId = null, text = '' }) {
  if (String(userId) === String(actorId)) return null;
  if (actorId) {
    const blocked = await client.query('SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1',[userId,actorId]).catch(()=>({rowCount:0}));
    if (blocked.rowCount) return null;
  }
  const { rows } = await client.query(`
    INSERT INTO notifications (user_id, actor_id, type, post_id, text)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, created_at
  `, [userId, actorId, type, postId, String(text || '').slice(0, 500)]);
  io.to(`user:${userId}`).emit('notification:new', { id: rows[0]?.id, type, actorId: Number(actorId), postId: postId ? Number(postId) : null, text });
  return rows[0] || null;
}

function recommendationReason(row = {}) {
  if (Number(row.interest_match || 0) > 0) return 'Coincide con tus intereses';
  if (Number(row.affinity_score || 0) >= 8) return 'Basado en contenido con el que interactúas';
  if (row.mutual_signal) return 'Personas que sigues conectan con este perfil';
  if (row.following_author) return 'De alguien que sigues';
  if ((Number(row.likes_count || 0) + Number(row.comments_count || 0)) >= 5) return 'Popular en la comunidad';
  return 'Nuevo para ti';
}

function peopleRecommendationReason(row = {}) {
  if (Number(row.shared_interest || 0) > 0) return 'Tenéis intereses en común';
  if (Number(row.mutual_count || 0) > 0) return `${Number(row.mutual_count)} conexión${Number(row.mutual_count) === 1 ? '' : 'es'} en común`;
  if (Number(row.interaction_score || 0) > 0) return 'Has interactuado con su contenido';
  if (Number(row.followers_count || 0) > 0) return 'Activo en la comunidad';
  return 'Nuevo en Instant Admirers';
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, version: '1.1.5', database: 'postgresql', mode: 'own-community', features: ['stories','reels','messages','friends','realtime','replies','private-sharing','mentions','hashtags','reposts','post-editing','advanced-profiles','for-you','people-suggestions','personalized-discovery','private-accounts','follow-requests','blocking','muting','reports','message-privacy','onboarding','account-settings','password-change','account-deletion','admin-moderation','report-review','ux-quality','connection-status','optimistic-actions','instant-admirers-brand','pwa-assets','seo-metadata','legal-pages','18-plus-registration','terms-acceptance','mobile-profile-ux','mobile-logout','composer-media-ux','compact-mobile-auth','visual-polish','unified-ui','profile-visual-refresh'] });
}));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { username, name, email, password, age_confirmed, terms_accepted, terms_version } = req.body;
  if (!username || !name || !email || !password) return res.status(400).json({ error: 'Faltan datos' });
  if (age_confirmed !== true) return res.status(400).json({ error: 'Debes confirmar que tienes 18 años o más' });
  if (terms_accepted !== true) return res.status(400).json({ error: 'Debes aceptar los Términos de Uso' });

  const normalizedUsername = String(username).trim().toLowerCase();
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedName = String(name).trim().slice(0, 100);
  const plainPassword = String(password);

  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(normalizedUsername)) return res.status(400).json({ error: 'El usuario debe tener 3-30 caracteres: letras, números, _ o .' });
  if (!normalizedEmail.includes('@') || normalizedEmail.length > 255) return res.status(400).json({ error: 'Email inválido' });
  if (plainPassword.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

  const passwordHash = await bcrypt.hash(plainPassword, 10);
  try {
    const { rows } = await pool.query(`
      INSERT INTO users (username, name, email, password_hash, onboarding_completed, age_confirmed_at, terms_accepted_at, terms_version)
      VALUES ($1, $2, $3, $4, FALSE, NOW(), NOW(), $5)
      RETURNING *
    `, [normalizedUsername, normalizedName, normalizedEmail, passwordHash, CURRENT_TERMS_VERSION]);
    const user = rows[0];
    res.json({ token: tokenFor(user), user: safeUser(user, true) });
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
  if (user.account_status === 'suspended') return res.status(403).json({ error: 'Esta cuenta está suspendida' });
  res.json({ token: tokenFor(user), user: safeUser(user, true) });
}));

app.get('/api/me', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.*,
      (SELECT COUNT(*)::int FROM follows WHERE followed_id = u.id) AS followers_count,
      (SELECT COUNT(*)::int FROM follows WHERE follower_id = u.id) AS following_count,
      (SELECT COUNT(*)::int FROM posts WHERE user_id = u.id) AS posts_count,
      (SELECT COUNT(*)::int FROM friendships WHERE user1_id = u.id OR user2_id = u.id) AS friends_count,
      (SELECT COUNT(*)::int FROM friend_requests WHERE to_user_id = u.id AND status = 'pending') AS friend_requests_count,
      (SELECT COUNT(*)::int FROM follow_requests WHERE followed_id = u.id) AS follow_requests_count,
      (SELECT COUNT(*)::int FROM blocks WHERE blocker_id = u.id) AS blocked_count,
      (SELECT COUNT(*)::int FROM mutes WHERE muter_id = u.id) AS muted_count,
      (SELECT COUNT(*)::int FROM notifications n WHERE n.user_id = u.id AND n.read_at IS NULL
        AND (n.actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=u.id AND bl.blocked_id=n.actor_id) OR (bl.blocker_id=n.actor_id AND bl.blocked_id=u.id)))) AS unread_notifications,
      (SELECT COUNT(*)::int
         FROM messages m
         JOIN conversations cv ON cv.id = m.conversation_id
         LEFT JOIN conversation_reads cr ON cr.conversation_id = cv.id AND cr.user_id = u.id
        WHERE (cv.user1_id = u.id OR cv.user2_id = u.id)
          AND m.sender_id <> u.id
          AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=u.id AND bl.blocked_id=m.sender_id) OR (bl.blocker_id=m.sender_id AND bl.blocked_id=u.id))
          AND m.created_at > COALESCE(cr.last_read_at, 'epoch'::timestamptz)
      ) AS unread_messages
    FROM users u WHERE u.id = $1
  `, [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ ...safeUser(rows[0], true), followers_count: rows[0].followers_count, following_count: rows[0].following_count, posts_count: rows[0].posts_count, friends_count: rows[0].friends_count, friend_requests_count: rows[0].friend_requests_count, follow_requests_count: rows[0].follow_requests_count, blocked_count: rows[0].blocked_count, muted_count: rows[0].muted_count, unread_notifications: rows[0].unread_notifications, unread_messages: rows[0].unread_messages, online: true, last_seen_at: rows[0].last_seen_at });
}));

app.patch('/api/me', auth, asyncRoute(async (req, res) => {
  const name = req.body.name !== undefined ? String(req.body.name).trim().slice(0, 100) : null;
  const bio = req.body.bio !== undefined ? String(req.body.bio).trim().slice(0, 500) : null;
  const avatar = req.body.avatar !== undefined ? String(req.body.avatar).trim().slice(0, 2000) : null;
  const website = req.body.website !== undefined ? String(req.body.website).trim().slice(0, 500) : null;
  const location = req.body.location !== undefined ? String(req.body.location).trim().slice(0, 120) : null;
  const headline = req.body.headline !== undefined ? String(req.body.headline).trim().slice(0, 140) : null;
  const interests = req.body.interests !== undefined ? String(req.body.interests).trim().slice(0, 500) : null;
  const cover = req.body.cover !== undefined ? String(req.body.cover).trim().slice(0, 2000) : null;
  const { rows } = await pool.query(`
    UPDATE users SET
      name = COALESCE($2, name), bio = COALESCE($3, bio), avatar = COALESCE($4, avatar),
      website = COALESCE($5, website), location = COALESCE($6, location),
      headline = COALESCE($7, headline), interests = COALESCE($8, interests), cover = COALESCE($9, cover)
    WHERE id = $1 RETURNING *
  `, [req.user.id, name, bio, avatar, website, location, headline, interests, cover]);
  res.json(safeUser(rows[0], true));
}));


app.delete('/api/me/avatar', auth, asyncRoute(async (req, res) => {
  res.json(await removeProfileMedia(req.user.id, 'avatar'));
}));

app.delete('/api/me/cover', auth, asyncRoute(async (req, res) => {
  res.json(await removeProfileMedia(req.user.id, 'cover'));
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
  const result = await withTransaction(async client => {
    const { rows } = await client.query(`
      INSERT INTO posts (user_id, text, media_id, media_type, source, visibility)
      VALUES ($1, $2, $3, $4, 'native', $5) RETURNING id
    `, [req.user.id, text, mediaId, mediaId ? mediaType : 'none', visibility]);
    await notifyMentions(client, { text, actorId:req.user.id, postId:rows[0].id });
    return rows[0];
  });
  res.json({ id: result.id });
}));

app.delete('/api/posts/:id', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Publicación no encontrada' });
  res.json({ ok: true });
}));


app.patch('/api/posts/:id', auth, asyncRoute(async (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 5000);
  const visibility = ['public','followers'].includes(req.body.visibility) ? req.body.visibility : 'public';
  const current = await pool.query('SELECT id,media_id,repost_of_id FROM posts WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);
  if (!current.rowCount) return res.status(404).json({ error:'Publicación no encontrada' });
  if (!text && !current.rows[0].media_id && !current.rows[0].repost_of_id) return res.status(400).json({ error:'La publicación está vacía' });
  await pool.query('UPDATE posts SET text=$3, visibility=$4, edited_at=NOW() WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id,text,visibility]);
  res.json({ ok:true });
}));

app.post('/api/posts/:id/repost', auth, asyncRoute(async (req, res) => {
  const postId = Number(req.params.id);
  if (!(await canUserViewPost(postId,req.user.id))) return res.status(404).json({error:'Publicación no disponible'});
  const text = String(req.body.text || '').trim().slice(0, 1500);
  const visibility = ['public','followers'].includes(req.body.visibility) ? req.body.visibility : 'public';
  const result = await withTransaction(async client => {
    const original = await client.query('SELECT id,user_id,visibility,repost_of_id FROM posts WHERE id=$1',[postId]);
    if (!original.rowCount) { const err=new Error('Publicación no encontrada'); err.status=404; throw err; }
    if (original.rows[0].visibility !== 'public') { const err=new Error('Solo se pueden republicar publicaciones públicas'); err.status=400; throw err; }
    const rootId = original.rows[0].repost_of_id || original.rows[0].id;
    const root = await client.query('SELECT id,user_id,visibility FROM posts WHERE id=$1',[rootId]);
    if (!root.rowCount || root.rows[0].visibility !== 'public') { const err=new Error('La publicación original ya no es pública'); err.status=400; throw err; }
    const { rows } = await client.query(`
      INSERT INTO posts (user_id,text,media_type,source,visibility,repost_of_id)
      VALUES ($1,$2,'none','repost',$3,$4) RETURNING id
    `,[req.user.id,text,visibility,rootId]);
    await addNotification(client,{userId:root.rows[0].user_id,actorId:req.user.id,type:'repost',postId:rootId,text});
    await notifyMentions(client,{text,actorId:req.user.id,postId:rows[0].id});
    return rows[0];
  });
  res.json({ id:result.id });
}));

app.get('/api/feed', auth, asyncRoute(async (req, res) => {
  res.json(await postQuery(req.user.id, { mode: 'following' }));
}));

app.get('/api/for-you', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    WITH viewer AS (
      SELECT LOWER(COALESCE(interests,'')) AS interests FROM users WHERE id = $1
    ), affinity AS (
      SELECT author_id, SUM(points)::numeric AS score
      FROM (
        SELECT p.user_id AS author_id, 4::numeric AS points
          FROM likes x JOIN posts p ON p.id = x.post_id WHERE x.user_id = $1
        UNION ALL
        SELECT p.user_id, 5::numeric
          FROM comments x JOIN posts p ON p.id = x.post_id WHERE x.user_id = $1
        UNION ALL
        SELECT p.user_id, 6::numeric
          FROM bookmarks x JOIN posts p ON p.id = x.post_id WHERE x.user_id = $1
        UNION ALL
        SELECT followed_id, 3::numeric FROM follows WHERE follower_id = $1
      ) signals
      GROUP BY author_id
    ), scored AS (
      SELECT
        p.id, p.user_id, p.text, p.media_id, p.media_type, p.source, p.visibility, p.created_at, p.edited_at, p.repost_of_id,
        u.username, u.name, u.avatar,
        COUNT(DISTINCT l.user_id)::int AS likes_count,
        COUNT(DISTINCT c.id)::int AS comments_count,
        EXISTS(SELECT 1 FROM likes lx WHERE lx.post_id = p.id AND lx.user_id = $1) AS liked,
        EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = $1) AS saved,
        (p.user_id = $1) AS own,
        COALESCE(a.score,0)::numeric AS affinity_score,
        CASE WHEN EXISTS (
          SELECT 1
            FROM regexp_split_to_table((SELECT interests FROM viewer), '\s*,\s*') AS term
           WHERE LENGTH(TRIM(term)) >= 2
             AND (
               LOWER(COALESCE(p.text,'')) LIKE '%' || TRIM(term) || '%'
               OR LOWER(COALESCE(u.interests,'')) LIKE '%' || TRIM(term) || '%'
               OR LOWER(COALESCE(u.headline,'')) LIKE '%' || TRIM(term) || '%'
             )
        ) THEN 1 ELSE 0 END AS interest_match,
        EXISTS (
          SELECT 1
            FROM follows mine
            JOIN follows second_degree ON second_degree.follower_id = mine.followed_id
           WHERE mine.follower_id = $1 AND second_degree.followed_id = p.user_id
        ) AS mutual_signal,
        EXISTS(SELECT 1 FROM follows mine WHERE mine.follower_id = $1 AND mine.followed_id = p.user_id) AS following_author,
        EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 AS age_hours
      FROM posts p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN likes l ON l.post_id = p.id
      LEFT JOIN comments c ON c.post_id = p.id
      LEFT JOIN affinity a ON a.author_id = p.user_id
      WHERE u.account_status='active'
        AND (p.visibility = 'public' OR p.user_id = $1)
        AND (p.user_id=$1 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=p.user_id))
        AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$1))
        AND NOT EXISTS(SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=p.user_id)
      GROUP BY p.id, u.id, a.score
    )
    SELECT *,
      (
        affinity_score * 2
        + interest_match * 12
        + CASE WHEN mutual_signal THEN 7 ELSE 0 END
        + CASE WHEN following_author THEN 5 ELSE 0 END
        + LEAST(18, likes_count * 1.5 + comments_count * 2.5)
        + GREATEST(0, 18 - LEAST(age_hours,18))
        - CASE WHEN own THEN 25 ELSE 0 END
      ) AS recommendation_score
    FROM scored
    ORDER BY recommendation_score DESC, created_at DESC, id DESC
    LIMIT 80
  `, [req.user.id]);
  const posts = rows.map(r => ({ ...normalizePost(r), recommendation_reason: recommendationReason(r) }));
  res.json(await enrichReposts(req.user.id, posts));
}));

app.get('/api/suggestions', auth, asyncRoute(async (req, res) => {
  const limit = Math.min(20, Math.max(1, Number(req.query.limit || 10)));
  const { rows } = await pool.query(`
    WITH viewer AS (
      SELECT LOWER(COALESCE(interests,'')) AS interests FROM users WHERE id = $1
    ), interactions AS (
      SELECT author_id, SUM(points)::numeric AS score
      FROM (
        SELECT p.user_id AS author_id, 3::numeric AS points FROM likes x JOIN posts p ON p.id=x.post_id WHERE x.user_id=$1
        UNION ALL
        SELECT p.user_id, 4::numeric FROM comments x JOIN posts p ON p.id=x.post_id WHERE x.user_id=$1
        UNION ALL
        SELECT p.user_id, 5::numeric FROM bookmarks x JOIN posts p ON p.id=x.post_id WHERE x.user_id=$1
      ) q GROUP BY author_id
    )
    SELECT u.id,u.username,u.name,u.bio,u.avatar,u.location,u.headline,u.interests,u.created_at,u.last_seen_at,u.account_private,
      FALSE AS following,
      EXISTS(SELECT 1 FROM follow_requests frq WHERE frq.follower_id=$1 AND frq.followed_id=u.id) AS follow_requested,
      (SELECT COUNT(*)::int FROM follows f WHERE f.followed_id=u.id) AS followers_count,
      COALESCE(i.score,0)::numeric AS interaction_score,
      (SELECT COUNT(*)::int
         FROM follows mine
         JOIN follows other ON other.follower_id=mine.followed_id AND other.followed_id=u.id
        WHERE mine.follower_id=$1) AS mutual_count,
      CASE WHEN EXISTS (
        SELECT 1 FROM regexp_split_to_table((SELECT interests FROM viewer), '\s*,\s*') AS term
         WHERE LENGTH(TRIM(term)) >= 2
           AND (
             LOWER(COALESCE(u.interests,'')) LIKE '%' || TRIM(term) || '%'
             OR LOWER(COALESCE(u.headline,'')) LIKE '%' || TRIM(term) || '%'
             OR LOWER(COALESCE(u.bio,'')) LIKE '%' || TRIM(term) || '%'
           )
      ) THEN 1 ELSE 0 END AS shared_interest
    FROM users u
    LEFT JOIN interactions i ON i.author_id=u.id
    WHERE u.id <> $1
      AND u.account_status='active'
      AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.followed_id=u.id)
      AND NOT EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=u.id) OR (bl.blocker_id=u.id AND bl.blocked_id=$1))
      AND NOT EXISTS (SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=u.id)
    ORDER BY
      (CASE WHEN EXISTS (
        SELECT 1 FROM regexp_split_to_table((SELECT interests FROM viewer), '\s*,\s*') AS term
         WHERE LENGTH(TRIM(term)) >= 2
           AND (
             LOWER(COALESCE(u.interests,'')) LIKE '%' || TRIM(term) || '%'
             OR LOWER(COALESCE(u.headline,'')) LIKE '%' || TRIM(term) || '%'
             OR LOWER(COALESCE(u.bio,'')) LIKE '%' || TRIM(term) || '%'
           )
      ) THEN 12 ELSE 0 END)
      + COALESCE(i.score,0) * 2
      + (SELECT COUNT(*)::int FROM follows mine JOIN follows other ON other.follower_id=mine.followed_id AND other.followed_id=u.id WHERE mine.follower_id=$1) * 5
      + LEAST(8,(SELECT COUNT(*)::int FROM follows f WHERE f.followed_id=u.id)) DESC,
      u.created_at DESC
    LIMIT $2
  `, [req.user.id, limit]);
  res.json(rows.map(r => ({ ...r, online:isOnline(r.id), recommendation_reason:peopleRecommendationReason(r) })));
}));

app.get('/api/discover', auth, asyncRoute(async (req, res) => {
  // Para ti: publicaciones públicas, con una pequeña priorización por interacción reciente.
  const { rows } = await pool.query(`
    SELECT
      p.id, p.user_id, p.text, p.media_id, p.media_type, p.source, p.visibility, p.created_at, p.edited_at, p.repost_of_id,
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
    WHERE u.account_status='active'
      AND (p.visibility = 'public' OR p.user_id = $1)
      AND (p.user_id=$1 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=p.user_id))
      AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$1))
      AND NOT EXISTS(SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=p.user_id)
    GROUP BY p.id, u.id
    ORDER BY ((COUNT(DISTINCT l.user_id) * 2) + COUNT(DISTINCT c.id)) DESC, p.created_at DESC
    LIMIT 80
  `, [req.user.id]);
  res.json(await enrichReposts(req.user.id, rows.map(normalizePost)));
}));

app.get('/api/bookmarks', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      p.id, p.user_id, p.text, p.media_id, p.media_type, p.source, p.visibility, p.created_at, p.edited_at, p.repost_of_id,
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
      AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$1))
      AND (p.user_id=$1 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=p.user_id))
    GROUP BY p.id, u.id, bk.created_at
    ORDER BY bk.created_at DESC
  `, [req.user.id]);
  res.json(await enrichReposts(req.user.id, rows.map(normalizePost)));
}));

app.post('/api/posts/:id/like', auth, asyncRoute(async (req, res) => {
  const postId = req.params.id;
  if (!(await canUserViewPost(postId,req.user.id))) return res.status(404).json({error:'Publicación no disponible'});
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
  if (!(await canUserViewPost(req.params.id,req.user.id))) return res.status(404).json({error:'Publicación no disponible'});
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
  if (!(await canUserViewPost(req.params.id,req.user.id))) return res.status(404).json({error:'Publicación no disponible'});
  const text = String(req.body.text || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: 'Comentario vacío' });
  const result = await withTransaction(async (client) => {
    const post = await client.query('SELECT id, user_id FROM posts WHERE id = $1', [req.params.id]);
    if (!post.rowCount) { const err = new Error('Publicación no encontrada'); err.status = 404; throw err; }
    const { rows } = await client.query('INSERT INTO comments (post_id, user_id, text) VALUES ($1, $2, $3) RETURNING id', [req.params.id, req.user.id, text]);
    await addNotification(client, { userId: post.rows[0].user_id, actorId: req.user.id, type: 'comment', postId: req.params.id, text });
    await notifyMentions(client, { text, actorId:req.user.id, postId:req.params.id });
    return rows[0];
  });
  res.json({ ok: true, id: result.id });
}));

app.get('/api/posts/:id/comments', auth, asyncRoute(async (req, res) => {
  if (!(await canUserViewPost(req.params.id,req.user.id))) return res.status(404).json({error:'Publicación no disponible'});
  const { rows } = await pool.query(`
    SELECT c.id, c.post_id, c.user_id, c.text, c.created_at, u.username, u.name, u.avatar,
           (c.user_id = $2) AS own
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = $1
      AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=c.user_id) OR (bl.blocker_id=c.user_id AND bl.blocked_id=$2))
    ORDER BY c.created_at ASC, c.id ASC
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
    SELECT u.id, u.username, u.name, u.bio, u.avatar, u.location, u.headline, u.interests, u.created_at, u.last_seen_at, u.account_private,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followed_id = u.id) AS following,
      (SELECT COUNT(*)::int FROM follows WHERE followed_id = u.id) AS followers_count,
      EXISTS(SELECT 1 FROM follow_requests frq WHERE frq.follower_id=$1 AND frq.followed_id=u.id) AS follow_requested,
      CASE
        WHEN EXISTS(SELECT 1 FROM friendships fr WHERE (fr.user1_id=$1 AND fr.user2_id=u.id) OR (fr.user1_id=u.id AND fr.user2_id=$1)) THEN 'friends'
        WHEN EXISTS(SELECT 1 FROM friend_requests fq WHERE fq.from_user_id=$1 AND fq.to_user_id=u.id AND fq.status='pending') THEN 'sent'
        WHEN EXISTS(SELECT 1 FROM friend_requests fq WHERE fq.from_user_id=u.id AND fq.to_user_id=$1 AND fq.status='pending') THEN 'received'
        ELSE 'none'
      END AS friendship_status
    FROM users u
    WHERE u.id <> $1
      AND u.account_status='active'
      AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=u.id) OR (bl.blocker_id=u.id AND bl.blocked_id=$1))
      AND ($2 = '%%' OR u.username ILIKE $2 OR u.name ILIKE $2 OR u.bio ILIKE $2)
    ORDER BY followers_count DESC, u.created_at DESC LIMIT 50
  `, [req.user.id, pattern]);
  res.json(rows.map(r => ({ ...r, online: isOnline(r.id) })));
}));

app.get('/api/users/:username', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.*,
      (SELECT COUNT(*)::int FROM follows WHERE followed_id = u.id) AS followers_count,
      (SELECT COUNT(*)::int FROM follows WHERE follower_id = u.id) AS following_count,
      (SELECT COUNT(*)::int FROM posts WHERE user_id = u.id) AS posts_count,
      (SELECT COUNT(*)::int FROM friendships WHERE user1_id = u.id OR user2_id = u.id) AS friends_count,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followed_id = u.id) AS following,
      EXISTS(SELECT 1 FROM follow_requests frq WHERE frq.follower_id=$1 AND frq.followed_id=u.id) AS follow_requested,
      EXISTS(SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=u.id) AS muted,
      EXISTS(SELECT 1 FROM blocks bl WHERE bl.blocker_id=$1 AND bl.blocked_id=u.id) AS blocked_by_me,
      EXISTS(SELECT 1 FROM blocks bl WHERE bl.blocker_id=u.id AND bl.blocked_id=$1) AS blocked_me,
      CASE
        WHEN u.id=$1 THEN 'self'
        WHEN EXISTS(SELECT 1 FROM friendships fr WHERE (fr.user1_id=$1 AND fr.user2_id=u.id) OR (fr.user1_id=u.id AND fr.user2_id=$1)) THEN 'friends'
        WHEN EXISTS(SELECT 1 FROM friend_requests fq WHERE fq.from_user_id=$1 AND fq.to_user_id=u.id AND fq.status='pending') THEN 'sent'
        WHEN EXISTS(SELECT 1 FROM friend_requests fq WHERE fq.from_user_id=u.id AND fq.to_user_id=$1 AND fq.status='pending') THEN 'received'
        ELSE 'none'
      END AS friendship_status,
      (SELECT fq.id FROM friend_requests fq WHERE fq.status='pending' AND ((fq.from_user_id=$1 AND fq.to_user_id=u.id) OR (fq.from_user_id=u.id AND fq.to_user_id=$1)) ORDER BY fq.created_at DESC LIMIT 1) AS friend_request_id,
      (u.id = $1) AS own
    FROM users u WHERE LOWER(u.username) = LOWER($2) AND u.account_status='active' LIMIT 1
  `, [req.user.id, req.params.username]);
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  const row = rows[0];
  if (row.blocked_me && !row.own) return res.status(404).json({ error:'Perfil no disponible' });
  const canMessage = row.own ? false : await canMessageUser(req.user.id,row.id);
  res.json({ ...safeUser(row), can_message:canMessage, followers_count: row.followers_count, following_count: row.following_count, posts_count: row.posts_count, friends_count: row.friends_count, following: Boolean(row.following), follow_requested:Boolean(row.follow_requested), muted:Boolean(row.muted), blocked_by_me:Boolean(row.blocked_by_me), friendship_status: row.friendship_status, friend_request_id: row.friend_request_id, own: Boolean(row.own), online: isOnline(row.id), last_seen_at: row.last_seen_at });
}));

app.get('/api/users/:username/posts', auth, asyncRoute(async (req, res) => {
  const found = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1', [req.params.username]);
  if (!found.rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(await postQuery(req.user.id, { mode: 'all', profileId: found.rows[0].id }));
}));

app.post('/api/users/:id/follow', auth, asyncRoute(async (req, res) => {
  const followedId = Number(req.params.id);
  const me = Number(req.user.id);
  if (!Number.isInteger(followedId) || followedId === me) return res.status(400).json({ error: 'No puedes seguirte' });
  const result = await withTransaction(async (client) => {
    const target = await client.query('SELECT id,account_private FROM users WHERE id=$1',[followedId]);
    if (!target.rowCount) { const err=new Error('Usuario no encontrado'); err.status=404; throw err; }
    await assertNotBlocked(me,followedId,client);
    const existing = await client.query('DELETE FROM follows WHERE follower_id=$1 AND followed_id=$2 RETURNING follower_id',[me,followedId]);
    if (existing.rowCount) return { following:false, requested:false, status:'none' };
    const pending = await client.query('SELECT id FROM follow_requests WHERE follower_id=$1 AND followed_id=$2',[me,followedId]);
    if (target.rows[0].account_private) {
      if (pending.rowCount) {
        await client.query('DELETE FROM follow_requests WHERE follower_id=$1 AND followed_id=$2',[me,followedId]);
        return { following:false, requested:false, status:'none' };
      }
      await client.query('INSERT INTO follow_requests (follower_id,followed_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[me,followedId]);
      await addNotification(client,{userId:followedId,actorId:me,type:'follow_request'});
      return { following:false, requested:true, status:'requested' };
    }
    if (pending.rowCount) await client.query('DELETE FROM follow_requests WHERE follower_id=$1 AND followed_id=$2',[me,followedId]);
    await client.query('INSERT INTO follows (follower_id,followed_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[me,followedId]);
    await addNotification(client,{userId:followedId,actorId:me,type:'follow'});
    return { following:true, requested:false, status:'following' };
  });
  res.json(result);
}));

// --- V0.9: privacidad, solicitudes de seguimiento y control --------------
app.get('/api/privacy', auth, asyncRoute(async (req,res)=>{
  const {rows}=await pool.query(`SELECT account_private,message_policy,
    (SELECT COUNT(*)::int FROM follow_requests WHERE followed_id=$1) AS follow_requests_count,
    (SELECT COUNT(*)::int FROM blocks WHERE blocker_id=$1) AS blocked_count,
    (SELECT COUNT(*)::int FROM mutes WHERE muter_id=$1) AS muted_count
    FROM users WHERE id=$1`,[req.user.id]);
  res.json(rows[0]);
}));

app.patch('/api/privacy', auth, asyncRoute(async (req,res)=>{
  const accountPrivate = req.body.account_private === undefined ? null : Boolean(req.body.account_private);
  const messagePolicy = req.body.message_policy === undefined ? null : String(req.body.message_policy);
  if (messagePolicy !== null && !['everyone','followers','friends','nobody'].includes(messagePolicy)) return res.status(400).json({error:'Privacidad de mensajes inválida'});
  const result=await withTransaction(async client=>{
    const {rows}=await client.query(`UPDATE users SET account_private=COALESCE($2,account_private), message_policy=COALESCE($3,message_policy) WHERE id=$1 RETURNING account_private,message_policy`,[req.user.id,accountPrivate,messagePolicy]);
    if (accountPrivate === false) {
      await client.query(`INSERT INTO follows(follower_id,followed_id) SELECT follower_id,followed_id FROM follow_requests WHERE followed_id=$1 ON CONFLICT DO NOTHING`,[req.user.id]);
      await client.query('DELETE FROM follow_requests WHERE followed_id=$1',[req.user.id]);
    }
    return rows[0];
  });
  res.json(result);
}));

app.get('/api/follow-requests', auth, asyncRoute(async (req,res)=>{
  const {rows}=await pool.query(`SELECT fr.id,fr.follower_id AS user_id,fr.created_at,u.username,u.name,u.avatar,u.headline,u.last_seen_at
    FROM follow_requests fr JOIN users u ON u.id=fr.follower_id
    WHERE fr.followed_id=$1
      AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=u.id) OR (bl.blocker_id=u.id AND bl.blocked_id=$1))
    ORDER BY fr.created_at DESC LIMIT 100`,[req.user.id]);
  res.json(rows.map(r=>({...r,online:isOnline(r.user_id)})));
}));

app.post('/api/follow-requests/:id/accept', auth, asyncRoute(async (req,res)=>{
  await withTransaction(async client=>{
    const {rows}=await client.query('DELETE FROM follow_requests WHERE id=$1 AND followed_id=$2 RETURNING follower_id',[req.params.id,req.user.id]);
    if(!rows[0]){const e=new Error('Solicitud no encontrada');e.status=404;throw e;}
    await assertNotBlocked(req.user.id,rows[0].follower_id,client);
    await client.query('INSERT INTO follows (follower_id,followed_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[rows[0].follower_id,req.user.id]);
    await addNotification(client,{userId:rows[0].follower_id,actorId:req.user.id,type:'follow_accept'});
  });
  res.json({ok:true});
}));

app.post('/api/follow-requests/:id/decline', auth, asyncRoute(async (req,res)=>{
  const {rows}=await pool.query('DELETE FROM follow_requests WHERE id=$1 AND followed_id=$2 RETURNING id',[req.params.id,req.user.id]);
  if(!rows[0]) return res.status(404).json({error:'Solicitud no encontrada'});
  res.json({ok:true});
}));

app.post('/api/users/:id/mute', auth, asyncRoute(async (req,res)=>{
  const target=Number(req.params.id); if(target===Number(req.user.id)) return res.status(400).json({error:'No puedes silenciarte'});
  await assertNotBlocked(req.user.id,target);
  const deleted=await pool.query('DELETE FROM mutes WHERE muter_id=$1 AND muted_id=$2 RETURNING muter_id',[req.user.id,target]);
  if(deleted.rowCount) return res.json({muted:false});
  await pool.query('INSERT INTO mutes (muter_id,muted_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[req.user.id,target]);
  res.json({muted:true});
}));

app.post('/api/users/:id/block', auth, asyncRoute(async (req,res)=>{
  const target=Number(req.params.id); if(target===Number(req.user.id)) return res.status(400).json({error:'No puedes bloquearte'});
  const exists=await pool.query('SELECT 1 FROM users WHERE id=$1',[target]); if(!exists.rowCount) return res.status(404).json({error:'Usuario no encontrado'});
  const result=await withTransaction(async client=>{
    const deleted=await client.query('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2 RETURNING blocker_id',[req.user.id,target]);
    if(deleted.rowCount) return {blocked:false};
    await client.query('INSERT INTO blocks (blocker_id,blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[req.user.id,target]);
    await client.query('DELETE FROM mutes WHERE muter_id=$1 AND muted_id=$2',[req.user.id,target]);
    await client.query('DELETE FROM follows WHERE (follower_id=$1 AND followed_id=$2) OR (follower_id=$2 AND followed_id=$1)',[req.user.id,target]);
    await client.query('DELETE FROM follow_requests WHERE (follower_id=$1 AND followed_id=$2) OR (follower_id=$2 AND followed_id=$1)',[req.user.id,target]);
    const [a,b]=friendshipPair(req.user.id,target);
    await client.query('DELETE FROM friendships WHERE user1_id=$1 AND user2_id=$2',[a,b]);
    await client.query("DELETE FROM friend_requests WHERE status='pending' AND ((from_user_id=$1 AND to_user_id=$2) OR (from_user_id=$2 AND to_user_id=$1))",[req.user.id,target]);
    return {blocked:true};
  });
  res.json(result);
}));

app.get('/api/blocked', auth, asyncRoute(async (req,res)=>{
  const {rows}=await pool.query('SELECT u.id,u.username,u.name,u.avatar,b.created_at FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=$1 ORDER BY b.created_at DESC',[req.user.id]);
  res.json(rows);
}));
app.get('/api/muted', auth, asyncRoute(async (req,res)=>{
  const {rows}=await pool.query('SELECT u.id,u.username,u.name,u.avatar,m.created_at FROM mutes m JOIN users u ON u.id=m.muted_id WHERE m.muter_id=$1 ORDER BY m.created_at DESC',[req.user.id]);
  res.json(rows);
}));

app.post('/api/reports', auth, asyncRoute(async (req,res)=>{
  const targetUserId=req.body.target_user_id?Number(req.body.target_user_id):null;
  const postId=req.body.post_id?Number(req.body.post_id):null;
  const reason=String(req.body.reason||'').trim();
  const details=String(req.body.details||'').trim().slice(0,1000);
  const allowed=['spam','harassment','impersonation','nudity','violence','hate','scam','other'];
  if(!targetUserId&&!postId) return res.status(400).json({error:'Falta el contenido a denunciar'});
  if(!allowed.includes(reason)) return res.status(400).json({error:'Motivo inválido'});
  let resolvedTarget=targetUserId;
  if(postId){ const post=await pool.query('SELECT user_id FROM posts WHERE id=$1',[postId]); if(!post.rowCount) return res.status(404).json({error:'Publicación no encontrada'}); resolvedTarget=resolvedTarget||Number(post.rows[0].user_id); }
  if(resolvedTarget){ const usr=await pool.query('SELECT 1 FROM users WHERE id=$1',[resolvedTarget]); if(!usr.rowCount) return res.status(404).json({error:'Usuario no encontrado'}); }
  if(resolvedTarget===Number(req.user.id)) return res.status(400).json({error:'No puedes denunciar tu propio contenido'});
  const {rows}=await pool.query('INSERT INTO reports (reporter_id,target_user_id,post_id,reason,details) VALUES ($1,$2,$3,$4,$5) RETURNING id',[req.user.id,resolvedTarget,postId,reason,details]);
  res.json({ok:true,id:rows[0].id});
}));

// --- V0.6: Amigos y solicitudes -----------------------------------------
function friendshipPair(a, b) {
  const x = Number(a), y = Number(b);
  return x < y ? [x, y] : [y, x];
}

app.get('/api/friends', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id,u.username,u.name,u.avatar,u.bio,u.last_seen_at,fr.created_at
      FROM friendships fr
      JOIN users u ON u.id = CASE WHEN fr.user1_id=$1 THEN fr.user2_id ELSE fr.user1_id END
     WHERE fr.user1_id=$1 OR fr.user2_id=$1
     ORDER BY u.name ASC
  `, [req.user.id]);
  res.json(rows.map(r => ({ ...r, online: isOnline(r.id) })));
}));

app.get('/api/friends/requests', auth, asyncRoute(async (req, res) => {
  const incoming = await pool.query(`
    SELECT fq.id,fq.created_at,u.id AS user_id,u.username,u.name,u.avatar,u.bio,u.last_seen_at
      FROM friend_requests fq JOIN users u ON u.id=fq.from_user_id
     WHERE fq.to_user_id=$1 AND fq.status='pending' ORDER BY fq.created_at DESC
  `,[req.user.id]);
  const outgoing = await pool.query(`
    SELECT fq.id,fq.created_at,u.id AS user_id,u.username,u.name,u.avatar,u.bio,u.last_seen_at
      FROM friend_requests fq JOIN users u ON u.id=fq.to_user_id
     WHERE fq.from_user_id=$1 AND fq.status='pending' ORDER BY fq.created_at DESC
  `,[req.user.id]);
  res.json({
    incoming: incoming.rows.map(r=>({ ...r, online:isOnline(r.user_id) })),
    outgoing: outgoing.rows.map(r=>({ ...r, online:isOnline(r.user_id) }))
  });
}));

app.post('/api/friends/request/:userId', auth, asyncRoute(async (req,res)=>{
  const otherId=Number(req.params.userId), myId=Number(req.user.id);
  if(!Number.isInteger(otherId)||otherId===myId) return res.status(400).json({error:'Usuario inválido'});
  const exists=await pool.query('SELECT 1 FROM users WHERE id=$1',[otherId]);
  if(!exists.rowCount) return res.status(404).json({error:'Usuario no encontrado'});
  await assertNotBlocked(myId,otherId);
  const [a,b]=friendshipPair(myId,otherId);
  const friendship=await pool.query('SELECT 1 FROM friendships WHERE user1_id=$1 AND user2_id=$2',[a,b]);
  if(friendship.rowCount) return res.json({status:'friends'});
  const incoming=await pool.query(`SELECT id FROM friend_requests WHERE from_user_id=$1 AND to_user_id=$2 AND status='pending' LIMIT 1`,[otherId,myId]);
  if(incoming.rowCount) return res.json({status:'received',request_id:incoming.rows[0].id});
  const outgoing=await pool.query(`SELECT id FROM friend_requests WHERE from_user_id=$1 AND to_user_id=$2 AND status='pending' LIMIT 1`,[myId,otherId]);
  if(outgoing.rowCount){
    await pool.query(`UPDATE friend_requests SET status='declined',updated_at=NOW() WHERE id=$1`,[outgoing.rows[0].id]);
    return res.json({status:'none'});
  }
  const result=await withTransaction(async client=>{
    const {rows}=await client.query(`INSERT INTO friend_requests(from_user_id,to_user_id) VALUES($1,$2) RETURNING id`,[myId,otherId]);
    await addNotification(client,{userId:otherId,actorId:myId,type:'friend_request'});
    return rows[0];
  });
  res.json({status:'sent',request_id:result.id});
}));

app.post('/api/friends/requests/:id/accept', auth, asyncRoute(async (req,res)=>{
  const result=await withTransaction(async client=>{
    const {rows}=await client.query(`SELECT * FROM friend_requests WHERE id=$1 AND to_user_id=$2 AND status='pending' FOR UPDATE`,[req.params.id,req.user.id]);
    if(!rows[0]){const e=new Error('Solicitud no encontrada');e.status=404;throw e;}
    const request=rows[0], [a,b]=friendshipPair(request.from_user_id,request.to_user_id);
    await client.query(`INSERT INTO friendships(user1_id,user2_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[a,b]);
    await client.query(`UPDATE friend_requests SET status='accepted',updated_at=NOW() WHERE id=$1`,[request.id]);
    await addNotification(client,{userId:request.from_user_id,actorId:req.user.id,type:'friend_accept'});
    return request;
  });
  res.json({ok:true,status:'friends',user_id:result.from_user_id});
}));

app.post('/api/friends/requests/:id/decline', auth, asyncRoute(async (req,res)=>{
  const {rows}=await pool.query(`UPDATE friend_requests SET status='declined',updated_at=NOW() WHERE id=$1 AND (to_user_id=$2 OR from_user_id=$2) AND status='pending' RETURNING id`,[req.params.id,req.user.id]);
  if(!rows[0]) return res.status(404).json({error:'Solicitud no encontrada'});
  res.json({ok:true});
}));

app.delete('/api/friends/:userId', auth, asyncRoute(async (req,res)=>{
  const [a,b]=friendshipPair(req.user.id,req.params.userId);
  const {rows}=await pool.query(`DELETE FROM friendships WHERE user1_id=$1 AND user2_id=$2 RETURNING user1_id`,[a,b]);
  if(!rows[0]) return res.status(404).json({error:'Amistad no encontrada'});
  res.json({ok:true});
}));

app.get('/api/search', auth, asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (!q) return res.json({ users: [], posts: [] });
  const personTerm = q.startsWith('@') ? q.slice(1) : q;
  const pattern = `%${personTerm}%`;
  const users = await pool.query(`
    SELECT u.id, u.username, u.name, u.bio, u.avatar, u.headline, u.interests, u.last_seen_at, u.account_private,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followed_id = u.id) AS following,
      EXISTS(SELECT 1 FROM follow_requests frq WHERE frq.follower_id=$1 AND frq.followed_id=u.id) AS follow_requested,
      CASE
        WHEN EXISTS(SELECT 1 FROM friendships fr WHERE (fr.user1_id=$1 AND fr.user2_id=u.id) OR (fr.user1_id=u.id AND fr.user2_id=$1)) THEN 'friends'
        WHEN EXISTS(SELECT 1 FROM friend_requests fq WHERE fq.from_user_id=$1 AND fq.to_user_id=u.id AND fq.status='pending') THEN 'sent'
        WHEN EXISTS(SELECT 1 FROM friend_requests fq WHERE fq.from_user_id=u.id AND fq.to_user_id=$1 AND fq.status='pending') THEN 'received'
        ELSE 'none'
      END AS friendship_status
    FROM users u WHERE u.id <> $1
      AND u.account_status='active'
      AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=u.id) OR (bl.blocker_id=u.id AND bl.blocked_id=$1))
      AND (u.username ILIKE $2 OR u.name ILIKE $2 OR u.bio ILIKE $2 OR u.headline ILIKE $2 OR u.interests ILIKE $2)
    ORDER BY u.name LIMIT 20
  `, [req.user.id, pattern]);
  const posts = await postQuery(req.user.id, { mode: 'all', search: q.startsWith('@') ? personTerm : q, limit: 30 });
  res.json({ users: users.rows.map(r => ({ ...r, online: isOnline(r.id) })), posts });
}));

app.get('/api/trending', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    WITH tagged AS (
      SELECT p.id AS post_id, p.user_id, LOWER(rx.tag_match[1]) AS tag
      FROM posts p
      JOIN users u ON u.id=p.user_id
      CROSS JOIN LATERAL regexp_matches(p.text, '#[[:alnum:]_áéíóúñü]+', 'g') AS rx(tag_match)
      WHERE p.created_at > NOW() - INTERVAL '7 days' AND p.visibility = 'public'
        AND (p.user_id=$1 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=p.user_id))
        AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$1))
        AND NOT EXISTS(SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=p.user_id)
    ), engagement AS (
      SELECT p.id AS post_id,
             COUNT(DISTINCT l.user_id)::int AS likes,
             COUNT(DISTINCT c.id)::int AS comments
      FROM posts p
      LEFT JOIN likes l ON l.post_id=p.id
      LEFT JOIN comments c ON c.post_id=p.id
      GROUP BY p.id
    )
    SELECT t.tag,
           COUNT(DISTINCT t.post_id)::int AS count,
           COUNT(DISTINCT t.user_id)::int AS authors,
           COALESCE(SUM(e.likes + (e.comments * 2)),0)::int AS engagement,
           (COUNT(DISTINCT t.post_id) * 4 + COUNT(DISTINCT t.user_id) * 2 + COALESCE(SUM(e.likes + (e.comments * 2)),0))::int AS score
      FROM tagged t
      LEFT JOIN engagement e ON e.post_id=t.post_id
     GROUP BY t.tag
     ORDER BY score DESC, count DESC, t.tag ASC
     LIMIT 12
  `,[req.user.id]);
  res.json(rows);
}));

app.get('/api/notifications', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT n.id, n.type, n.post_id, n.text, n.read_at, n.created_at,
           a.id AS actor_id, a.username, a.name, a.avatar
    FROM notifications n
    LEFT JOIN users a ON a.id = n.actor_id
    WHERE n.user_id = $1
      AND (n.actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=n.actor_id) OR (bl.blocker_id=n.actor_id AND bl.blocked_id=$1)))
    ORDER BY n.created_at DESC LIMIT 100
  `, [req.user.id]);
  res.json(rows);
}));

app.post('/api/notifications/read', auth, asyncRoute(async (req, res) => {
  await pool.query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
}));


// --- V0.5: Stories ---------------------------------------------------------
app.get('/api/stories', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.id, s.user_id, s.media_id, s.media_type, s.text, s.visibility, s.created_at, s.expires_at,
           u.username, u.name, u.avatar,
           EXISTS(SELECT 1 FROM story_views sv WHERE sv.story_id = s.id AND sv.user_id = $1) AS viewed,
           (s.user_id = $1) AS own,
           (SELECT COUNT(*)::int FROM story_views sv2 WHERE sv2.story_id = s.id) AS views_count,
           EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followed_id = s.user_id) AS following
      FROM stories s
      JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > NOW()
       AND u.account_status='active'
       AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=s.user_id) OR (bl.blocker_id=s.user_id AND bl.blocked_id=$1))
       AND NOT EXISTS(SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=s.user_id)
       AND (s.user_id=$1 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=s.user_id))
       AND (
         s.visibility = 'public' OR s.user_id = $1 OR
         (s.visibility = 'followers' AND EXISTS(
           SELECT 1 FROM follows vf WHERE vf.follower_id = $1 AND vf.followed_id = s.user_id
         ))
       )
     ORDER BY (s.user_id = $1) DESC, following DESC, s.created_at ASC
     LIMIT 200
  `, [req.user.id]);
  res.json(rows.map(r => ({ ...r, media_url: `/media/${r.media_id}`, viewed: Boolean(r.viewed), own: Boolean(r.own), following: Boolean(r.following), views_count: Number(r.views_count || 0) })));
}));

app.post('/api/stories', auth, asyncRoute(async (req, res) => {
  const mediaId = req.body.media_id ? String(req.body.media_id) : '';
  const text = String(req.body.text || '').trim().slice(0, 500);
  const visibility = ['public','followers'].includes(req.body.visibility) ? req.body.visibility : 'public';
  if (!mediaId) return res.status(400).json({ error: 'Una Story necesita foto o vídeo' });
  const media = await pool.query('SELECT id, mime_type FROM media WHERE id = $1 AND user_id = $2', [mediaId, req.user.id]);
  if (!media.rowCount) return res.status(400).json({ error: 'Archivo multimedia inválido' });
  const mediaType = media.rows[0].mime_type.startsWith('video/') ? 'video' : 'image';
  const { rows } = await pool.query(`
    INSERT INTO stories (user_id, media_id, media_type, text, visibility)
    VALUES ($1,$2,$3,$4,$5) RETURNING id, expires_at
  `, [req.user.id, mediaId, mediaType, text, visibility]);
  res.json(rows[0]);
}));

app.post('/api/stories/:id/view', auth, asyncRoute(async (req, res) => {
  const story = await pool.query(`
    SELECT s.id, s.user_id, s.visibility
      FROM stories s JOIN users u ON u.id=s.user_id
     WHERE s.id = $1
       AND u.account_status='active'
       AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=s.user_id) OR (bl.blocker_id=s.user_id AND bl.blocked_id=$2))
       AND (s.user_id=$2 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$2 AND pf.followed_id=s.user_id)) AND s.expires_at > NOW()
       AND (s.visibility = 'public' OR s.user_id = $2 OR
         (s.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.followed_id = s.user_id)))
  `, [req.params.id, req.user.id]);
  if (!story.rowCount) return res.status(404).json({ error: 'Story no disponible' });
  await pool.query(`INSERT INTO story_views (story_id, user_id) VALUES ($1,$2)
                    ON CONFLICT (story_id,user_id) DO UPDATE SET viewed_at = NOW()`, [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

app.get('/api/stories/:id/viewers', auth, asyncRoute(async (req, res) => {
  const own = await pool.query('SELECT 1 FROM stories WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!own.rowCount) return res.status(403).json({ error: 'No puedes ver estas visualizaciones' });
  const { rows } = await pool.query(`
    SELECT u.id, u.username, u.name, u.avatar, sv.viewed_at
      FROM story_views sv JOIN users u ON u.id = sv.user_id
     WHERE sv.story_id = $1 ORDER BY sv.viewed_at DESC LIMIT 200
  `, [req.params.id]);
  res.json(rows);
}));

app.delete('/api/stories/:id', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM stories WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Story no encontrada' });
  res.json({ ok: true });
}));

// --- V0.5: Reels -----------------------------------------------------------
app.get('/api/reels', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT p.id, p.user_id, p.text, p.media_id, p.media_type, p.source, p.visibility, p.created_at, p.edited_at, p.repost_of_id,
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
     WHERE p.media_type = 'video'
       AND u.account_status='active'
       AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$1))
       AND NOT EXISTS(SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=p.user_id)
       AND (p.user_id=$1 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=p.user_id))
       AND (p.visibility = 'public' OR p.user_id = $1 OR
         (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows vf WHERE vf.follower_id = $1 AND vf.followed_id = p.user_id)))
     GROUP BY p.id, u.id
     ORDER BY ((COUNT(DISTINCT l.user_id) * 2) + COUNT(DISTINCT c.id)) DESC, p.created_at DESC
     LIMIT 80
  `, [req.user.id]);
  res.json(await enrichReposts(req.user.id, rows.map(normalizePost)));
}));

// --- V0.6: Mensajes privados en tiempo real -------------------------------
async function requireConversationMember(conversationId, userId) {
  const { rows } = await pool.query(`SELECT * FROM conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)`, [conversationId, userId]);
  if (!rows[0]) { const err = new Error('Conversación no encontrada'); err.status = 404; throw err; }
  return rows[0];
}

function conversationOtherId(conversation, userId) {
  return Number(conversation.user1_id) === Number(userId) ? Number(conversation.user2_id) : Number(conversation.user1_id);
}

async function canUserViewPost(postId, viewerId) {
  const { rows } = await pool.query(`
    SELECT p.id FROM posts p JOIN users u ON u.id=p.user_id
     WHERE p.id=$1
       AND u.account_status='active'
       AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$2))
       AND (p.user_id=$2 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$2 AND pf.followed_id=p.user_id))
       AND (p.visibility='public' OR p.user_id=$2 OR
       (p.visibility='followers' AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.followed_id=p.user_id)))
     LIMIT 1
  `,[postId,viewerId]);
  return Boolean(rows[0]);
}

app.post('/api/conversations/direct/:userId', auth, asyncRoute(async (req, res) => {
  const otherId = Number(req.params.userId);
  const myId = Number(req.user.id);
  if (!Number.isInteger(otherId) || otherId === myId) return res.status(400).json({ error: 'Usuario inválido' });
  const exists = await pool.query('SELECT 1 FROM users WHERE id = $1', [otherId]);
  if (!exists.rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
  await assertNotBlocked(myId,otherId);
  if (!(await canMessageUser(myId,otherId))) return res.status(403).json({error:'Esta persona no acepta mensajes tuyos'});
  const a = Math.min(myId, otherId), b = Math.max(myId, otherId);
  const { rows } = await pool.query(`
    INSERT INTO conversations (user1_id, user2_id) VALUES ($1,$2)
    ON CONFLICT (user1_id,user2_id) DO UPDATE SET updated_at = conversations.updated_at
    RETURNING id
  `, [a,b]);
  await pool.query(`INSERT INTO conversation_reads (conversation_id,user_id,last_read_at) VALUES ($1,$2,NOW()) ON CONFLICT DO NOTHING`, [rows[0].id, myId]);
  res.json({ id: rows[0].id });
}));

app.get('/api/conversations', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT c.id, c.created_at, c.updated_at,
           u.id AS other_id, u.username, u.name, u.avatar, u.last_seen_at,
           lm.id AS last_message_id, lm.text AS last_message, lm.media_type AS last_media_type,
           lm.shared_post_id AS last_shared_post_id,
           lm.sender_id AS last_sender_id, lm.created_at AS last_message_at,
           (SELECT COUNT(*)::int FROM messages um
             WHERE um.conversation_id = c.id AND um.sender_id <> $1
               AND um.created_at > COALESCE(cr.last_read_at, 'epoch'::timestamptz)) AS unread_count
      FROM conversations c
      JOIN users u ON u.id = CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END
      LEFT JOIN conversation_reads cr ON cr.conversation_id = c.id AND cr.user_id = $1
      LEFT JOIN LATERAL (
        SELECT m.id, m.text, m.media_type, m.shared_post_id, m.sender_id, m.created_at
          FROM messages m WHERE m.conversation_id = c.id
         ORDER BY m.created_at DESC, m.id DESC LIMIT 1
      ) lm ON TRUE
     WHERE (c.user1_id = $1 OR c.user2_id = $1)
       AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=u.id) OR (bl.blocker_id=u.id AND bl.blocked_id=$1))
     ORDER BY COALESCE(lm.created_at, c.updated_at) DESC
     LIMIT 100
  `, [req.user.id]);
  res.json(rows.map(r => ({ ...r, unread_count: Number(r.unread_count || 0), online: isOnline(r.other_id) })));
}));

app.get('/api/conversations/:id/messages', auth, asyncRoute(async (req, res) => {
  await requireConversationMember(req.params.id, req.user.id);
  await pool.query(`
    INSERT INTO conversation_reads (conversation_id,user_id,last_read_at) VALUES ($1,$2,NOW())
    ON CONFLICT (conversation_id,user_id) DO UPDATE SET last_read_at = NOW()
  `, [req.params.id, req.user.id]);
  const { rows } = await pool.query(`
    SELECT * FROM (
      SELECT m.id, m.conversation_id, m.sender_id, m.text, m.media_id, m.media_type, m.reply_to_id, m.shared_post_id, m.created_at,
             u.username, u.name, u.avatar, (m.sender_id = $2) AS own,
             rm.text AS reply_text, rm.media_type AS reply_media_type, ru.name AS reply_name, ru.username AS reply_username,
             CASE WHEN sp.id IS NOT NULL AND (
               (sp.user_id=$2 OR NOT spu.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$2 AND pf.followed_id=sp.user_id))
               AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=sp.user_id) OR (bl.blocker_id=sp.user_id AND bl.blocked_id=$2))
               AND (sp.visibility='public' OR sp.user_id=$2 OR
               (sp.visibility='followers' AND EXISTS(SELECT 1 FROM follows sf WHERE sf.follower_id=$2 AND sf.followed_id=sp.user_id)))
             ) THEN sp.id END AS shared_visible_id,
             CASE WHEN sp.id IS NOT NULL AND (
               (sp.user_id=$2 OR NOT spu.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$2 AND pf.followed_id=sp.user_id))
               AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=sp.user_id) OR (bl.blocker_id=sp.user_id AND bl.blocked_id=$2))
               AND (sp.visibility='public' OR sp.user_id=$2 OR
               (sp.visibility='followers' AND EXISTS(SELECT 1 FROM follows sf WHERE sf.follower_id=$2 AND sf.followed_id=sp.user_id)))
             ) THEN sp.text ELSE NULL END AS shared_text,
             CASE WHEN sp.id IS NOT NULL AND (
               (sp.user_id=$2 OR NOT spu.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$2 AND pf.followed_id=sp.user_id))
               AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=sp.user_id) OR (bl.blocker_id=sp.user_id AND bl.blocked_id=$2))
               AND (sp.visibility='public' OR sp.user_id=$2 OR
               (sp.visibility='followers' AND EXISTS(SELECT 1 FROM follows sf WHERE sf.follower_id=$2 AND sf.followed_id=sp.user_id)))
             ) THEN sp.media_id ELSE NULL END AS shared_media_id,
             CASE WHEN sp.id IS NOT NULL AND (
               (sp.user_id=$2 OR NOT spu.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$2 AND pf.followed_id=sp.user_id))
               AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=sp.user_id) OR (bl.blocker_id=sp.user_id AND bl.blocked_id=$2))
               AND (sp.visibility='public' OR sp.user_id=$2 OR
               (sp.visibility='followers' AND EXISTS(SELECT 1 FROM follows sf WHERE sf.follower_id=$2 AND sf.followed_id=sp.user_id)))
             ) THEN sp.media_type ELSE NULL END AS shared_media_type,
             spu.username AS shared_username, spu.name AS shared_name, spu.avatar AS shared_avatar
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        LEFT JOIN messages rm ON rm.id=m.reply_to_id AND rm.conversation_id=m.conversation_id
        LEFT JOIN users ru ON ru.id=rm.sender_id
        LEFT JOIN posts sp ON sp.id=m.shared_post_id
        LEFT JOIN users spu ON spu.id=sp.user_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC, m.id DESC LIMIT 150
    ) x ORDER BY created_at ASC, id ASC
  `, [req.params.id, req.user.id]);
  res.json(rows.map(r => ({
    id:r.id, conversation_id:r.conversation_id, sender_id:r.sender_id, text:r.text, media_id:r.media_id, media_type:r.media_type,
    media_url:r.media_id ? `/media/${r.media_id}` : '', created_at:r.created_at, username:r.username, name:r.name, avatar:r.avatar, own:Boolean(r.own),
    reply: r.reply_to_id ? { id:r.reply_to_id, name:r.reply_name, username:r.reply_username, text:r.reply_text || '', media_type:r.reply_media_type || 'none' } : null,
    shared_post: r.shared_visible_id ? { id:r.shared_visible_id, text:r.shared_text || '', media_type:r.shared_media_type || 'none', media_url:r.shared_media_id ? `/media/${r.shared_media_id}` : '', username:r.shared_username, name:r.shared_name, avatar:r.shared_avatar } : (r.shared_post_id ? { unavailable:true } : null)
  })));
}));

app.post('/api/conversations/:id/messages', auth, asyncRoute(async (req, res) => {
  const conversation = await requireConversationMember(req.params.id, req.user.id);
  const otherId = conversationOtherId(conversation, req.user.id);
  await assertNotBlocked(req.user.id,otherId);
  if (!(await canMessageUser(req.user.id,otherId))) return res.status(403).json({error:'Esta persona no acepta mensajes tuyos'});
  const text = String(req.body.text || '').trim().slice(0, 4000);
  const mediaId = req.body.media_id ? String(req.body.media_id) : null;
  const replyToId = req.body.reply_to_id ? Number(req.body.reply_to_id) : null;
  const sharedPostId = req.body.shared_post_id ? Number(req.body.shared_post_id) : null;
  let mediaType = 'none';
  if (mediaId) {
    const media = await pool.query('SELECT id,mime_type FROM media WHERE id = $1 AND user_id = $2', [mediaId, req.user.id]);
    if (!media.rowCount) return res.status(400).json({ error: 'Archivo multimedia inválido' });
    mediaType = media.rows[0].mime_type.startsWith('video/') ? 'video' : 'image';
  }
  if (replyToId) {
    const reply = await pool.query('SELECT 1 FROM messages WHERE id=$1 AND conversation_id=$2',[replyToId,req.params.id]);
    if(!reply.rowCount) return res.status(400).json({error:'Respuesta inválida'});
  }
  if (sharedPostId) {
    const [senderCanView, receiverCanView] = await Promise.all([canUserViewPost(sharedPostId, req.user.id), canUserViewPost(sharedPostId, otherId)]);
    if (!senderCanView || !receiverCanView) return res.status(400).json({ error:'Esta publicación no puede compartirse con esa persona por su privacidad' });
  }
  if (!text && !mediaId && !sharedPostId) return res.status(400).json({ error: 'El mensaje está vacío' });
  const { rows } = await pool.query(`
    INSERT INTO messages (conversation_id,sender_id,text,media_id,media_type,reply_to_id,shared_post_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,created_at
  `, [req.params.id, req.user.id, text, mediaId, mediaType, replyToId, sharedPostId]);
  await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [req.params.id]);
  await pool.query(`INSERT INTO conversation_reads (conversation_id,user_id,last_read_at) VALUES ($1,$2,NOW())
                    ON CONFLICT (conversation_id,user_id) DO UPDATE SET last_read_at = NOW()`, [req.params.id, req.user.id]);
  io.to(`user:${otherId}`).emit('message:new', { conversationId:Number(req.params.id), messageId:Number(rows[0].id), senderId:Number(req.user.id), text:text.slice(0,160), hasMedia:Boolean(mediaId), sharedPostId:sharedPostId || null });
  res.json(rows[0]);
}));


// --- V1.0: onboarding, cuenta y administración -----------------------------
app.post('/api/onboarding', auth, asyncRoute(async (req, res) => {
  const headline = String(req.body.headline || '').trim().slice(0, 140);
  const interests = String(req.body.interests || '').trim().slice(0, 500);
  const location = String(req.body.location || '').trim().slice(0, 120);
  const avatar = req.body.avatar !== undefined ? String(req.body.avatar || '').trim().slice(0, 2000) : null;
  const cover = req.body.cover !== undefined ? String(req.body.cover || '').trim().slice(0, 2000) : null;
  const { rows } = await pool.query(`
    UPDATE users SET
      headline=$2, interests=$3, location=$4,
      avatar=COALESCE($5,avatar), cover=COALESCE($6,cover),
      onboarding_completed=TRUE
    WHERE id=$1 RETURNING *
  `, [req.user.id, headline, interests, location, avatar, cover]);
  res.json(safeUser(rows[0], true));
}));

app.post('/api/account/accept-terms', auth, asyncRoute(async (req, res) => {
  if (req.body.age_confirmed !== true || req.body.terms_accepted !== true) {
    return res.status(400).json({ error: 'Debes confirmar que tienes 18 años y aceptar los Términos de Uso' });
  }
  await pool.query(`
    UPDATE users
       SET age_confirmed_at = COALESCE(age_confirmed_at, NOW()),
           terms_accepted_at = NOW(),
           terms_version = $2
     WHERE id = $1
  `, [req.user.id, CURRENT_TERMS_VERSION]);
  res.json({ ok:true, terms_version:CURRENT_TERMS_VERSION });
}));

app.post('/api/account/password', auth, asyncRoute(async (req, res) => {
  const currentPassword = String(req.body.current_password || '');
  const newPassword = String(req.body.new_password || '');
  if (newPassword.length < 8) return res.status(400).json({ error:'La nueva contraseña debe tener al menos 8 caracteres' });
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) return res.status(400).json({ error:'La contraseña actual no es correcta' });
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash=$2 WHERE id=$1', [req.user.id, hash]);
  res.json({ ok:true });
}));

app.delete('/api/account', auth, asyncRoute(async (req, res) => {
  const password = String(req.body.password || '');
  const confirmation = String(req.body.confirmation || '').trim().toUpperCase();
  if (confirmation !== 'ELIMINAR') return res.status(400).json({ error:'Escribe ELIMINAR para confirmar' });
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(400).json({ error:'La contraseña no es correcta' });
  await pool.query('DELETE FROM users WHERE id=$1', [req.user.id]);
  res.json({ ok:true });
}));

app.get('/api/admin/stats', auth, adminOnly, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM users WHERE account_status='suspended') AS suspended_users,
      (SELECT COUNT(*)::int FROM posts) AS posts,
      (SELECT COUNT(*)::int FROM comments) AS comments,
      (SELECT COUNT(*)::int FROM reports WHERE status='open') AS open_reports,
      (SELECT COUNT(*)::int FROM reports WHERE status='reviewing') AS reviewing_reports,
      (SELECT COUNT(*)::int FROM reports WHERE status='closed') AS closed_reports,
      (SELECT COUNT(*)::int FROM users WHERE created_at >= NOW()-INTERVAL '7 days') AS new_users_7d,
      (SELECT COUNT(*)::int FROM posts WHERE created_at >= NOW()-INTERVAL '7 days') AS new_posts_7d
  `);
  res.json(rows[0]);
}));

app.get('/api/admin/reports', auth, adminOnly, asyncRoute(async (req, res) => {
  const status = String(req.query.status || 'open');
  const allowed = ['open','reviewing','closed','all'];
  if (!allowed.includes(status)) return res.status(400).json({ error:'Estado no válido' });
  const params = [];
  let where = '';
  if (status !== 'all') { params.push(status); where = `WHERE r.status=$1`; }
  const { rows } = await pool.query(`
    SELECT r.*,
      rep.username AS reporter_username, rep.name AS reporter_name,
      target.username AS target_username, target.name AS target_name, target.account_status AS target_status,
      p.text AS post_text, p.media_type AS post_media_type,
      reviewer.username AS reviewer_username
    FROM reports r
    JOIN users rep ON rep.id=r.reporter_id
    LEFT JOIN users target ON target.id=r.target_user_id
    LEFT JOIN posts p ON p.id=r.post_id
    LEFT JOIN users reviewer ON reviewer.id=r.reviewed_by
    ${where}
    ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, r.created_at DESC
    LIMIT 250
  `, params);
  res.json(rows);
}));

app.patch('/api/admin/reports/:id', auth, adminOnly, asyncRoute(async (req, res) => {
  const status = String(req.body.status || '');
  const note = String(req.body.note || '').trim().slice(0, 2000);
  if (!['open','reviewing','closed'].includes(status)) return res.status(400).json({ error:'Estado no válido' });
  const { rows } = await pool.query(`
    UPDATE reports SET status=$2,admin_note=$3,reviewed_by=$4,reviewed_at=NOW()
    WHERE id=$1 RETURNING *
  `, [req.params.id, status, note, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error:'Denuncia no encontrada' });
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,report_id,note) VALUES($1,'report_status',$2,$3)`, [req.user.id, req.params.id, `${status}: ${note}`.slice(0,2000)]);
  res.json(rows[0]);
}));

app.delete('/api/admin/posts/:id', auth, adminOnly, asyncRoute(async (req, res) => {
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id,user_id FROM posts WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!rows[0]) return null;
    await client.query(`INSERT INTO moderation_actions(admin_id,action,target_user_id,post_id,note) VALUES($1,'remove_post',$2,$3,$4)`,
      [req.user.id, rows[0].user_id, rows[0].id, String(req.body?.note || '').slice(0,1000)]);
    await client.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
    return rows[0];
  });
  if (!result) return res.status(404).json({ error:'Publicación no encontrada' });
  res.json({ ok:true });
}));

app.post('/api/admin/users/:id/status', auth, adminOnly, asyncRoute(async (req, res) => {
  const targetId = Number(req.params.id);
  const status = String(req.body.status || '');
  const note = String(req.body.note || '').trim().slice(0, 1000);
  if (!['active','suspended'].includes(status)) return res.status(400).json({ error:'Estado no válido' });
  if (targetId === Number(req.user.id)) return res.status(400).json({ error:'No puedes suspender tu propia cuenta' });
  const { rows } = await pool.query('UPDATE users SET account_status=$2 WHERE id=$1 RETURNING id,username,name,account_status', [targetId,status]);
  if (!rows[0]) return res.status(404).json({ error:'Usuario no encontrado' });
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,target_user_id,note) VALUES($1,$2,$3,$4)`,
    [req.user.id, status === 'suspended' ? 'suspend_user' : 'restore_user', targetId, note]);
  res.json(rows[0]);
}));

app.get('/api/admin/actions', auth, adminOnly, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT a.*, adm.username AS admin_username, target.username AS target_username
    FROM moderation_actions a
    LEFT JOIN users adm ON adm.id=a.admin_id
    LEFT JOIN users target ON target.id=a.target_user_id
    ORDER BY a.created_at DESC LIMIT 100
  `);
  res.json(rows);
}));

app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'El archivo supera el límite de 25 MB de esta versión' });
  const status = err.status || 500;
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message });
});

async function start() {
  await initDb();
  httpServer.listen(PORT, '0.0.0.0', () => console.log(`Instant Admirers V1.1.5 en http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('No se pudo iniciar Instant Admirers:', err);
  process.exit(1);
});
