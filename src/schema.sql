CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime_type VARCHAR(120) NOT NULL,
  original_name VARCHAR(255) NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  media_id BIGINT REFERENCES media(id) ON DELETE SET NULL,
  media_type VARCHAR(20) NOT NULL DEFAULT 'none',
  source VARCHAR(30) NOT NULL DEFAULT 'native',
  external_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);

CREATE TABLE IF NOT EXISTS likes (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tablas de V0.3 conservadas para no perder nada de instalaciones anteriores.
CREATE TABLE IF NOT EXISTS social_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL CHECK (provider IN ('instagram','facebook','tiktok','youtube','x')),
  external_username TEXT NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'disconnected',
  import_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  publish_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS cross_posts (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL CHECK (provider IN ('instagram','facebook','tiktok','youtube','x')),
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  external_post_id TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, provider)
);

ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS external_id TEXT NOT NULL DEFAULT '';
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS external_name TEXT NOT NULL DEFAULT '';
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS access_token_enc TEXT NOT NULL DEFAULT '';
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS provider_data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS last_error TEXT NOT NULL DEFAULT '';
ALTER TABLE cross_posts ADD COLUMN IF NOT EXISTS external_url TEXT NOT NULL DEFAULT '';
ALTER TABLE cross_posts ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS meta_pages (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL DEFAULT '',
  page_access_token_enc TEXT NOT NULL,
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  instagram_id TEXT NOT NULL DEFAULT '',
  instagram_username TEXT NOT NULL DEFAULT '',
  instagram_name TEXT NOT NULL DEFAULT '',
  instagram_avatar TEXT NOT NULL DEFAULT '',
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, page_id)
);

-- V0.4: red social propia.
ALTER TABLE users ADD COLUMN IF NOT EXISTS website TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'public';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

-- V1.10.2: IMPORTANTE. schema.sql se reejecuta en cada arranque.
-- Todas las restricciones históricas de notifications.type deben aceptar el conjunto actual
-- para no rechazar filas modernas durante pasos intermedios de migraciones antiguas.
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('follow','like','comment','friend_request','friend_accept','message','mention','repost','follow_request','follow_accept')),
  post_id BIGINT REFERENCES posts(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followed_id ON follows(followed_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cross_posts_post_id ON cross_posts(post_id);
CREATE INDEX IF NOT EXISTS idx_meta_pages_user_id ON meta_pages(user_id);
CREATE INDEX IF NOT EXISTS idx_cross_posts_status ON cross_posts(status, updated_at);

-- V0.5: Stories, Reels y mensajes privados.
CREATE TABLE IF NOT EXISTS stories (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id BIGINT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('image','video')),
  text TEXT NOT NULL DEFAULT '',
  visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE TABLE IF NOT EXISTS story_views (
  story_id BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, user_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  user1_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user1_id < user2_id),
  UNIQUE (user1_id, user2_id)
);

CREATE TABLE IF NOT EXISTS conversation_reads (
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  media_id BIGINT REFERENCES media(id) ON DELETE SET NULL,
  media_type VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (media_type IN ('none','image','video')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_active ON stories(expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_views_user ON story_views(user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user1 ON conversations(user1_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON conversations(user2_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC, id DESC);


-- V0.6: amistades, presencia y chat enriquecido.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS friend_requests (
  id BIGSERIAL PRIMARY KEY,
  from_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_user_id <> to_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_requests_pending_pair
  ON friend_requests (LEAST(from_user_id,to_user_id), GREATEST(from_user_id,to_user_id))
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS friendships (
  user1_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user1_id,user2_id),
  CHECK (user1_id < user2_id)
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id BIGINT REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS shared_post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow','like','comment','friend_request','friend_accept','message','mention','repost','follow_request','follow_accept'));

CREATE INDEX IF NOT EXISTS idx_friend_requests_to_status ON friend_requests(to_user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friend_requests_from_status ON friend_requests(from_user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friendships_user1 ON friendships(user1_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friendships_user2 ON friendships(user2_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_messages_shared_post ON messages(shared_post_id);


-- V0.7: menciones, reposts, edición y perfiles avanzados.
ALTER TABLE users ADD COLUMN IF NOT EXISTS headline TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS interests TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover TEXT NOT NULL DEFAULT '';

ALTER TABLE posts ADD COLUMN IF NOT EXISTS repost_of_id BIGINT REFERENCES posts(id) ON DELETE SET NULL;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow','like','comment','friend_request','friend_accept','message','mention','repost','follow_request','follow_accept'));

CREATE INDEX IF NOT EXISTS idx_posts_repost_of ON posts(repost_of_id);

-- V0.8: índices auxiliares para recomendaciones personalizadas.
CREATE INDEX IF NOT EXISTS idx_comments_user_created ON comments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_visibility_created ON posts(visibility, created_at DESC);


-- V0.9: privacidad y control del usuario.
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_private BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS message_policy VARCHAR(20) NOT NULL DEFAULT 'everyone';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_message_policy_check;
ALTER TABLE users ADD CONSTRAINT users_message_policy_check
  CHECK (message_policy IN ('everyone','followers','friends','nobody'));

CREATE TABLE IF NOT EXISTS follow_requests (
  id BIGSERIAL PRIMARY KEY,
  follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (follower_id <> followed_id),
  UNIQUE (follower_id, followed_id)
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS mutes (
  muter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (muter_id, muted_id),
  CHECK (muter_id <> muted_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL,
  reason VARCHAR(40) NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow','like','comment','friend_request','friend_accept','message','mention','repost','follow_request','follow_accept'));

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_check;

CREATE INDEX IF NOT EXISTS idx_follow_requests_followed ON follow_requests(followed_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follow_requests_follower ON follow_requests(follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mutes_muter ON mutes(muter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

-- V1.0: cuentas, onboarding y moderación.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user','admin'));

-- V1.10.1: cuentas técnicas fuera de la red social.
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_hidden BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_status_check;
ALTER TABLE users ADD CONSTRAINT users_account_status_check CHECK (account_status IN ('active','suspended'));
CREATE INDEX IF NOT EXISTS idx_users_social_visibility ON users(social_hidden,account_status,id);

-- TRUE por defecto conserva la experiencia de los usuarios existentes.
-- Los nuevos registros se crean explícitamente con FALSE desde el servidor.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS admin_note TEXT NOT NULL DEFAULT '';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS moderation_actions (
  id BIGSERIAL PRIMARY KEY,
  admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(40) NOT NULL,
  target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL,
  report_id BIGINT REFERENCES reports(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_reports_review ON reports(status, reviewed_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_actions_created ON moderation_actions(created_at DESC);


-- V1.1.2: registro 18+ y constancia de aceptación de términos.
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version VARCHAR(40) NOT NULL DEFAULT '';


-- V1.2: verificación de email, recuperación de cuenta y auditoría de seguridad.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_invalid_before TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS account_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('verify_email','reset_password','change_email')),
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  new_email VARCHAR(255),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(60) NOT NULL,
  ip_hash VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(500) NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_tokens_lookup ON account_tokens(type, token_hash, expires_at) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_account_tokens_user ON account_tokens(user_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at DESC);


-- V1.2.3: invitaciones, referidos y retos de acceso a amistades.
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_code VARCHAR(24);
UPDATE users
   SET invite_code = LOWER(SUBSTR(MD5(id::text || ':' || username || ':' || created_at::text), 1, 16))
 WHERE invite_code IS NULL OR invite_code = '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);

ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_gate_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_gate_required_referrals INTEGER NOT NULL DEFAULT 5;
ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_gate_require_post BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_gate_auto_accept BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_friend_gate_required_check;
ALTER TABLE users ADD CONSTRAINT users_friend_gate_required_check
  CHECK (friend_gate_required_referrals BETWEEN 1 AND 50);

CREATE TABLE IF NOT EXISTS referral_attributions (
  id BIGSERIAL PRIMARY KEY,
  inviter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gate_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  qualified_at TIMESTAMPTZ,
  UNIQUE (invited_user_id),
  CHECK (inviter_id <> invited_user_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referral_attributions(inviter_id, registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_gate ON referral_attributions(inviter_id, gate_user_id, registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_qualified ON referral_attributions(inviter_id, qualified_at DESC);

-- V1.3: multimedia externa (Cloudinary) manteniendo compatibilidad con archivos antiguos.
ALTER TABLE media ALTER COLUMN data DROP NOT NULL;
ALTER TABLE media ADD COLUMN IF NOT EXISTS provider VARCHAR(40) NOT NULL DEFAULT 'postgresql';
ALTER TABLE media ADD COLUMN IF NOT EXISTS provider_id TEXT NOT NULL DEFAULT '';
ALTER TABLE media ADD COLUMN IF NOT EXISTS secure_url TEXT NOT NULL DEFAULT '';
ALTER TABLE media ADD COLUMN IF NOT EXISTS resource_type VARCHAR(20) NOT NULL DEFAULT '';
ALTER TABLE media ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE media ADD COLUMN IF NOT EXISTS height INTEGER;
ALTER TABLE media ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(12,3);
ALTER TABLE media ADD COLUMN IF NOT EXISTS format VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE media ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_media_provider ON media(provider);
CREATE INDEX IF NOT EXISTS idx_media_secure_url ON media(secure_url) WHERE secure_url <> '';

-- V1.4: índices de rendimiento para feeds, perfiles, Reels y actividad.
CREATE INDEX IF NOT EXISTS idx_posts_user_id_desc ON posts(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_posts_visibility_id_desc ON posts(visibility, id DESC);
CREATE INDEX IF NOT EXISTS idx_posts_video_id_desc ON posts(id DESC) WHERE media_type = 'video';
CREATE INDEX IF NOT EXISTS idx_comments_post_created_desc ON comments(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_post_user ON likes(post_id, user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created_desc ON bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_expires_created_desc ON stories(expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_desc ON messages(conversation_id, id DESC);



-- V1.6: lanzamiento controlado, métricas operativas y observabilidad.
CREATE TABLE IF NOT EXISTS launch_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  registration_mode VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (registration_mode IN ('open','invite_only','paused')),
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO launch_settings(id,registration_mode) VALUES(1,'open') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS app_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(60) NOT NULL,
  severity VARCHAR(12) NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error')),
  path VARCHAR(500) NOT NULL DEFAULT '',
  user_agent VARCHAR(500) NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_events_type_created ON app_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_user_created ON app_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_severity_created ON app_events(severity, created_at DESC);

-- V1.6.1: laboratorio de pruebas controlado y eliminable.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_batch VARCHAR(80) NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_users_demo ON users(is_demo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_demo_batch ON users(demo_batch) WHERE demo_batch <> '';


-- V1.7: centro de preparación de lanzamiento, fases y primera cohorte.
ALTER TABLE launch_settings ADD COLUMN IF NOT EXISTS launch_phase VARCHAR(20) NOT NULL DEFAULT 'prelaunch';
ALTER TABLE launch_settings DROP CONSTRAINT IF EXISTS launch_settings_phase_check;
ALTER TABLE launch_settings ADD CONSTRAINT launch_settings_phase_check CHECK (launch_phase IN ('prelaunch','pilot','public'));
ALTER TABLE launch_settings ADD COLUMN IF NOT EXISTS cohort_target INTEGER NOT NULL DEFAULT 100;
ALTER TABLE launch_settings DROP CONSTRAINT IF EXISTS launch_settings_cohort_target_check;
ALTER TABLE launch_settings ADD CONSTRAINT launch_settings_cohort_target_check CHECK (cohort_target BETWEEN 10 AND 100000);
ALTER TABLE launch_settings ADD COLUMN IF NOT EXISTS banner_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE launch_settings ADD COLUMN IF NOT EXISTS banner_text VARCHAR(240) NOT NULL DEFAULT 'Estamos abriendo Instant Admirers por fases.';
ALTER TABLE launch_settings ADD COLUMN IF NOT EXISTS public_launched_at TIMESTAMPTZ;


-- V1.8: comunidad inicial real y warm-start de la primera cohorte.
ALTER TABLE launch_settings ADD COLUMN IF NOT EXISTS starter_prompts_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE launch_settings ADD COLUMN IF NOT EXISTS newcomer_spotlight_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE launch_settings ADD COLUMN IF NOT EXISTS founding_member_limit INTEGER NOT NULL DEFAULT 100;
ALTER TABLE launch_settings DROP CONSTRAINT IF EXISTS launch_settings_founding_member_limit_check;
ALTER TABLE launch_settings ADD CONSTRAINT launch_settings_founding_member_limit_check CHECK (founding_member_limit BETWEEN 10 AND 10000);


-- V1.9: Growth Engine — campañas, atribución y embudo de acceso especial.
CREATE TABLE IF NOT EXISTS growth_campaigns (
  id BIGSERIAL PRIMARY KEY,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(60) NOT NULL UNIQUE,
  channel VARCHAR(30) NOT NULL DEFAULT 'other',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_growth_campaigns_target ON growth_campaigns(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_campaigns_active ON growth_campaigns(active, created_at DESC);

CREATE TABLE IF NOT EXISTS growth_campaign_daily (
  campaign_id BIGINT NOT NULL REFERENCES growth_campaigns(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  visits INTEGER NOT NULL DEFAULT 0,
  challenge_views INTEGER NOT NULL DEFAULT 0,
  share_actions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id, day)
);

CREATE TABLE IF NOT EXISTS growth_campaign_attributions (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  campaign_id BIGINT NOT NULL REFERENCES growth_campaigns(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_growth_attributions_campaign ON growth_campaign_attributions(campaign_id, registered_at DESC);

CREATE TABLE IF NOT EXISTS friend_gate_sessions (
  viewer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gate_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES growth_campaigns(id) ON DELETE SET NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  share_actions INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (viewer_user_id, gate_user_id),
  CHECK (viewer_user_id <> gate_user_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_gate_sessions_gate ON friend_gate_sessions(gate_user_id, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_friend_gate_sessions_campaign ON friend_gate_sessions(campaign_id, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_friend_gate_sessions_completed ON friend_gate_sessions(gate_user_id, completed_at DESC) WHERE completed_at IS NOT NULL;

-- V1.10.0: sistema de publicidad administrable y segmentación por perfil.
CREATE TABLE IF NOT EXISTS ad_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO ad_settings(id, enabled) VALUES(1, FALSE) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ads (
  id BIGSERIAL PRIMARY KEY,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  creative_type VARCHAR(20) NOT NULL DEFAULT 'image' CHECK (creative_type IN ('image','google')),
  image_url TEXT NOT NULL DEFAULT '',
  image_provider VARCHAR(40) NOT NULL DEFAULT '',
  image_provider_id TEXT NOT NULL DEFAULT '',
  image_resource_type VARCHAR(20) NOT NULL DEFAULT 'image',
  mobile_image_url TEXT NOT NULL DEFAULT '',
  mobile_image_provider VARCHAR(40) NOT NULL DEFAULT '',
  mobile_image_provider_id TEXT NOT NULL DEFAULT '',
  mobile_image_resource_type VARCHAR(20) NOT NULL DEFAULT 'image',
  link_url TEXT NOT NULL DEFAULT '',
  google_code TEXT NOT NULL DEFAULT '',
  alt_text VARCHAR(240) NOT NULL DEFAULT '',
  placements TEXT[] NOT NULL DEFAULT ARRAY['feed']::TEXT[],
  desktop_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  mobile_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  profile_mode VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (profile_mode IN ('all','include','exclude')),
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN -1000 AND 1000),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cardinality(placements) >= 1),
  CHECK (placements <@ ARRAY['right_sidebar','feed','profile']::TEXT[]),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS ad_profile_targets (
  ad_id BIGINT NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (ad_id, user_id)
);

CREATE TABLE IF NOT EXISTS ad_daily_stats (
  ad_id BIGINT NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ad_id, day)
);

CREATE INDEX IF NOT EXISTS idx_ads_active_schedule ON ads(active, starts_at, ends_at, priority DESC);
CREATE INDEX IF NOT EXISTS idx_ads_placements ON ads USING GIN(placements);
CREATE INDEX IF NOT EXISTS idx_ad_profile_targets_user ON ad_profile_targets(user_id, ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_daily_stats_day ON ad_daily_stats(day DESC, ad_id);
