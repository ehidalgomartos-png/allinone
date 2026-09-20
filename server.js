const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
require('dotenv').config();

const { pool, initDb, withTransaction } = require('./src/db');
const {
  configured: metaConfigured,
  GRAPH_VERSION,
  exchangeCode,
  listManagedPages,
  publishFacebook,
  publishInstagram
} = require('./src/meta');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PROVIDERS = ['instagram', 'facebook', 'tiktok', 'youtube', 'x'];
const REAL_PUBLISH_PROVIDERS = ['instagram', 'facebook'];
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
  res.json({ ok: true, version: '0.3.0', database: 'postgresql', meta: metaConfigured(), graph_version: GRAPH_VERSION });
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
  const requestedPublishTo = Array.isArray(req.body.publish_to)
    ? [...new Set(req.body.publish_to.filter((provider) => REAL_PUBLISH_PROVIDERS.includes(provider)))]
    : [];

  if (!text && !mediaId) return res.status(400).json({ error: 'El post está vacío' });

  const connected = requestedPublishTo.length
    ? await pool.query(`
        SELECT provider
        FROM social_accounts
        WHERE user_id = $1
          AND status = 'connected'
          AND publish_enabled = TRUE
          AND provider = ANY($2::text[])
      `, [req.user.id, requestedPublishTo])
    : { rows: [] };
  const publishTo = connected.rows.map((row) => row.provider);
  const skipped = requestedPublishTo.filter((provider) => !publishTo.includes(provider));

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

  res.json({ id: result.postId, queued: publishTo, skipped });
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

function requestBaseUrl(req) {
  const configuredBase = String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
  if (configuredBase) return configuredBase;
  return `${req.protocol}://${req.get('host')}`;
}

async function selectMetaPage(userId, pageId) {
  return withTransaction(async (client) => {
    const selected = await client.query(
      `SELECT * FROM meta_pages WHERE user_id = $1 AND page_id = $2 LIMIT 1`,
      [userId, pageId]
    );
    const page = selected.rows[0];
    if (!page) {
      const err = new Error('Página de Meta no encontrada');
      err.status = 404;
      throw err;
    }

    await client.query('UPDATE meta_pages SET selected = FALSE, updated_at = NOW() WHERE user_id = $1', [userId]);
    await client.query(
      'UPDATE meta_pages SET selected = TRUE, updated_at = NOW() WHERE user_id = $1 AND page_id = $2',
      [userId, pageId]
    );

    await client.query(`
      INSERT INTO social_accounts
        (user_id, provider, external_id, external_username, external_name, status, access_token_enc, provider_data, last_error, updated_at)
      VALUES ($1, 'facebook', $2, $3, $3, 'connected', $4, $5::jsonb, '', NOW())
      ON CONFLICT (user_id, provider)
      DO UPDATE SET
        external_id = EXCLUDED.external_id,
        external_username = EXCLUDED.external_username,
        external_name = EXCLUDED.external_name,
        status = 'connected',
        access_token_enc = EXCLUDED.access_token_enc,
        provider_data = EXCLUDED.provider_data,
        last_error = '',
        updated_at = NOW()
    `, [
      userId,
      page.page_id,
      page.page_name,
      page.page_access_token_enc,
      JSON.stringify({ page_id: page.page_id, page_name: page.page_name, tasks: page.tasks || [] })
    ]);

    if (page.instagram_id) {
      await client.query(`
        INSERT INTO social_accounts
          (user_id, provider, external_id, external_username, external_name, status, access_token_enc, provider_data, last_error, updated_at)
        VALUES ($1, 'instagram', $2, $3, $4, 'connected', $5, $6::jsonb, '', NOW())
        ON CONFLICT (user_id, provider)
        DO UPDATE SET
          external_id = EXCLUDED.external_id,
          external_username = EXCLUDED.external_username,
          external_name = EXCLUDED.external_name,
          status = 'connected',
          access_token_enc = EXCLUDED.access_token_enc,
          provider_data = EXCLUDED.provider_data,
          last_error = '',
          updated_at = NOW()
      `, [
        userId,
        page.instagram_id,
        page.instagram_username || '',
        page.instagram_name || page.instagram_username || '',
        page.page_access_token_enc,
        JSON.stringify({
          page_id: page.page_id,
          page_name: page.page_name,
          instagram_avatar: page.instagram_avatar || ''
        })
      ]);
    } else {
      await client.query(`
        INSERT INTO social_accounts (user_id, provider, status, last_error)
        VALUES ($1, 'instagram', 'disconnected', 'La página seleccionada no tiene una cuenta profesional de Instagram vinculada')
        ON CONFLICT (user_id, provider)
        DO UPDATE SET
          status = 'disconnected',
          external_id = '',
          external_username = '',
          external_name = '',
          access_token_enc = '',
          provider_data = '{}'::jsonb,
          last_error = EXCLUDED.last_error,
          updated_at = NOW()
      `, [userId]);
    }

    return page;
  });
}

app.get('/api/meta/config', auth, (req, res) => {
  const baseUrl = requestBaseUrl(req);
  res.json({
    configured: metaConfigured(),
    graph_version: GRAPH_VERSION,
    redirect_uri: `${baseUrl}/api/meta/oauth/callback`
  });
});

app.get('/api/meta/oauth/start', auth, asyncRoute(async (req, res) => {
  if (!metaConfigured()) {
    return res.status(503).json({
      error: 'Faltan META_APP_ID y META_APP_SECRET en Render'
    });
  }

  const redirectUri = `${requestBaseUrl(req)}/api/meta/oauth/callback`;
  const stateToken = jwt.sign(
    { uid: req.user.id, purpose: 'meta_oauth' },
    JWT_SECRET,
    { expiresIn: '10m' }
  );

  const scopes = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'instagram_basic',
    'instagram_content_publish'
  ];

  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', process.env.META_APP_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', stateToken);
  if (process.env.META_LOGIN_CONFIG_ID) {
    url.searchParams.set('config_id', process.env.META_LOGIN_CONFIG_ID);
    url.searchParams.set('override_default_response_type', 'true');
  } else {
    url.searchParams.set('scope', scopes.join(','));
  }

  res.json({ url: url.toString(), redirect_uri: redirectUri });
}));

app.get('/api/meta/oauth/callback', async (req, res) => {
  const baseUrl = requestBaseUrl(req);
  try {
    if (req.query.error) {
      const reason = String(req.query.error_description || req.query.error || 'Autorización cancelada').slice(0, 300);
      return res.redirect(`${baseUrl}/?meta=error&message=${encodeURIComponent(reason)}`);
    }

    const payload = jwt.verify(String(req.query.state || ''), JWT_SECRET);
    if (payload.purpose !== 'meta_oauth' || !payload.uid) throw new Error('Estado OAuth inválido');
    if (!req.query.code) throw new Error('Meta no devolvió el código OAuth');

    const redirectUri = `${baseUrl}/api/meta/oauth/callback`;
    const token = await exchangeCode({ code: String(req.query.code), redirectUri });
    const pages = await listManagedPages(token.access_token);

    await withTransaction(async (client) => {
      await client.query('DELETE FROM meta_pages WHERE user_id = $1', [payload.uid]);
      for (const page of pages) {
        await client.query(`
          INSERT INTO meta_pages
            (user_id, page_id, page_name, page_access_token_enc, tasks, instagram_id, instagram_username, instagram_name, instagram_avatar)
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
        `, [
          payload.uid,
          page.id,
          page.name,
          page.access_token_enc,
          JSON.stringify(page.tasks || []),
          page.instagram?.id || '',
          page.instagram?.username || '',
          page.instagram?.name || '',
          page.instagram?.profile_picture_url || ''
        ]);
      }
    });

    if (!pages.length) return res.redirect(`${baseUrl}/?meta=no_pages`);
    if (pages.length === 1) {
      await selectMetaPage(payload.uid, pages[0].id);
      return res.redirect(`${baseUrl}/?meta=connected`);
    }
    return res.redirect(`${baseUrl}/?meta=choose`);
  } catch (err) {
    console.error('Meta OAuth callback:', err);
    return res.redirect(`${baseUrl}/?meta=error&message=${encodeURIComponent(err.message || 'Error de conexión con Meta')}`);
  }
});

app.get('/api/meta/pages', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT page_id, page_name, tasks, instagram_id, instagram_username, instagram_name, instagram_avatar, selected
    FROM meta_pages
    WHERE user_id = $1
    ORDER BY selected DESC, page_name ASC
  `, [req.user.id]);
  res.json(rows);
}));

app.post('/api/meta/select-page', auth, asyncRoute(async (req, res) => {
  const pageId = String(req.body.page_id || '');
  if (!pageId) return res.status(400).json({ error: 'Falta page_id' });
  const page = await selectMetaPage(req.user.id, pageId);
  res.json({
    ok: true,
    facebook: { id: page.page_id, name: page.page_name },
    instagram: page.instagram_id
      ? { id: page.instagram_id, username: page.instagram_username, name: page.instagram_name }
      : null
  });
}));

app.get('/api/social-accounts', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT provider, external_id, external_username, external_name, status,
           import_enabled, publish_enabled, provider_data, last_error, updated_at
    FROM social_accounts
    WHERE user_id = $1
  `, [req.user.id]);
  const byProvider = new Map(rows.map((row) => [row.provider, row]));
  res.json(PROVIDERS.map((provider) => byProvider.get(provider) || {
    provider,
    status: 'disconnected',
    external_id: '',
    external_username: '',
    external_name: '',
    import_enabled: true,
    publish_enabled: true,
    provider_data: {},
    last_error: ''
  }));
}));

app.post('/api/social-accounts/:provider/disconnect', auth, asyncRoute(async (req, res) => {
  const provider = req.params.provider;
  if (!PROVIDERS.includes(provider)) return res.status(400).json({ error: 'Proveedor inválido' });
  await pool.query(`
    INSERT INTO social_accounts (user_id, provider, status)
    VALUES ($1, $2, 'disconnected')
    ON CONFLICT (user_id, provider)
    DO UPDATE SET
      status = 'disconnected',
      external_id = '',
      external_username = '',
      external_name = '',
      access_token_enc = '',
      provider_data = '{}'::jsonb,
      updated_at = NOW()
  `, [req.user.id, provider]);
  res.json({ ok: true });
}));

app.post('/api/social-accounts/:provider/mock-connect', auth, asyncRoute(async (req, res) => {
  const provider = req.params.provider;
  if (!['tiktok', 'youtube', 'x'].includes(provider)) {
    return res.status(410).json({ error: 'Facebook e Instagram usan conexión OAuth real en V0.3' });
  }
  res.status(501).json({ error: `${provider} llegará en una fase posterior` });
}));

app.get('/api/cross-posts', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT cp.id, cp.post_id, cp.provider, cp.status, cp.external_post_id, cp.external_url,
           cp.error, cp.attempts, cp.created_at, cp.updated_at,
           p.text, p.media_id, p.media_type
    FROM cross_posts cp
    JOIN posts p ON p.id = cp.post_id
    WHERE p.user_id = $1
    ORDER BY cp.created_at DESC, cp.id DESC
  `, [req.user.id]);
  res.json(rows.map((row) => ({ ...row, media_url: row.media_id ? `/media/${row.media_id}` : '' })));
}));

app.post('/api/cross-posts/:id/retry', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    UPDATE cross_posts cp
    SET status = 'queued', error = '', updated_at = NOW()
    FROM posts p
    WHERE cp.id = $1
      AND cp.post_id = p.id
      AND p.user_id = $2
      AND cp.provider = ANY($3::text[])
    RETURNING cp.id
  `, [req.params.id, req.user.id, REAL_PUBLISH_PROVIDERS]);
  if (!rows[0]) return res.status(404).json({ error: 'Distribución no encontrada' });
  res.json({ ok: true });
}));

let workerRunning = false;

async function processOneCrossPost(row) {
  const claimed = await pool.query(`
    UPDATE cross_posts
    SET status = 'publishing', attempts = attempts + 1, error = '', updated_at = NOW()
    WHERE id = $1 AND status = 'queued'
    RETURNING *
  `, [row.id]);
  if (!claimed.rowCount) return;

  try {
    const { rows } = await pool.query(`
      SELECT cp.id AS cross_post_id, cp.provider,
             p.id AS post_id, p.user_id, p.text, p.media_id, p.media_type,
             sa.external_id, sa.external_username, sa.external_name,
             sa.status AS account_status, sa.access_token_enc
      FROM cross_posts cp
      JOIN posts p ON p.id = cp.post_id
      LEFT JOIN social_accounts sa
        ON sa.user_id = p.user_id AND sa.provider = cp.provider
      WHERE cp.id = $1
      LIMIT 1
    `, [row.id]);
    const item = rows[0];
    if (!item) throw new Error('No se encontró la publicación');
    if (item.account_status !== 'connected' || !item.access_token_enc) {
      throw new Error(`${item.provider} no está conectado`);
    }

    const account = {
      external_id: item.external_id,
      external_username: item.external_username,
      external_name: item.external_name,
      access_token_enc: item.access_token_enc
    };
    const post = {
      id: item.post_id,
      text: item.text,
      media_id: item.media_id,
      media_type: item.media_type
    };

    let published;
    if (item.provider === 'facebook') {
      published = await publishFacebook({ account, post });
    } else if (item.provider === 'instagram') {
      published = await publishInstagram({ account, post });
    } else {
      throw new Error(`Publicación real en ${item.provider} todavía no está disponible`);
    }

    await pool.query(`
      UPDATE cross_posts
      SET status = 'published',
          external_post_id = $2,
          external_url = $3,
          error = '',
          updated_at = NOW()
      WHERE id = $1
    `, [row.id, published?.id || '', published?.url || '']);
  } catch (err) {
    console.error(`Cross-post ${row.id}:`, err);
    await pool.query(`
      UPDATE cross_posts
      SET status = 'error', error = $2, updated_at = NOW()
      WHERE id = $1
    `, [row.id, String(err.message || 'Error publicando').slice(0, 2000)]);
  }
}

async function processPendingCrossPosts() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    const { rows } = await pool.query(`
      SELECT id
      FROM cross_posts
      WHERE status = 'queued'
        AND provider = ANY($1::text[])
      ORDER BY created_at ASC
      LIMIT 3
    `, [REAL_PUBLISH_PROVIDERS]);

    for (const row of rows) {
      await processOneCrossPost(row);
    }
  } catch (err) {
    console.error('Worker de distribución:', err);
  } finally {
    workerRunning = false;
  }
}

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
    console.log(`OmniSocial V0.3 en http://localhost:${PORT}`);
  });
  setTimeout(processPendingCrossPosts, 2500);
  setInterval(processPendingCrossPosts, 15000);
}

start().catch((err) => {
  console.error('No se pudo iniciar OmniSocial:', err);
  process.exit(1);
});
