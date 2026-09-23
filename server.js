const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');
const multer = require('multer');
const http = require('http');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { Server } = require('socket.io');
require('dotenv').config();

const { pool, initDb, withTransaction } = require('./src/db');
const { configured: cloudinaryConfigured, uploadBuffer: uploadMediaBuffer, deliveryUrl: cloudinaryDeliveryUrl, hardenAsset: hardenRemoteAsset, destroyAsset: destroyRemoteAsset } = require('./src/mediaStorage');
const { createDemoEnvironment, clearDemoEnvironment, demoStatus } = require('./src/demoLab');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: true, credentials: true } });
const onlineUsers = new Map();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const CURRENT_TERMS_VERSION = '2026-09-20';
const MEDIA_SESSION_COOKIE = 'ia_media_session';
const MEDIA_URL_TTL_SECONDS = Math.min(3600, Math.max(300, Number(process.env.MEDIA_URL_TTL_SECONDS || 1800)));
const MEDIA_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const APP_URL = String(process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://instantadmirers.com').replace(/\/$/, '');
const REQUIRE_EMAIL_VERIFICATION = String(process.env.REQUIRE_EMAIL_VERIFICATION || 'false').toLowerCase() === 'true';
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
app.use(express.static(publicDir, {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (/[/\\]sw\.js$/i.test(filePath) || /manifest\.webmanifest$/i.test(filePath)) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (/\.(?:js|css|svg|png|jpg|jpeg|webp|ico|woff2?)$/i.test(filePath)) {
      res.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    } else if (/\.(?:html?)$/i.test(filePath)) {
      res.set('Cache-Control', 'no-cache');
    }
  }
}));


const EMAIL_PROVIDER = 'resend';
const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

function emailError(message, code='EMAIL_SEND_FAILED', details=null) {
  const err = new Error(message);
  err.code = code;
  if (details) err.details = details;
  return err;
}

function emailShell({ title, body, buttonText, buttonUrl, footer, lang='es' }) {
  const english=String(lang||'').toLowerCase()==='en';
  const safeTitle = String(title || '').replace(/[<>&]/g, '');
  const button = buttonUrl ? `<p style="margin:28px 0"><a href="${buttonUrl}" style="display:inline-block;padding:13px 22px;border-radius:12px;background:linear-gradient(135deg,#ff2aa1,#7c3cff);color:#fff;text-decoration:none;font-weight:700">${String(buttonText || (english?'Open Instant Admirers':'Abrir Instant Admirers')).replace(/[<>&]/g,'')}</a></p>` : '';
  return `<!doctype html><html lang="${english?'en':'es'}"><body style="margin:0;background:#0b0b12;color:#f7f7fb;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="font-size:24px;font-weight:800;margin-bottom:24px">Instant <span style="color:#ff2aa1">Admirers</span></div><div style="background:#151621;border:1px solid #2b2d3c;border-radius:18px;padding:28px"><h1 style="font-size:24px;margin:0 0 16px">${safeTitle}</h1><div style="font-size:16px;line-height:1.6;color:#d7d8e3">${body || ''}</div>${button}${footer ? `<p style="font-size:13px;color:#9295a8;margin-top:24px">${footer}</p>` : ''}</div><p style="font-size:12px;color:#777b8c;margin-top:18px">${english?'This email was sent by Instant Admirers.':'Este correo ha sido enviado por Instant Admirers.'}</p></div></body></html>`;
}

function limiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs, max, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: message || 'Demasiadas solicitudes. Inténtalo de nuevo más tarde.' }
  });
}
const loginLimiter = limiter({ windowMs: 15*60*1000, max: 12, message: 'Demasiados intentos de acceso. Espera unos minutos.' });
const registerLimiter = limiter({ windowMs: 60*60*1000, max: 6, message: 'Se han creado demasiadas cuentas desde esta conexión. Inténtalo más tarde.' });
const recoveryLimiter = limiter({ windowMs: 15*60*1000, max: 6, message: 'Demasiadas solicitudes de recuperación. Espera unos minutos.' });
const writeLimiter = rateLimit({ windowMs: 60*1000, max: 140, standardHeaders: 'draft-7', legacyHeaders: false, skip: req => ['GET','HEAD','OPTIONS'].includes(req.method), message: { error:'Estás realizando acciones demasiado rápido. Espera un momento.' } });
const reportLimiter = limiter({ windowMs: 60*60*1000, max: 12, message: 'Has enviado demasiadas denuncias en poco tiempo.' });
const telemetryLimiter = limiter({ windowMs: 5*60*1000, max: 30, message: 'Demasiados eventos técnicos en poco tiempo.' });
app.use('/api', writeLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/forgot-password', recoveryLimiter);
app.use('/api/auth/reset-password', recoveryLimiter);
app.use('/api/auth/verify-email/request', recoveryLimiter);
app.use('/api/reports', reportLimiter);
app.use('/api/telemetry', telemetryLimiter);

function normalizeEmail(value='') { return String(value).trim().toLowerCase(); }
function tokenDigest(raw='') { return crypto.createHash('sha256').update(String(raw)).digest('hex'); }
function requestIpHash(req) {
  const raw = String(req.ip || req.socket?.remoteAddress || '');
  return crypto.createHmac('sha256', JWT_SECRET).update(raw).digest('hex');
}
async function securityEvent(req, eventType, userId=null, metadata={}) {
  try {
    await pool.query(`INSERT INTO security_events(user_id,event_type,ip_hash,user_agent,metadata) VALUES($1,$2,$3,$4,$5::jsonb)`, [
      userId || null, String(eventType).slice(0,60), requestIpHash(req), String(req.get('user-agent') || '').slice(0,500), JSON.stringify(metadata || {})
    ]);
  } catch (err) { console.error('securityEvent:', err.message); }
}

const COMMUNITY_PROMPTS = [
  { id:'hello', emoji:'👋', text:'Me presento: tres cosas que me definen son…' },
  { id:'today', emoji:'✨', text:'Algo bueno que me ha pasado hoy es…' },
  { id:'weekend', emoji:'📍', text:'Mi plan perfecto para este fin de semana sería…' },
  { id:'music', emoji:'🎧', text:'Una canción que no paro de escuchar últimamente es…' },
  { id:'food', emoji:'🍜', text:'Un sitio o comida que recomendaría sin pensarlo es…' },
  { id:'travel', emoji:'✈️', text:'Si pudiera escaparme mañana, me iría a…' },
  { id:'hobby', emoji:'🎯', text:'Últimamente estoy dedicando tiempo a…' },
  { id:'question', emoji:'💬', text:'Pregunta para la comunidad: ¿qué consejo os habría gustado recibir antes?' },
  { id:'photo', emoji:'📸', text:'Una foto que resume bien mi semana y por qué…' },
  { id:'meet', emoji:'🤝', text:'Me gustaría conocer gente a la que también le guste…' },
  { id:'goal', emoji:'🚀', text:'Un objetivo que quiero cumplir este año es…' },
  { id:'truth', emoji:'🎲', text:'Para romper el hielo: una verdad curiosa sobre mí es…' }
];

let launchSettingsCache = { value:null, expires:0 };
async function getLaunchSettings(force=false) {
  const now = Date.now();
  if (!force && launchSettingsCache.value && launchSettingsCache.expires > now) return launchSettingsCache.value;
  const { rows } = await pool.query(`SELECT registration_mode,launch_phase,cohort_target,banner_enabled,banner_text,public_launched_at,starter_prompts_enabled,newcomer_spotlight_enabled,founding_member_limit,updated_at FROM launch_settings WHERE id=1 LIMIT 1`);
  const value = rows[0] || { registration_mode:'open', launch_phase:'prelaunch', cohort_target:100, banner_enabled:true, banner_text:'Estamos abriendo Instant Admirers por fases.', public_launched_at:null, starter_prompts_enabled:true, newcomer_spotlight_enabled:true, founding_member_limit:100, updated_at:null };
  launchSettingsCache = { value, expires:now + 15000 };
  return value;
}

function normalizeCampaignSlug(value='') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,60);
}

function slugifyCampaign(value='campaign') {
  const clean=String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48);
  return clean || 'campaign';
}

async function growthCampaignBySlug(slug, client=pool, { activeOnly=true }={}) {
  const normalized=normalizeCampaignSlug(slug);
  if(!normalized) return null;
  const {rows}=await client.query(`
    SELECT gc.*,u.username AS target_username,u.name AS target_name,u.invite_code AS target_invite_code,
           u.friend_gate_enabled AS target_gate_enabled,u.friend_gate_required_referrals AS target_gate_required
      FROM growth_campaigns gc JOIN users u ON u.id=gc.target_user_id
     WHERE LOWER(gc.slug)=LOWER($1) ${activeOnly?'AND gc.active=TRUE':''} AND u.account_status='active' AND COALESCE(u.social_hidden,FALSE)=FALSE LIMIT 1
  `,[normalized]);
  return rows[0] || null;
}

function growthCampaignLink(row) {
  if(!row?.target_username || !row?.target_invite_code || !row?.slug) return '';
  return `${APP_URL}/${encodeURIComponent(row.target_username)}?ref=${encodeURIComponent(row.target_invite_code)}&invite=profile&campaign=${encodeURIComponent(row.slug)}`;
}

async function incrementGrowthDaily(campaignId, field, client=pool) {
  const allowed=new Set(['visits','challenge_views','share_actions']);
  if(!campaignId || !allowed.has(field)) return;
  await client.query(`
    INSERT INTO growth_campaign_daily(campaign_id,day,${field}) VALUES($1,CURRENT_DATE,1)
    ON CONFLICT (campaign_id,day) DO UPDATE SET ${field}=growth_campaign_daily.${field}+1
  `,[campaignId]);
}

async function attributedCampaignForUser(userId, client=pool) {
  if(!userId) return null;
  const {rows}=await client.query(`
    SELECT gc.*,u.username AS target_username,u.name AS target_name,u.invite_code AS target_invite_code,
           u.friend_gate_enabled AS target_gate_enabled,u.friend_gate_required_referrals AS target_gate_required
      FROM growth_campaign_attributions gca
      JOIN growth_campaigns gc ON gc.id=gca.campaign_id
      JOIN users u ON u.id=gc.target_user_id
     WHERE gca.user_id=$1 AND COALESCE(u.social_hidden,FALSE)=FALSE LIMIT 1
  `,[userId]);
  return rows[0] || null;
}

async function recordFriendGateSession(viewerUserId, gateUserId, campaignSlug='', client=pool) {
  if(!viewerUserId || !gateUserId || Number(viewerUserId)===Number(gateUserId)) return null;
  let campaign=null;
  if(campaignSlug) campaign=await growthCampaignBySlug(campaignSlug,client);
  if(!campaign) campaign=await attributedCampaignForUser(viewerUserId,client);
  const campaignId=campaign?.id || null;
  const inserted=await client.query(`
    INSERT INTO friend_gate_sessions(viewer_user_id,gate_user_id,campaign_id)
    VALUES($1,$2,$3) ON CONFLICT (viewer_user_id,gate_user_id) DO NOTHING
    RETURNING viewer_user_id
  `,[viewerUserId,gateUserId,campaignId]);
  await client.query(`UPDATE friend_gate_sessions SET last_seen_at=NOW(),campaign_id=COALESCE(campaign_id,$3) WHERE viewer_user_id=$1 AND gate_user_id=$2`,[viewerUserId,gateUserId,campaignId]);
  if(inserted.rowCount && campaignId) await incrementGrowthDaily(campaignId,'challenge_views',client);
  return campaign;
}

async function markFriendGateCompleted(viewerUserId, gateUserId, client=pool) {
  if(!viewerUserId || !gateUserId) return;
  await client.query(`UPDATE friend_gate_sessions SET completed_at=COALESCE(completed_at,NOW()),last_seen_at=NOW() WHERE viewer_user_id=$1 AND gate_user_id=$2`,[viewerUserId,gateUserId]);
}

async function operationalEvent({ userId=null, eventType, severity='info', path='', userAgent='', metadata={} }) {
  try {
    let compact = JSON.stringify(metadata || {});
    if (compact.length > 8000) compact = JSON.stringify({ truncated:true, preview:compact.slice(0,7000) });
    await pool.query(`INSERT INTO app_events(user_id,event_type,severity,path,user_agent,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [
      userId || null, String(eventType || 'event').slice(0,60), ['info','warning','error'].includes(severity) ? severity : 'info', String(path || '').slice(0,500), String(userAgent || '').slice(0,500), compact
    ]);
  } catch (err) { console.error('operationalEvent:', err.message); }
}
async function createAccountToken(userId, type, { minutes=60, newEmail=null }={}) {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = tokenDigest(raw);
  await pool.query(`UPDATE account_tokens SET used_at=NOW() WHERE user_id=$1 AND type=$2 AND used_at IS NULL`, [userId,type]);
  await pool.query(`INSERT INTO account_tokens(user_id,type,token_hash,new_email,expires_at) VALUES($1,$2,$3,$4,NOW()+($5 || ' minutes')::interval)`, [userId,type,hash,newEmail, String(minutes)]);
  return raw;
}
async function consumeAccountToken(raw, type, client=pool) {
  const hash = tokenDigest(raw);
  const { rows } = await client.query(`SELECT * FROM account_tokens WHERE token_hash=$1 AND type=$2 AND used_at IS NULL AND expires_at>NOW() LIMIT 1 FOR UPDATE`, [hash,type]);
  if (!rows[0]) return null;
  await client.query(`UPDATE account_tokens SET used_at=NOW() WHERE id=$1`, [rows[0].id]);
  return rows[0];
}
async function sendEmail({to,subject,text,html}) {
  if (!emailConfigured()) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.RESEND_TIMEOUT_MS || 12000));
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [String(to)],
        subject: String(subject),
        text: text || undefined,
        html: html || undefined
      }),
      signal: controller.signal
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok) {
      const detail = payload?.message || payload?.error || `HTTP ${response.status}`;
      throw emailError(`Resend rechazó el envío: ${detail}`, 'EMAIL_SEND_FAILED', payload);
    }
    return true;
  } catch (err) {
    if (err?.name === 'AbortError') throw emailError('Resend tardó demasiado en responder.', 'EMAIL_TIMEOUT');
    if (err?.code === 'EMAIL_SEND_FAILED') throw err;
    throw emailError(`No se pudo conectar con Resend: ${err.message}`, 'EMAIL_SEND_FAILED');
  } finally {
    clearTimeout(timeout);
  }
}
async function sendVerificationEmail(user) {
  const token = await createAccountToken(user.id, 'verify_email', { minutes: 24*60 });
  const url = `${APP_URL}/?action=verify-email&token=${encodeURIComponent(token)}`;
  const english=String(user.preferred_language || '').toLowerCase()==='en';
  const safeName=String(user.name || user.username).replace(/[<>&]/g,'');
  const sent = await sendEmail({
    to:user.email,
    subject:english?'Confirm your email · Instant Admirers':'Confirma tu email · Instant Admirers',
    text:english?`Hi ${user.name || user.username}. Confirm your email at: ${url}

The link expires in 24 hours.`:`Hola ${user.name || user.username}. Confirma tu email en: ${url}

El enlace caduca en 24 horas.`,
    html:emailShell({ lang:english?'en':'es', title:english?'Confirm your email':'Confirma tu email', body:english?`<p>Hi ${safeName},</p><p>Confirm your email address to protect your Instant Admirers account.</p>`:`<p>Hola ${safeName},</p><p>Confirma tu dirección para proteger tu cuenta de Instant Admirers.</p>`, buttonText:english?'Confirm email':'Confirmar email', buttonUrl:url, footer:english?'The link expires in 24 hours.':'El enlace caduca en 24 horas.' })
  });
  if (!sent && process.env.NODE_ENV !== 'production') console.log('VERIFY EMAIL:', url);
  return sent;
}

if (REQUIRE_EMAIL_VERIFICATION && !emailConfigured()) {
  throw new Error('REQUIRE_EMAIL_VERIFICATION=true requiere configurar RESEND_API_KEY y EMAIL_FROM.');
}

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  // Multer applies one transport limit. The route below then applies
  // the Cloudinary limits by media type (10 MB images / 100 MB videos).
  limits: { fileSize: MAX_VIDEO_UPLOAD_BYTES },
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
    const { rows } = await pool.query('SELECT id,username,email,role,account_status,social_hidden,session_invalid_before FROM users WHERE id=$1', [decoded.id]);
    const dbUser = rows[0];
    if (!dbUser) return res.status(401).json({ error: 'La cuenta ya no existe' });
    if (dbUser.account_status === 'suspended') return res.status(403).json({ error: 'Esta cuenta está suspendida' });
    if (dbUser.session_invalid_before && decoded.iat && decoded.iat * 1000 + 1000 < new Date(dbUser.session_invalid_before).getTime()) {
      return res.status(401).json({ error:'Tu sesión ha sido invalidada. Vuelve a entrar.' });
    }
    req.user = { ...decoded, ...dbUser };
    setMediaSessionCookie(res, req.user);
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

function isSociallyHiddenRecord(user = {}) {
  return Boolean(user.social_hidden) || isAdminRecord(user);
}

function socialAccountOnly(req, res, next) {
  if (!isSociallyHiddenRecord(req.user)) return next();
  return res.status(403).json({ error:'La cuenta de administración es una cuenta técnica y no participa en funciones sociales', code:'SYSTEM_ACCOUNT_SOCIAL_DISABLED' });
}

async function assertVisibleSocialUser(userId, client=pool) {
  const {rows}=await client.query(`SELECT id,email,role,social_hidden,account_status FROM users WHERE id=$1 LIMIT 1`,[userId]);
  const target=rows[0];
  if(!target || target.account_status!=='active' || isSociallyHiddenRecord(target)) {
    const err=new Error('Usuario no disponible'); err.status=404; throw err;
  }
  return target;
}

async function syncSystemAccounts() {
  const emails=[...configuredAdminEmails()];
  await pool.query(`UPDATE users SET social_hidden=(role='admin' OR LOWER(email)=ANY($1::text[])) WHERE social_hidden IS DISTINCT FROM (role='admin' OR LOWER(email)=ANY($1::text[]))`,[emails]);
  const {rows}=await pool.query(`SELECT id FROM users WHERE social_hidden=TRUE`);
  const ids=rows.map(r=>Number(r.id)).filter(Number.isSafeInteger);
  if(!ids.length) return;
  await withTransaction(async client=>{
    await client.query(`DELETE FROM follows WHERE follower_id=ANY($1::bigint[]) OR followed_id=ANY($1::bigint[])`,[ids]);
    await client.query(`DELETE FROM follow_requests WHERE follower_id=ANY($1::bigint[]) OR followed_id=ANY($1::bigint[])`,[ids]);
    await client.query(`DELETE FROM friend_requests WHERE from_user_id=ANY($1::bigint[]) OR to_user_id=ANY($1::bigint[])`,[ids]);
    await client.query(`DELETE FROM friendships WHERE user1_id=ANY($1::bigint[]) OR user2_id=ANY($1::bigint[])`,[ids]);
    await client.query(`DELETE FROM blocks WHERE blocker_id=ANY($1::bigint[]) OR blocked_id=ANY($1::bigint[])`,[ids]);
    await client.query(`DELETE FROM mutes WHERE muter_id=ANY($1::bigint[]) OR muted_id=ANY($1::bigint[])`,[ids]);
    await client.query(`DELETE FROM conversations WHERE user1_id=ANY($1::bigint[]) OR user2_id=ANY($1::bigint[])`,[ids]);
    await client.query(`DELETE FROM notifications WHERE actor_id=ANY($1::bigint[])`,[ids]);
    await client.query(`DELETE FROM likes WHERE user_id=ANY($1::bigint[])`,[ids]);
    await client.query(`DELETE FROM bookmarks WHERE user_id=ANY($1::bigint[])`,[ids]);
    await client.query(`DELETE FROM story_views WHERE user_id=ANY($1::bigint[])`,[ids]);
    await client.query(`DELETE FROM ad_profile_targets WHERE user_id=ANY($1::bigint[])`,[ids]);
    await client.query(`UPDATE growth_campaigns SET active=FALSE WHERE target_user_id=ANY($1::bigint[])`,[ids]);
  });
}

async function adminOnly(req, res, next) {
  try {
    if (isAdminRecord(req.user)) return next();
    return res.status(403).json({ error: 'Acceso reservado a administración' });
  } catch (err) {
    next(err);
  }
}


// --- V1.10.0: Publicidad ---------------------------------------------------
const AD_PLACEMENTS = new Set(['right_sidebar','feed','profile']);
const AD_PROFILE_MODES = new Set(['all','include','exclude']);
const AD_CREATIVE_TYPES = new Set(['image','google']);

function normalizeHttpUrl(value='', { allowEmpty=true }={}) {
  const raw=String(value || '').trim();
  if(!raw && allowEmpty) return '';
  try {
    const url=new URL(raw);
    if(!['http:','https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch (_) { return null; }
}

function normalizeAdDate(value) {
  if(value===null || value===undefined || String(value).trim()==='') return null;
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeAdPlacements(value) {
  const values=Array.isArray(value) ? value : [];
  return [...new Set(values.map(v=>String(v||'').trim()).filter(v=>AD_PLACEMENTS.has(v)))];
}

function validateGoogleAdCode(value='') {
  const code=String(value || '').trim();
  if(code.length < 20 || code.length > 20000) return { ok:false, error:'Pega el código completo del bloque de Google AdSense.' };
  if(!/adsbygoogle/i.test(code) || !/data-ad-client\s*=\s*["'][^"']+["']/i.test(code) || !/data-ad-slot\s*=\s*["'][^"']+["']/i.test(code)) {
    return { ok:false, error:'El código no parece un bloque válido de Google AdSense.' };
  }
  const forbidden=[/<iframe\b/i,/javascript\s*:/i,/\son\w+\s*=/i,/document\s*\./i,/localStorage/i,/sessionStorage/i,/document\.cookie/i,/XMLHttpRequest/i,/\bfetch\s*\(/i];
  if(forbidden.some(rx=>rx.test(code))) return { ok:false, error:'El código contiene elementos no permitidos. Usa únicamente el bloque oficial de Google AdSense.' };
  const srcs=[...code.matchAll(/<script[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
  if(srcs.some(src=>!/^https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js(?:\?|$)/i.test(src))) {
    return { ok:false, error:'Solo se permite el script oficial de Google AdSense.' };
  }
  return { ok:true, code };
}

function normalizeAdPayload(body={}) {
  const creativeType=String(body.creative_type || 'image').trim().toLowerCase();
  const profileMode=String(body.profile_mode || 'all').trim().toLowerCase();
  const placements=normalizeAdPlacements(body.placements);
  const desktopEnabled=body.desktop_enabled !== false;
  const mobileEnabled=body.mobile_enabled !== false;
  const imageUrl=normalizeHttpUrl(body.image_url || '');
  const mobileImageUrl=normalizeHttpUrl(body.mobile_image_url || '');
  const linkUrl=normalizeHttpUrl(body.link_url || '');
  const startsAt=normalizeAdDate(body.starts_at);
  const endsAt=normalizeAdDate(body.ends_at);
  const targetIds=[...new Set((Array.isArray(body.target_ids)?body.target_ids:[]).map(Number).filter(v=>Number.isInteger(v)&&v>0))].slice(0,500);

  if(!AD_CREATIVE_TYPES.has(creativeType)) throw Object.assign(new Error('Tipo de publicidad no válido'),{status:400});
  if(!AD_PROFILE_MODES.has(profileMode)) throw Object.assign(new Error('Segmentación por perfil no válida'),{status:400});
  if(!placements.length) throw Object.assign(new Error('Selecciona al menos una ubicación para el anuncio'),{status:400});
  if(!desktopEnabled && !mobileEnabled) throw Object.assign(new Error('El anuncio debe mostrarse al menos en ordenador o móvil'),{status:400});
  if(imageUrl===null || mobileImageUrl===null || linkUrl===null) throw Object.assign(new Error('Las direcciones del anuncio deben ser URLs http o https válidas'),{status:400});
  if(startsAt===undefined || endsAt===undefined) throw Object.assign(new Error('La fecha de inicio o final no es válida'),{status:400});
  if(startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw Object.assign(new Error('La fecha final debe ser posterior a la fecha de inicio'),{status:400});
  if(profileMode==='include' && !targetIds.length) throw Object.assign(new Error('Selecciona al menos un perfil para la segmentación'),{status:400});

  let googleCode='';
  if(creativeType==='google') {
    const checked=validateGoogleAdCode(body.google_code || '');
    if(!checked.ok) throw Object.assign(new Error(checked.error),{status:400});
    googleCode=checked.code;
  } else {
    if(desktopEnabled && !imageUrl) throw Object.assign(new Error('Selecciona o indica una imagen para ordenador'),{status:400});
    if(mobileEnabled && !(mobileImageUrl || imageUrl)) throw Object.assign(new Error('Selecciona una imagen para móvil o usa la misma imagen principal'),{status:400});
  }

  return {
    name:String(body.name || '').trim().slice(0,120),
    active:body.active !== false,
    creative_type:creativeType,
    image_url:imageUrl || '',
    image_provider:String(body.image_provider || '').trim().slice(0,40),
    image_provider_id:String(body.image_provider_id || '').trim().slice(0,500),
    image_resource_type:'image',
    mobile_image_url:mobileImageUrl || '',
    mobile_image_provider:String(body.mobile_image_provider || '').trim().slice(0,40),
    mobile_image_provider_id:String(body.mobile_image_provider_id || '').trim().slice(0,500),
    mobile_image_resource_type:'image',
    link_url:linkUrl || '',
    google_code:googleCode,
    alt_text:String(body.alt_text || '').trim().slice(0,240),
    alt_text_en:String(body.alt_text_en || '').trim().slice(0,240),
    display_title:String(body.display_title ?? '').trim().slice(0,120),
    display_title_en:String(body.display_title_en ?? '').trim().slice(0,120),
    display_text:String(body.display_text ?? '').trim().slice(0,500),
    display_text_en:String(body.display_text_en ?? '').trim().slice(0,500),
    button_text:String(body.button_text ?? '').trim().slice(0,60),
    button_text_en:String(body.button_text_en ?? '').trim().slice(0,60),
    placements,
    desktop_enabled:desktopEnabled,
    mobile_enabled:mobileEnabled,
    profile_mode:profileMode,
    priority:Math.max(-1000,Math.min(1000,Math.floor(Number(body.priority)||0))),
    starts_at:startsAt,
    ends_at:endsAt,
    target_ids:targetIds
  };
}

async function validateAdTargetUsers(targetIds, client=pool) {
  if(!targetIds.length) return [];
  const {rows}=await client.query(`SELECT id,username,name,avatar FROM users WHERE id=ANY($1::bigint[]) AND account_status='active' AND COALESCE(is_demo,FALSE)=FALSE AND COALESCE(social_hidden,FALSE)=FALSE ORDER BY username`,[targetIds]);
  if(rows.length!==targetIds.length) throw Object.assign(new Error('Uno o más perfiles seleccionados ya no están disponibles'),{status:400});
  return rows;
}

function uploadedAdAsset(row, mobile=false) {
  return mobile
    ? {provider:row?.mobile_image_provider,provider_id:row?.mobile_image_provider_id,resource_type:row?.mobile_image_resource_type || 'image'}
    : {provider:row?.image_provider,provider_id:row?.image_provider_id,resource_type:row?.image_resource_type || 'image'};
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
    user.preferred_language = ['es','en'].includes(String(row.preferred_language || '')) ? String(row.preferred_language) : '';
    user.message_policy = row.message_policy || 'everyone';
    user.onboarding_completed = row.onboarding_completed !== false;
    user.is_admin = isAdminRecord(row);
    user.social_hidden = isSociallyHiddenRecord(row);
    user.account_status = row.account_status || 'active';
    user.terms_version = row.terms_version || '';
    user.terms_accepted_at = row.terms_accepted_at || null;
    user.age_confirmed_at = row.age_confirmed_at || null;
    user.email_verified_at = row.email_verified_at || null;
    user.invite_code = row.invite_code || '';
    user.friend_gate_enabled = Boolean(row.friend_gate_enabled);
    user.friend_gate_required_referrals = Number(row.friend_gate_required_referrals || 5);
    user.friend_gate_require_post = row.friend_gate_require_post !== false;
    user.friend_gate_auto_accept = row.friend_gate_auto_accept !== false;
    user.friend_gate_message = String(row.friend_gate_message || '').slice(0,220);
    user.content_watermark_mode = ['off','exclusive','all'].includes(String(row.content_watermark_mode || '')) ? String(row.content_watermark_mode) : 'exclusive';
  }
  return user;
}

function tokenFor(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}

function mediaSessionToken(user) {
  return jwt.sign({ id: Number(user.id), scope: 'media' }, JWT_SECRET, { expiresIn: '30d' });
}

function setMediaSessionCookie(res, user) {
  if (!res || !user?.id) return;
  res.cookie(MEDIA_SESSION_COOKIE, mediaSessionToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MEDIA_SESSION_MAX_AGE_MS
  });
}

function cookieValue(req, name) {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    try { return decodeURIComponent(part.slice(idx + 1).trim()); } catch { return part.slice(idx + 1).trim(); }
  }
  return '';
}

function mediaSignature(mediaId, viewerId, expiresAt) {
  return crypto.createHmac('sha256', JWT_SECRET)
    .update(`${Number(mediaId)}.${Number(viewerId)}.${Number(expiresAt)}`)
    .digest('base64url');
}

function protectedMediaUrl(mediaId, viewerId) {
  if (!mediaId || !viewerId) return '';
  const expiresAt = Math.floor(Date.now() / 1000) + MEDIA_URL_TTL_SECONDS;
  const sig = mediaSignature(mediaId, viewerId, expiresAt);
  return `/protected-media/${Number(mediaId)}?uid=${Number(viewerId)}&exp=${expiresAt}&sig=${encodeURIComponent(sig)}`;
}

function verifyProtectedMediaRequest(req) {
  const mediaId = Number(req.params.id);
  const viewerId = Number(req.query.uid);
  const expiresAt = Number(req.query.exp);
  const sig = String(req.query.sig || '');
  if (!Number.isSafeInteger(mediaId) || mediaId <= 0 || !Number.isSafeInteger(viewerId) || viewerId <= 0 || !Number.isSafeInteger(expiresAt) || !sig) return null;
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt < now || expiresAt > now + 2 * 60 * 60) return null;
  const expected = mediaSignature(mediaId, viewerId, expiresAt);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const rawSession = cookieValue(req, MEDIA_SESSION_COOKIE);
  if (!rawSession) return null;
  try {
    const session = jwt.verify(rawSession, JWT_SECRET);
    if (session.scope !== 'media' || Number(session.id) !== viewerId) return null;
  } catch { return null; }
  return { mediaId, viewerId };
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

async function cleanupMediaIfUnused(mediaId) {
  if (!mediaId) return false;
  const localUrl = `/media/${mediaId}`;
  const { rows } = await pool.query(`
    SELECT m.id,m.provider,m.provider_id,m.resource_type,m.delivery_type
      FROM media m
     WHERE m.id=$1
       AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.media_id=m.id)
       AND NOT EXISTS (SELECT 1 FROM stories s WHERE s.media_id=m.id)
       AND NOT EXISTS (SELECT 1 FROM messages msg WHERE msg.media_id=m.id)
       AND NOT EXISTS (SELECT 1 FROM users u WHERE u.avatar=$2 OR u.cover=$2)
  `, [mediaId, localUrl]);
  const item = rows[0];
  if (!item) return false;
  await pool.query('DELETE FROM media WHERE id=$1', [mediaId]);
  if (item.provider === 'cloudinary') await destroyRemoteAsset(item);
  return true;
}

async function removeProfileMedia(userId, field) {
  if (!['avatar', 'cover'].includes(field)) throw new Error('Campo de perfil no válido');
  const { rows } = await pool.query(`SELECT ${field} AS value FROM users WHERE id = $1`, [userId]);
  if (!rows[0]) throw new Error('Usuario no encontrado');
  const current = rows[0].value || '';
  const mediaId = mediaIdFromStoredUrl(current);
  await pool.query(`UPDATE users SET ${field} = '' WHERE id = $1`, [userId]);
  if (mediaId) await cleanupMediaIfUnused(mediaId);
  return { ok: true };
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
    const { rows } = await pool.query('SELECT id,username,email,role,account_status,social_hidden,session_invalid_before FROM users WHERE id=$1', [decoded.id]);
    if (!rows[0] || rows[0].account_status === 'suspended') return next(new Error('Cuenta no disponible'));
    if (rows[0].session_invalid_before && decoded.iat && decoded.iat * 1000 + 1000 < new Date(rows[0].session_invalid_before).getTime()) return next(new Error('Sesión invalidada'));
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
  if (previous === 0 && !isSociallyHiddenRecord(socket.user)) await broadcastPresence(userId, true);

  socket.on('typing', async (payload = {}) => {
    try {
      if (isSociallyHiddenRecord(socket.user)) return;
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
      if (!isSociallyHiddenRecord(socket.user)) await broadcastPresence(userId, false);
    }
  });
});


const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 30;

function pageLimit(req, fallback = DEFAULT_PAGE_SIZE) {
  const n = Number(req.query.limit || fallback);
  return Math.min(MAX_PAGE_SIZE, Math.max(5, Number.isFinite(n) ? Math.floor(n) : fallback));
}

function pageOffset(req) {
  const n = Number(req.query.offset || 0);
  return Math.max(0, Number.isFinite(n) ? Math.floor(n) : 0);
}

function cursorId(req) {
  const n = Number(req.query.cursor || 0);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function attachProtectedMediaUrls(items = [], viewerId) {
  const ids = [...new Set(items.map(item => Number(item.media_id)).filter(Number.isSafeInteger))];
  if (!ids.length || !viewerId) return items;
  const { rows } = await pool.query(`
    SELECT m.id,m.user_id,u.friend_gate_enabled,u.content_watermark_mode
      FROM media m
      JOIN users u ON u.id=m.user_id
     WHERE m.id = ANY($1::bigint[])
  `,[ids]);
  const media = new Map(rows.map(row => [Number(row.id), row]));
  return items.map(item => {
    const m = media.get(Number(item.media_id));
    if (!m) return item;
    const mode = String(m.content_watermark_mode || 'exclusive');
    const watermarked = Number(m.user_id) !== Number(viewerId) && (mode === 'all' || (mode === 'exclusive' && Boolean(m.friend_gate_enabled)));
    return {
      ...item,
      media_url: protectedMediaUrl(item.media_id, viewerId),
      media_protected: true,
      watermarked
    };
  });
}

function offsetPage(items, limit, offset) {
  const hasMore = items.length > limit;
  const pageItems = items.slice(0, limit);
  return {
    items: pageItems,
    has_more: hasMore,
    next_offset: hasMore ? offset + pageItems.length : null
  };
}

function normalizePost(row) {
  return {
    ...row,
    media_url: '',
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
           u.username,u.name,u.avatar,u.friend_gate_enabled,u.content_watermark_mode,
           (u.account_status='active' AND COALESCE(u.social_hidden,FALSE)=FALSE AND (p.user_id=$1 OR (NOT u.account_private) OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=p.user_id))
            AND (
              p.user_id=$1 OR NOT u.friend_gate_enabled OR
              EXISTS(SELECT 1 FROM friendships ergfr WHERE (ergfr.user1_id=$1 AND ergfr.user2_id=p.user_id) OR (ergfr.user1_id=p.user_id AND ergfr.user2_id=$1)) OR
              (
                CASE WHEN u.friend_gate_require_post
                  THEN (SELECT COUNT(*) FROM referral_attributions erra WHERE erra.inviter_id=$1 AND erra.gate_user_id=p.user_id AND erra.qualified_at IS NOT NULL)
                  ELSE (SELECT COUNT(*) FROM referral_attributions erra WHERE erra.inviter_id=$1 AND erra.gate_user_id=p.user_id)
                END
              ) >= u.friend_gate_required_referrals
            )
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
      media_url:original.media_id ? protectedMediaUrl(original.media_id,userId) : '',
      media_protected:Boolean(original.media_id),
      watermarked:Boolean(original.media_id) && Number(original.user_id)!==Number(userId) && (String(original.content_watermark_mode||'exclusive')==='all' || (String(original.content_watermark_mode||'exclusive')==='exclusive' && Boolean(original.friend_gate_enabled))),
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
    'SELECT id,username FROM users WHERE LOWER(username) = ANY($1::text[]) AND COALESCE(social_hidden,FALSE)=FALSE',
    [usernames]
  );
  for (const user of rows) {
    if (Number(user.id) === Number(actorId)) continue;
    await addNotification(client, { userId:user.id, actorId, type:'mention', postId, text:String(text || '').slice(0,220) });
  }
}

async function postQuery(userId, { mode = 'following', profileId = null, search = '', limit = 60, cursor = null, paged = false } = {}) {
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
  if (cursor) {
    params.push(Number(cursor));
    clauses.push(`p.id < $${params.length}`);
  }

  clauses.push(`NOT EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$1))`);
  clauses.push(`(p.user_id=$1 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=p.user_id))`);
  clauses.push(`(
    p.user_id=$1 OR NOT u.friend_gate_enabled OR
    EXISTS(SELECT 1 FROM friendships fgfr WHERE (fgfr.user1_id=$1 AND fgfr.user2_id=p.user_id) OR (fgfr.user1_id=p.user_id AND fgfr.user2_id=$1)) OR
    (
      CASE WHEN u.friend_gate_require_post
        THEN (SELECT COUNT(*) FROM referral_attributions gra WHERE gra.inviter_id=$1 AND gra.gate_user_id=p.user_id AND gra.qualified_at IS NOT NULL)
        ELSE (SELECT COUNT(*) FROM referral_attributions gra WHERE gra.inviter_id=$1 AND gra.gate_user_id=p.user_id)
      END
    ) >= u.friend_gate_required_referrals
  )`);
  if (!profileId) clauses.push(`NOT EXISTS (SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=p.user_id)`);
  clauses.push(`u.account_status = 'active'`);
  clauses.push(`COALESCE(u.social_hidden,FALSE)=FALSE`);
  clauses.push(`(p.visibility = 'public' OR p.user_id = $1 OR (p.visibility = 'followers' AND EXISTS (SELECT 1 FROM follows vf WHERE vf.follower_id = $1 AND vf.followed_id = p.user_id)))`);

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const requestedLimit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(limit) || DEFAULT_PAGE_SIZE));
  params.push(paged ? requestedLimit + 1 : requestedLimit);

  const { rows } = await pool.query(`
    WITH candidates AS (
      SELECT
        p.id, p.user_id, p.text, p.media_id, p.media_type, p.source, p.visibility, p.created_at, p.edited_at, p.repost_of_id,
        u.username, u.name, u.avatar
      FROM posts p
      JOIN users u ON u.id = p.user_id
      ${where}
      ORDER BY p.id DESC
      LIMIT $${params.length}
    )
    SELECT
      c.*,
      (SELECT COUNT(*)::int FROM likes l JOIN users lu ON lu.id=l.user_id WHERE l.post_id = c.id AND COALESCE(lu.social_hidden,FALSE)=FALSE) AS likes_count,
      (SELECT COUNT(*)::int FROM comments cm JOIN users cu ON cu.id=cm.user_id WHERE cm.post_id = c.id AND COALESCE(cu.social_hidden,FALSE)=FALSE) AS comments_count,
      EXISTS(SELECT 1 FROM likes lx WHERE lx.post_id = c.id AND lx.user_id = $1) AS liked,
      EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = c.id AND b.user_id = $1) AS saved,
      (c.user_id = $1) AS own
    FROM candidates c
    ORDER BY c.id DESC
  `, params);

  const hasMore = paged && rows.length > requestedLimit;
  const selected = paged ? rows.slice(0, requestedLimit) : rows;
  let posts = selected.map(normalizePost);
  posts = await attachProtectedMediaUrls(posts, userId);
  posts = await enrichReposts(userId, posts);

  if (!paged) return posts;
  return {
    items: posts,
    has_more: hasMore,
    next_cursor: hasMore && posts.length ? String(posts[posts.length - 1].id) : null
  };
}

async function addNotification(client, { userId, actorId, type, postId = null, text = '' }) {
  if (String(userId) === String(actorId)) return null;
  const involved=[Number(userId),Number(actorId)].filter(Number.isSafeInteger);
  if(involved.length){
    const hidden=await client.query(`SELECT 1 FROM users WHERE id=ANY($1::bigint[]) AND social_hidden=TRUE LIMIT 1`,[involved]);
    if(hidden.rowCount) return null;
  }
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


async function friendGateProgress(inviterId, gateUserId, client = pool) {
  const targetResult = await client.query(`
    SELECT id, username, invite_code, friend_gate_enabled, friend_gate_required_referrals,
           friend_gate_require_post, friend_gate_auto_accept, friend_gate_message
      FROM users WHERE id=$1 AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE LIMIT 1
  `,[gateUserId]);
  const target = targetResult.rows[0];
  if (!target) return null;
  const { rows } = await client.query(`
    SELECT COUNT(*)::int AS registered,
           COUNT(*) FILTER (WHERE qualified_at IS NOT NULL)::int AS qualified
      FROM referral_attributions
     WHERE inviter_id=$1 AND gate_user_id=$2
  `,[inviterId,gateUserId]);
  const registered = Number(rows[0]?.registered || 0);
  const qualified = Number(rows[0]?.qualified || 0);
  const required = Math.max(1, Number(target.friend_gate_required_referrals || 5));
  const requirePost = target.friend_gate_require_post !== false;
  const progress = requirePost ? qualified : registered;
  if(progress >= required) await markFriendGateCompleted(inviterId,gateUserId,client);
  return {
    enabled:Boolean(target.friend_gate_enabled),
    required,
    require_post:requirePost,
    auto_accept:target.friend_gate_auto_accept !== false,
    registered,
    qualified,
    progress,
    unlocked:progress >= required,
    gate_code:target.invite_code || '',
    username:target.username,
    access_message:String(target.friend_gate_message || '').slice(0,220)
  };
}

async function autoCompleteFriendGate(client, inviterId, gateUserId) {
  if (!gateUserId) return false;
  const gate = await friendGateProgress(inviterId, gateUserId, client);
  if (!gate?.enabled || !gate.unlocked || !gate.auto_accept) return false;
  const blocked = await client.query(`SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1`,[inviterId,gateUserId]);
  if (blocked.rowCount) return false;
  const a=Math.min(Number(inviterId),Number(gateUserId)), b=Math.max(Number(inviterId),Number(gateUserId));
  const inserted = await client.query(`INSERT INTO friendships(user1_id,user2_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user1_id`,[a,b]);
  await client.query(`UPDATE friend_requests SET status='declined',updated_at=NOW() WHERE status='pending' AND ((from_user_id=$1 AND to_user_id=$2) OR (from_user_id=$2 AND to_user_id=$1))`,[inviterId,gateUserId]);
  if (inserted.rowCount) await addNotification(client,{userId:inviterId,actorId:gateUserId,type:'friend_accept'});
  return Boolean(inserted.rowCount);
}


app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, version: '1.12.3', database: 'postgresql', mode: 'own-community', email: { configured: emailConfigured(), provider: EMAIL_PROVIDER, verification_required: REQUIRE_EMAIL_VERIFICATION }, media: { configured: cloudinaryConfigured(), provider: cloudinaryConfigured() ? 'cloudinary' : 'postgresql-fallback' }, features: ['stories','reels','messages','friends','realtime','replies','private-sharing','mentions','hashtags','reposts','post-editing','advanced-profiles','for-you','people-suggestions','personalized-discovery','private-accounts','follow-requests','blocking','muting','reports','message-privacy','onboarding','account-settings','password-change','account-deletion','admin-moderation','report-review','ux-quality','connection-status','optimistic-actions','instant-admirers-brand','pwa-assets','seo-metadata','legal-pages','18-plus-registration','terms-acceptance','mobile-profile-ux','mobile-logout','composer-media-ux','compact-mobile-auth','visual-polish','unified-ui','profile-visual-refresh','email-verification','password-recovery','email-change','rate-limits','security-events','resend-email','whatsapp-invites','referrals','friend-access-gates','dual-invite-flows','direct-profile-invites','profile-access-locks','pretty-profile-urls','shareable-profile-links','compact-access-gate','mobile-auth-personality','mobile-auth-final-polish','direct-profile-auth-return','validated-profile-routes','profile-return-no-fallback','profile-image-live-preview','external-media-storage','cloudinary-media','legacy-media-migration','media-cleanup','large-video-uploads','upload-error-recovery','mobile-camera-capture','feed-pagination','profile-pagination','discover-pagination','reels-pagination','bookmarks-pagination','infinite-scroll','lazy-video-loading','viewport-video-pause','cloudinary-auto-image-optimization','performance-indexes','rightbar-cache','static-asset-cache','pwa-installable','service-worker','offline-launch','install-prompt','maskable-icons','standalone-app','controlled-launch','registration-modes','launch-dashboard','activation-checklist','operational-metrics','client-error-reporting','server-error-log','demo-lab','synthetic-test-data','demo-cleanup','launch-readiness','launch-phases','launch-cohort','launch-banner','launch-invite-link','launch-settings-type-fix','community-warm-start','newcomer-spotlight','founding-cohort','community-launch-dashboard','growth-engine','campaign-links','campaign-attribution','growth-funnel','viral-referral-tracking','enhanced-access-challenge','admin-user-management','admin-user-deletion','follow-lists','clickable-profile-stats','connections-hub','following-in-friends','profile-stat-links-fix','pwa-auto-refresh','advertising-management','image-ads','google-adsense-code','ad-scheduling','ad-profile-targeting','ad-impressions-clicks','ad-visible-copy','system-admin-account','social-admin-exclusion','bilingual-ui','spanish-english','browser-language-detection','saved-language-preference','bilingual-legal-pages','bilingual-ad-copy','protected-profile-content','gate-aware-discovery','signed-media-delivery','session-bound-media','protected-media-proxy','authenticated-cloudinary-uploads','viewer-watermarks','download-deterrence','enhanced-contextmenu-deterrence','resilient-media-streaming','media-upstream-error-isolation','profile-access-message','compact-direct-profile-auth'] });
}));

app.get('/api/launch/status', asyncRoute(async (_req, res) => {
  const settings = await getLaunchSettings();
  res.json({
    registration_mode:settings.registration_mode,
    invite_required:settings.registration_mode === 'invite_only',
    registration_paused:settings.registration_mode === 'paused',
    launch_phase:settings.launch_phase || 'prelaunch',
    cohort_target:Number(settings.cohort_target || 100),
    banner_enabled:Boolean(settings.banner_enabled),
    banner_text:String(settings.banner_text || ''),
    public_launched_at:settings.public_launched_at || null
  });
}));


// V1.8 · Warm-start de comunidad real. Sin perfiles ni publicaciones ficticias.
app.get('/api/community/bootstrap', auth, asyncRoute(async (req,res) => {
  const settings = await getLaunchSettings();
  const metricsResult = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE) AS members_total,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE AND created_at >= NOW()-INTERVAL '7 days') AS members_7d,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND p.visibility='public' AND p.created_at >= NOW()-INTERVAL '7 days') AS posts_7d,
      (SELECT COUNT(DISTINCT ae.user_id)::int FROM app_events ae JOIN users u ON u.id=ae.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND ae.event_type='session_active' AND ae.created_at >= NOW()-INTERVAL '7 days') AS active_7d
  `);
  const recentResult = settings.newcomer_spotlight_enabled ? await pool.query(`
    SELECT u.id,u.username,u.name,u.bio,u.avatar,u.location,u.headline,u.interests,u.created_at,u.last_seen_at,u.account_private,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.followed_id=u.id) AS following,
      EXISTS(SELECT 1 FROM follow_requests frq WHERE frq.follower_id=$1 AND frq.followed_id=u.id) AS follow_requested,
      (SELECT COUNT(*)::int FROM follows f WHERE f.followed_id=u.id) AS followers_count
    FROM users u
    WHERE u.id<>$1 AND u.is_demo=FALSE AND u.account_status='active' AND COALESCE(u.social_hidden,FALSE)=FALSE AND u.email_verified_at IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=u.id) OR (bl.blocker_id=u.id AND bl.blocked_id=$1))
      AND NOT EXISTS(SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=u.id)
    ORDER BY u.created_at DESC,u.id DESC LIMIT 8
  `,[req.user.id]) : {rows:[]};
  const rankResult = await pool.query(`
    SELECT cohort_rank FROM (
      SELECT id,ROW_NUMBER() OVER(ORDER BY created_at ASC,id ASC)::int AS cohort_rank
      FROM users WHERE is_demo=FALSE AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE
    ) q WHERE id=$1 LIMIT 1
  `,[req.user.id]);
  const cohortRank=Number(rankResult.rows[0]?.cohort_rank || 0);
  const foundingLimit=Math.max(10,Number(settings.founding_member_limit || 100));
  const prompts = settings.starter_prompts_enabled
    ? COMMUNITY_PROMPTS.map((p,i)=>COMMUNITY_PROMPTS[(i + (Number(req.user.id)||0)) % COMMUNITY_PROMPTS.length]).slice(0,6)
    : [];
  res.json({
    phase:settings.launch_phase || 'prelaunch',
    metrics:metricsResult.rows[0] || {members_total:0,members_7d:0,posts_7d:0,active_7d:0},
    prompts,
    newcomers:recentResult.rows.map(r=>({...r,online:isOnline(r.id),recommendation_reason:'Recién llegado a Instant Admirers'})),
    viewer:{ founding_member:cohortRank>0 && cohortRank<=foundingLimit, cohort_rank:cohortRank, founding_member_limit:foundingLimit },
    settings:{ starter_prompts_enabled:Boolean(settings.starter_prompts_enabled), newcomer_spotlight_enabled:Boolean(settings.newcomer_spotlight_enabled) }
  });
}));


// V1.9: visita anónima de campaña. Solo agrega una página vista; no guarda IP ni identificador de visitante.
app.post('/api/growth/campaign/visit', asyncRoute(async (req,res) => {
  const campaign=await growthCampaignBySlug(req.body?.campaign || '');
  if(!campaign) return res.status(404).json({error:'Campaña no disponible'});
  await incrementGrowthDaily(campaign.id,'visits');
  res.json({ok:true,campaign:{slug:campaign.slug,name:campaign.name,channel:campaign.channel,target_username:campaign.target_username}});
}));

const RESERVED_PROFILE_SLUGS = new Set([
  'api','media','protected-media','assets','socket.io','legal','privacy','cookies','terms','community-guidelines','en',
  'favicon.ico','manifest.webmanifest','sw.js','offline.html','robots.txt','sitemap.xml','login','register','logout','admin',
  'feed','reels','discover','search','messages','notifications','bookmarks','friends','settings','profile',
  'invite','invites','help','support','about'
]);

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { username, name, email, password, age_confirmed, terms_accepted, terms_version, referral_code, gate_code, campaign_code, language } = req.body;
  if (!username || !name || !email || !password) return res.status(400).json({ error: 'Faltan datos' });
  if (age_confirmed !== true) return res.status(400).json({ error: 'Debes confirmar que tienes 18 años o más' });
  if (terms_accepted !== true) return res.status(400).json({ error: 'Debes aceptar los Términos de Uso' });

  const normalizedUsername = String(username).trim().toLowerCase();
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedName = String(name).trim().slice(0, 100);
  const plainPassword = String(password);
  const preferredLanguage=['es','en'].includes(String(language||'').toLowerCase()) ? String(language).toLowerCase() : '';

  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(normalizedUsername)) return res.status(400).json({ error: 'El usuario debe tener 3-30 caracteres: letras, números, _ o .' });
  if (RESERVED_PROFILE_SLUGS.has(normalizedUsername)) return res.status(400).json({ error: 'Ese nombre de usuario está reservado. Elige otro.' });
  if (!normalizedEmail.includes('@') || normalizedEmail.length > 255) return res.status(400).json({ error: 'Email inválido' });
  if (plainPassword.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

  const launchSettings = await getLaunchSettings();
  const normalizedReferral = String(referral_code || '').trim().toLowerCase().slice(0,24);
  const normalizedCampaign = normalizeCampaignSlug(campaign_code || '');
  if (launchSettings.registration_mode === 'paused') {
    return res.status(503).json({ error:'Las nuevas altas están pausadas temporalmente durante el lanzamiento controlado.', code:'REGISTRATION_PAUSED' });
  }
  if (launchSettings.registration_mode === 'invite_only') {
    if (!normalizedReferral) return res.status(403).json({ error:'Ahora mismo Instant Admirers está en fase de acceso por invitación.', code:'INVITE_REQUIRED' });
    const validInvite = await pool.query(`SELECT 1 FROM users WHERE LOWER(invite_code)=LOWER($1) LIMIT 1`, [normalizedReferral]);
    if (!validInvite.rowCount) return res.status(403).json({ error:'La invitación no es válida o ya no está disponible.', code:'INVITE_INVALID' });
  }

  const passwordHash = await bcrypt.hash(plainPassword, 10);
  try {
    const inviteCode = crypto.randomBytes(8).toString('hex');
    const user = await withTransaction(async client => {
      const { rows } = await client.query(`
        INSERT INTO users (username, name, email, password_hash, onboarding_completed, age_confirmed_at, terms_accepted_at, terms_version, invite_code, preferred_language)
        VALUES ($1, $2, $3, $4, FALSE, NOW(), NOW(), $5, $6, $7)
        RETURNING *
      `, [normalizedUsername, normalizedName, normalizedEmail, passwordHash, CURRENT_TERMS_VERSION, inviteCode, preferredLanguage]);
      const created = rows[0];
      if (normalizedCampaign) {
        const campaign=await growthCampaignBySlug(normalizedCampaign,client);
        if(campaign) await client.query(`INSERT INTO growth_campaign_attributions(user_id,campaign_id) VALUES($1,$2) ON CONFLICT (user_id) DO NOTHING`,[created.id,campaign.id]);
      }
      const ref = String(referral_code || '').trim().toLowerCase().slice(0,24);
      const gate = String(gate_code || '').trim().toLowerCase().slice(0,24);
      if (ref) {
        const inviterResult = await client.query('SELECT id FROM users WHERE LOWER(invite_code)=LOWER($1) AND id<>$2 LIMIT 1',[ref,created.id]);
        const inviter = inviterResult.rows[0];
        if (inviter) {
          let gateUserId = null;
          if (gate) {
            const gateResult = await client.query('SELECT id FROM users WHERE LOWER(invite_code)=LOWER($1) AND id<>$2 LIMIT 1',[gate,created.id]);
            if (gateResult.rows[0] && Number(gateResult.rows[0].id) !== Number(inviter.id)) gateUserId = gateResult.rows[0].id;
          }
          await client.query(`INSERT INTO referral_attributions(inviter_id,invited_user_id,gate_user_id) VALUES($1,$2,$3) ON CONFLICT (invited_user_id) DO NOTHING`,[inviter.id,created.id,gateUserId]);
          if (gateUserId) await autoCompleteFriendGate(client,inviter.id,gateUserId);
        }
      }
      return created;
    });
    const emailSent = await sendVerificationEmail(user).catch(err => { console.error('verification email:', err.message); return false; });
    await securityEvent(req, 'account_registered', user.id, { email_sent:emailSent, referral:Boolean(referral_code), gate:Boolean(gate_code), campaign:Boolean(normalizedCampaign) });
    if (REQUIRE_EMAIL_VERIFICATION) return res.json({ verification_required:true, email_sent:emailSent });
    setMediaSessionCookie(res,user);
    res.json({ token: tokenFor(user), user: safeUser(user, true), email_sent:emailSent });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Usuario o email ya existe' });
    throw err;
  }
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const value = String(req.body.emailOrUsername || '').trim().toLowerCase();
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 OR username = $1 LIMIT 1', [value]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) {
    await securityEvent(req, 'login_failed', user?.id || null, { identifier:user ? 'known' : 'unknown' });
    return res.status(401).json({ error: 'Datos incorrectos' });
  }
  if (user.account_status === 'suspended') {
    await securityEvent(req, 'login_suspended', user.id);
    return res.status(403).json({ error: 'Esta cuenta está suspendida' });
  }
  if (REQUIRE_EMAIL_VERIFICATION && !user.email_verified_at) {
    await securityEvent(req, 'login_unverified_email', user.id);
    return res.status(403).json({ error:'Debes verificar tu email antes de entrar', code:'EMAIL_NOT_VERIFIED' });
  }
  await securityEvent(req, 'login_success', user.id);
  setMediaSessionCookie(res,user);
  res.json({ token: tokenFor(user), user: safeUser(user, true) });
}));

app.post('/api/auth/logout', asyncRoute(async (_req,res) => {
  res.clearCookie(MEDIA_SESSION_COOKIE,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/'});
  res.json({ok:true});
}));

app.post('/api/auth/verify-email/request', asyncRoute(async (req,res) => {
  if (!emailConfigured()) return res.status(503).json({ error:'El envío de correo todavía no está configurado.', code:'EMAIL_NOT_CONFIGURED' });
  const email = normalizeEmail(req.body.email);
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1 LIMIT 1',[email]);
  const user = rows[0];
  if (user && !user.email_verified_at) {
    const sent = await sendVerificationEmail(user).catch(err => { console.error('verification email:',err.message); return false; });
    await securityEvent(req,'email_verification_requested',user.id,{sent});
  }
  res.json({ ok:true, message:'Si existe una cuenta pendiente de verificar, enviaremos un correo con las instrucciones.' });
}));

app.post('/api/auth/verify-email/confirm', asyncRoute(async (req,res) => {
  const raw = String(req.body.token || '');
  if (!raw) return res.status(400).json({error:'Enlace de verificación no válido'});
  const result = await withTransaction(async client => {
    const record = await consumeAccountToken(raw,'verify_email',client);
    if (!record) return null;
    const {rows}=await client.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,NOW()) WHERE id=$1 RETURNING *',[record.user_id]);
    return rows[0];
  });
  if (!result) return res.status(400).json({error:'El enlace ha caducado o ya fue utilizado'});
  await securityEvent(req,'email_verified',result.id);
  res.json({ok:true});
}));

app.post('/api/auth/forgot-password', asyncRoute(async (req,res) => {
  if (!emailConfigured()) {
    return res.status(503).json({
      error:'La recuperación por email todavía no está disponible porque falta configurar el correo saliente.',
      code:'EMAIL_NOT_CONFIGURED'
    });
  }
  const email = normalizeEmail(req.body.email);
  const {rows}=await pool.query('SELECT * FROM users WHERE email=$1 LIMIT 1',[email]);
  const user=rows[0];
  if (user) {
    const token=await createAccountToken(user.id,'reset_password',{minutes:30});
    const url=`${APP_URL}/?action=reset-password&token=${encodeURIComponent(token)}`;
    const english=String(user.preferred_language||'').toLowerCase()==='en';
    const sent=await sendEmail({to:user.email,subject:english?'Reset your password · Instant Admirers':'Restablece tu contraseña · Instant Admirers',text:english?`Reset your password at: ${url}\n\nThe link expires in 30 minutes.`:`Restablece tu contraseña en: ${url}\n\nEl enlace caduca en 30 minutos.`,html:emailShell({ lang:english?'en':'es', title:english?'Reset password':'Restablecer contraseña', body:english?'<p>We received a request to change your account password.</p>':'<p>Hemos recibido una solicitud para cambiar la contraseña de tu cuenta.</p>', buttonText:english?'Create new password':'Crear nueva contraseña', buttonUrl:url, footer:english?'The link expires in 30 minutes. If this was not you, you can ignore this message.':'El enlace caduca en 30 minutos. Si no fuiste tú, puedes ignorar este mensaje.' })}).catch(err=>{console.error('reset email:',err.message);return false;});
    await securityEvent(req,'password_reset_requested',user.id,{sent});
    if (!sent) return res.status(502).json({ error:'No hemos podido enviar el correo mediante Resend. Inténtalo de nuevo en unos minutos.', code:'EMAIL_SEND_FAILED' });
  }
  res.json({ok:true,message:'Si existe una cuenta con ese email, recibirás las instrucciones para restablecer la contraseña.'});
}));

app.post('/api/auth/reset-password', asyncRoute(async (req,res) => {
  const raw=String(req.body.token || '');
  const password=String(req.body.password || '');
  if(password.length<8) return res.status(400).json({error:'La contraseña debe tener al menos 8 caracteres'});
  const result=await withTransaction(async client=>{
    const record=await consumeAccountToken(raw,'reset_password',client);
    if(!record) return null;
    const hash=await bcrypt.hash(password,10);
    await client.query('UPDATE users SET password_hash=$2,session_invalid_before=NOW() WHERE id=$1',[record.user_id,hash]);
    await client.query(`UPDATE account_tokens SET used_at=NOW() WHERE user_id=$1 AND type='reset_password' AND used_at IS NULL`,[record.user_id]);
    return record.user_id;
  });
  if(!result) return res.status(400).json({error:'El enlace ha caducado o ya fue utilizado'});
  await securityEvent(req,'password_reset_completed',result);
  res.json({ok:true});
}));

app.post('/api/auth/change-email/confirm', asyncRoute(async (req,res) => {
  const raw=String(req.body.token || '');
  const result=await withTransaction(async client=>{
    const record=await consumeAccountToken(raw,'change_email',client);
    if(!record?.new_email) return null;
    const exists=await client.query('SELECT 1 FROM users WHERE email=$1 AND id<>$2',[record.new_email,record.user_id]);
    if(exists.rowCount) { const e=new Error('Ese email ya pertenece a otra cuenta'); e.status=409; throw e; }
    const {rows}=await client.query('UPDATE users SET email=$2,email_verified_at=NOW() WHERE id=$1 RETURNING *',[record.user_id,record.new_email]);
    return rows[0];
  });
  if(!result) return res.status(400).json({error:'El enlace ha caducado o ya fue utilizado'});
  await securityEvent(req,'email_changed',result.id);
  res.json({ok:true});
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


// V1.11.0: preferencia de idioma sincronizada con la cuenta.
app.patch('/api/me/language', auth, asyncRoute(async (req,res) => {
  const language=String(req.body?.language || '').trim().toLowerCase();
  if(!['es','en'].includes(language)) return res.status(400).json({error:'Idioma no válido'});
  const {rows}=await pool.query('UPDATE users SET preferred_language=$2 WHERE id=$1 RETURNING preferred_language',[req.user.id,language]);
  res.json(rows[0] || {preferred_language:language});
}));

app.delete('/api/me/avatar', auth, asyncRoute(async (req, res) => {
  res.json(await removeProfileMedia(req.user.id, 'avatar'));
}));

app.delete('/api/me/cover', auth, asyncRoute(async (req, res) => {
  res.json(await removeProfileMedia(req.user.id, 'cover'));
}));


// --- V1.12.0: entrega protegida de multimedia -----------------------------
async function canUserViewStory(storyId, viewerId) {
  const { rows } = await pool.query(`
    SELECT s.id
      FROM stories s
      JOIN users u ON u.id=s.user_id
     WHERE s.id=$1
       AND s.expires_at > NOW()
       AND u.account_status='active'
       AND COALESCE(u.social_hidden,FALSE)=FALSE
       AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=s.user_id) OR (bl.blocker_id=s.user_id AND bl.blocked_id=$2))
       AND (s.user_id=$2 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$2 AND pf.followed_id=s.user_id))
       AND (
         s.user_id=$2 OR NOT u.friend_gate_enabled OR
         EXISTS(SELECT 1 FROM friendships svgfr WHERE (svgfr.user1_id=$2 AND svgfr.user2_id=s.user_id) OR (svgfr.user1_id=s.user_id AND svgfr.user2_id=$2)) OR
         (
           CASE WHEN u.friend_gate_require_post
             THEN (SELECT COUNT(*) FROM referral_attributions svra WHERE svra.inviter_id=$2 AND svra.gate_user_id=s.user_id AND svra.qualified_at IS NOT NULL)
             ELSE (SELECT COUNT(*) FROM referral_attributions svra WHERE svra.inviter_id=$2 AND svra.gate_user_id=s.user_id)
           END
         ) >= u.friend_gate_required_referrals
       )
       AND (s.visibility='public' OR s.user_id=$2 OR
         (s.visibility='followers' AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.followed_id=s.user_id)))
     LIMIT 1
  `,[storyId,viewerId]);
  return Boolean(rows[0]);
}

async function canUserAccessMedia(mediaId, viewerId) {
  const mediaResult = await pool.query('SELECT id,user_id FROM media WHERE id=$1',[mediaId]);
  const media = mediaResult.rows[0];
  if (!media) return false;
  if (Number(media.user_id) === Number(viewerId)) return true;

  const posts = await pool.query('SELECT id FROM posts WHERE media_id=$1 LIMIT 20',[mediaId]);
  for (const post of posts.rows) if (await canUserViewPost(post.id,viewerId)) return true;

  const stories = await pool.query('SELECT id FROM stories WHERE media_id=$1 AND expires_at>NOW() LIMIT 20',[mediaId]);
  for (const story of stories.rows) if (await canUserViewStory(story.id,viewerId)) return true;

  const message = await pool.query(`
    SELECT 1
      FROM messages m
      JOIN conversations c ON c.id=m.conversation_id
     WHERE m.media_id=$1 AND (c.user1_id=$2 OR c.user2_id=$2)
     LIMIT 1
  `,[mediaId,viewerId]);
  return Boolean(message.rowCount);
}

async function mediaRecord(mediaId) {
  const { rows } = await pool.query(`
    SELECT id,user_id,mime_type,original_name,size_bytes,data,provider,provider_id,secure_url,
           resource_type,delivery_type,format
      FROM media WHERE id=$1
  `,[mediaId]);
  return rows[0] || null;
}

function setInlineMediaHeaders(res, item, cacheControl='private, no-store') {
  res.set('Content-Type', item.mime_type || 'application/octet-stream');
  res.set('Content-Disposition', 'inline');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cross-Origin-Resource-Policy', 'same-origin');
  res.set('Cache-Control', cacheControl);
  res.set('Accept-Ranges', 'bytes');
}

function sendBufferWithRange(req, res, item, cacheControl) {
  const buffer = Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data || '');
  const total = buffer.length;
  setInlineMediaHeaders(res,item,cacheControl);
  const range = String(req.headers.range || '');
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range);
  if (!match || !total) {
    res.set('Content-Length', String(total));
    return res.status(200).end(buffer);
  }
  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : total - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= total) {
    res.set('Content-Range', `bytes */${total}`);
    return res.status(416).end();
  }
  end = Math.min(end,total-1);
  const chunk = buffer.subarray(start,end+1);
  res.status(206);
  res.set('Content-Range', `bytes ${start}-${end}/${total}`);
  res.set('Content-Length', String(chunk.length));
  return res.end(chunk);
}

function mediaProxyErrorDetails(err) {
  const code = String(err?.code || err?.cause?.code || err?.name || 'UPSTREAM_ERROR').slice(0,80);
  const message = String(err?.message || err?.cause?.message || 'Error de multimedia upstream').slice(0,500);
  return { code, message };
}

function isClientMediaAbort(req, err) {
  if (req.aborted) return true;
  const code = String(err?.code || err?.cause?.code || '');
  return ['ERR_STREAM_PREMATURE_CLOSE','ECONNRESET','UND_ERR_ABORTED'].includes(code);
}

function reportMediaProxyError(req, item, err, stage='stream') {
  const details = mediaProxyErrorDetails(err);
  console.warn(`Protected media upstream error: media ${item?.id || '?'} [${stage}] ${details.code}: ${details.message}`);
  void operationalEvent({
    userId: req.user?.id || null,
    eventType: 'protected_media_upstream_error',
    severity: 'warning',
    path: req.originalUrl || req.path || '',
    userAgent: req.get('user-agent') || '',
    metadata: { media_id: Number(item?.id || 0) || null, stage, code: details.code, message: details.message }
  });
}

async function proxyCloudinaryMedia(req, res, item, cacheControl) {
  const source = cloudinaryDeliveryUrl(item);
  if (!source) return res.status(404).end();

  const controller = new AbortController();
  let headerTimeout = null;
  let timeoutTriggered = false;
  const abortForClientDisconnect = () => {
    if (!controller.signal.aborted) {
      try { controller.abort(new Error('Cliente desconectado antes de recibir el multimedia')); } catch (_) {}
    }
  };
  req.once('aborted', abortForClientDisconnect);

  try {
    const headers = {};
    if (req.headers.range) headers.Range = String(req.headers.range);

    // El timeout cubre la conexión y la recepción de cabeceras. No limita la
    // duración completa del vídeo: una vez recibido el upstream, manda pipeline.
    headerTimeout = setTimeout(() => {
      timeoutTriggered = true;
      if (!controller.signal.aborted) {
        try { controller.abort(new Error('Timeout esperando respuesta multimedia de Cloudinary')); } catch (_) {}
      }
    }, 20000);
    headerTimeout.unref?.();

    const upstream = await fetch(source, {
      headers,
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(headerTimeout);
    headerTimeout = null;

    if (!(upstream.ok || upstream.status === 206)) {
      try { await upstream.body?.cancel(); } catch (_) {}
      return res.status(upstream.status === 404 ? 404 : 502).end();
    }

    setInlineMediaHeaders(res,item,cacheControl);
    res.status(upstream.status);
    for (const name of ['content-length','content-range','accept-ranges']) {
      const value=upstream.headers.get(name);
      if (value) res.set(name,value);
    }
    const contentType=upstream.headers.get('content-type');
    if (contentType) res.set('Content-Type',contentType);
    if (!upstream.body) return res.end();

    // Importante: pipe() deja errores del Readable sin capturar. pipeline()
    // observa ambos extremos y convierte un HTTP/2 abortado en un rechazo que
    // manejamos aquí, evitando que Node termine por un 'error' no controlado.
    await pipeline(Readable.fromWeb(upstream.body), res);
    return;
  } catch (err) {
    if (headerTimeout) clearTimeout(headerTimeout);

    // Si el visitante cerró la pestaña, cambió de Reel o canceló el vídeo, no
    // es un error de servidor y no debe generar ruido ni reiniciar el proceso.
    if (isClientMediaAbort(req, err) && !timeoutTriggered) return;

    reportMediaProxyError(req,item,err,timeoutTriggered ? 'headers-timeout' : 'stream');

    if (!res.headersSent && !res.destroyed) {
      return res.status(timeoutTriggered ? 504 : 502).end();
    }
    // Si ya empezamos a transmitir no podemos cambiar el status HTTP. Cerramos
    // solo esta respuesta; pipeline ya ha absorbido el error del upstream.
    if (!res.destroyed) res.destroy();
    return;
  } finally {
    if (headerTimeout) clearTimeout(headerTimeout);
    req.off('aborted', abortForClientDisconnect);
    if (!controller.signal.aborted && req.aborted) {
      try { controller.abort(new Error('Petición multimedia abortada')); } catch (_) {}
    }
  }
}

async function serveMedia(req, res, item, cacheControl='private, no-store') {
  if (!item) return res.status(404).end();
  if (item.provider === 'cloudinary' && item.provider_id) return proxyCloudinaryMedia(req,res,item,cacheControl);
  if (item.provider === 'demo' && /^\/assets\/demo\/[a-z0-9._-]+$/i.test(String(item.secure_url || ''))) {
    const demoPath = path.join(publicDir, String(item.secure_url).replace(/^\//,''));
    res.set('Cache-Control',cacheControl);
    res.set('Content-Disposition','inline');
    res.set('X-Content-Type-Options','nosniff');
    res.set('Cross-Origin-Resource-Policy','same-origin');
    return res.sendFile(demoPath);
  }
  if (item.data) return sendBufferWithRange(req,res,item,cacheControl);
  return res.status(404).end();
}

app.get('/protected-media/:id', asyncRoute(async (req,res) => {
  // Un enlace copiado no debe convertirse en una página descargable al abrirlo directamente.
  // Si el navegador no envía Sec-Fetch-Dest, no bloqueamos para mantener compatibilidad.
  const fetchDest = String(req.get('sec-fetch-dest') || '').toLowerCase();
  if (fetchDest === 'document') return res.status(404).end();
  const signed = verifyProtectedMediaRequest(req);
  if (!signed) return res.status(404).end();
  if (!(await canUserAccessMedia(signed.mediaId,signed.viewerId))) return res.status(404).end();
  const item = await mediaRecord(signed.mediaId);
  res.set('X-Robots-Tag','noindex, nofollow, noarchive');
  res.set('Referrer-Policy','same-origin');
  return serveMedia(req,res,item,'private, no-store, max-age=0');
}));

app.post('/api/upload', auth, upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta archivo' });

  const isVideo = String(req.file.mimetype || '').startsWith('video/');
  const maxBytes = isVideo ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
  if (Number(req.file.size || 0) > maxBytes) {
    return res.status(413).json({
      error: isVideo
        ? 'El vídeo supera el límite de 100 MB.'
        : 'La imagen supera el límite de 10 MB.',
      code: 'MEDIA_TOO_LARGE'
    });
  }

  let mediaId;
  let provider = 'postgresql';
  if (cloudinaryConfigured()) {
    const uploaded = await uploadMediaBuffer(req.file.buffer, {
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      userId: req.user.id,
      privateDelivery: true
    });
    const { rows } = await pool.query(`
      INSERT INTO media (
        user_id,mime_type,original_name,size_bytes,data,provider,provider_id,secure_url,
        resource_type,delivery_type,width,height,duration_seconds,format,migrated_at
      ) VALUES ($1,$2,$3,$4,NULL,'cloudinary',$5,$6,$7,$8,$9,$10,$11,$12,NOW()) RETURNING id
    `, [
      req.user.id, req.file.mimetype, req.file.originalname, uploaded.sizeBytes || req.file.size,
      uploaded.providerId, uploaded.secureUrl, uploaded.resourceType, uploaded.deliveryType || 'authenticated', uploaded.width, uploaded.height,
      uploaded.durationSeconds, uploaded.format
    ]);
    mediaId = rows[0].id;
    provider = 'cloudinary';
  } else {
    const { rows } = await pool.query(`
      INSERT INTO media (user_id, mime_type, original_name, size_bytes, data, provider)
      VALUES ($1, $2, $3, $4, $5, 'postgresql') RETURNING id
    `, [req.user.id, req.file.mimetype, req.file.originalname, req.file.size, req.file.buffer]);
    mediaId = rows[0].id;
  }

  res.json({ media_id: mediaId, url: `/media/${mediaId}`, mime: req.file.mimetype, provider });
}));

// Compatibilidad para avatar y portada. El contenido de posts/Stories/Reels/mensajes
// ya no se sirve desde una URL pública permanente.
app.get('/media/:id', asyncRoute(async (req, res) => {
  const mediaId=Number(req.params.id);
  if(!Number.isSafeInteger(mediaId)||mediaId<=0) return res.status(404).end();
  const localUrl=`/media/${mediaId}`;
  const profileUse=await pool.query(`SELECT 1 FROM users WHERE avatar=$1 OR cover=$1 LIMIT 1`,[localUrl]);
  if(!profileUse.rowCount) return res.status(404).end();
  const item=await mediaRecord(mediaId);
  return serveMedia(req,res,item,'public, max-age=3600, stale-while-revalidate=86400');
}));

app.post('/api/posts', auth, socialAccountOnly, asyncRoute(async (req, res) => {
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
    const qualifiedReferrals=await client.query('UPDATE referral_attributions SET qualified_at=NOW() WHERE invited_user_id=$1 AND qualified_at IS NULL RETURNING inviter_id,gate_user_id',[req.user.id]);
    for (const ref of qualifiedReferrals.rows) if (ref.gate_user_id) await autoCompleteFriendGate(client,ref.inviter_id,ref.gate_user_id);
    return rows[0];
  });
  res.json({ id: result.id });
}));

app.delete('/api/posts/:id', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id,media_id', [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Publicación no encontrada' });
  if (rows[0].media_id) await cleanupMediaIfUnused(rows[0].media_id);
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

app.post('/api/posts/:id/repost', auth, socialAccountOnly, asyncRoute(async (req, res) => {
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
  const limit = pageLimit(req, 15);
  res.json(await postQuery(req.user.id, { mode: 'following', limit, cursor: cursorId(req), paged: true }));
}));

app.get('/api/for-you', auth, asyncRoute(async (req, res) => {
  const limit = pageLimit(req, 15);
  const offset = pageOffset(req);
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
    ), candidates AS (
      SELECT
        p.id, p.user_id, p.text, p.media_id, p.media_type, p.source, p.visibility, p.created_at, p.edited_at, p.repost_of_id,
        u.username, u.name, u.avatar, u.interests AS author_interests, u.headline AS author_headline
      FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE u.account_status='active'
        AND COALESCE(u.social_hidden,FALSE)=FALSE
        AND (p.visibility = 'public' OR p.user_id = $1)
        AND (p.user_id=$1 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=p.user_id))
        AND (
          p.user_id=$1 OR NOT u.friend_gate_enabled OR
          EXISTS(SELECT 1 FROM friendships fygfr WHERE (fygfr.user1_id=$1 AND fygfr.user2_id=p.user_id) OR (fygfr.user1_id=p.user_id AND fygfr.user2_id=$1)) OR
          (
            CASE WHEN u.friend_gate_require_post
              THEN (SELECT COUNT(*) FROM referral_attributions fyra WHERE fyra.inviter_id=$1 AND fyra.gate_user_id=p.user_id AND fyra.qualified_at IS NOT NULL)
              ELSE (SELECT COUNT(*) FROM referral_attributions fyra WHERE fyra.inviter_id=$1 AND fyra.gate_user_id=p.user_id)
            END
          ) >= u.friend_gate_required_referrals
        )
        AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$1))
        AND NOT EXISTS(SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=p.user_id)
      ORDER BY p.id DESC
      LIMIT 300
    ), scored AS (
      SELECT
        cp.*,
        (SELECT COUNT(*)::int FROM likes l JOIN users lu ON lu.id=l.user_id WHERE l.post_id=cp.id AND COALESCE(lu.social_hidden,FALSE)=FALSE) AS likes_count,
        (SELECT COUNT(*)::int FROM comments c JOIN users cu ON cu.id=c.user_id WHERE c.post_id=cp.id AND COALESCE(cu.social_hidden,FALSE)=FALSE) AS comments_count,
        EXISTS(SELECT 1 FROM likes lx WHERE lx.post_id = cp.id AND lx.user_id = $1) AS liked,
        EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = cp.id AND b.user_id = $1) AS saved,
        (cp.user_id = $1) AS own,
        COALESCE(a.score,0)::numeric AS affinity_score,
        CASE WHEN EXISTS (
          SELECT 1
            FROM regexp_split_to_table((SELECT interests FROM viewer), '\s*,\s*') AS term
           WHERE LENGTH(TRIM(term)) >= 2
             AND (
               LOWER(COALESCE(cp.text,'')) LIKE '%' || TRIM(term) || '%'
               OR LOWER(COALESCE(cp.author_interests,'')) LIKE '%' || TRIM(term) || '%'
               OR LOWER(COALESCE(cp.author_headline,'')) LIKE '%' || TRIM(term) || '%'
             )
        ) THEN 1 ELSE 0 END AS interest_match,
        EXISTS (
          SELECT 1
            FROM follows mine
            JOIN follows second_degree ON second_degree.follower_id = mine.followed_id
           WHERE mine.follower_id = $1 AND second_degree.followed_id = cp.user_id
        ) AS mutual_signal,
        EXISTS(SELECT 1 FROM follows mine WHERE mine.follower_id = $1 AND mine.followed_id = cp.user_id) AS following_author,
        EXTRACT(EPOCH FROM (NOW() - cp.created_at)) / 3600.0 AS age_hours
      FROM candidates cp
      LEFT JOIN affinity a ON a.author_id = cp.user_id
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
    LIMIT $2 OFFSET $3
  `, [req.user.id, limit + 1, offset]);
  let posts = rows.map(r => ({ ...normalizePost(r), recommendation_reason: recommendationReason(r) }));
  posts = await attachProtectedMediaUrls(posts, req.user.id);
  posts = await enrichReposts(req.user.id, posts);
  res.json(offsetPage(posts, limit, offset));
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
      AND COALESCE(u.social_hidden,FALSE)=FALSE
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
  const limit = pageLimit(req, 15);
  const offset = pageOffset(req);
  const { rows } = await pool.query(`
    WITH candidates AS (
      SELECT
        p.id, p.user_id, p.text, p.media_id, p.media_type, p.source, p.visibility, p.created_at, p.edited_at, p.repost_of_id,
        u.username, u.name, u.avatar
      FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE u.account_status='active'
        AND COALESCE(u.social_hidden,FALSE)=FALSE
        AND (p.visibility = 'public' OR p.user_id = $1)
        AND (p.user_id=$1 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=p.user_id))
        AND (
          p.user_id=$1 OR NOT u.friend_gate_enabled OR
          EXISTS(SELECT 1 FROM friendships dcgfr WHERE (dcgfr.user1_id=$1 AND dcgfr.user2_id=p.user_id) OR (dcgfr.user1_id=p.user_id AND dcgfr.user2_id=$1)) OR
          (
            CASE WHEN u.friend_gate_require_post
              THEN (SELECT COUNT(*) FROM referral_attributions dcra WHERE dcra.inviter_id=$1 AND dcra.gate_user_id=p.user_id AND dcra.qualified_at IS NOT NULL)
              ELSE (SELECT COUNT(*) FROM referral_attributions dcra WHERE dcra.inviter_id=$1 AND dcra.gate_user_id=p.user_id)
            END
          ) >= u.friend_gate_required_referrals
        )
        AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$1))
        AND NOT EXISTS(SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=p.user_id)
      ORDER BY p.id DESC
      LIMIT 300
    ), ranked AS (
      SELECT
        c.*,
        (SELECT COUNT(*)::int FROM likes l JOIN users lu ON lu.id=l.user_id WHERE l.post_id=c.id AND COALESCE(lu.social_hidden,FALSE)=FALSE) AS likes_count,
        (SELECT COUNT(*)::int FROM comments cm JOIN users cu ON cu.id=cm.user_id WHERE cm.post_id=c.id AND COALESCE(cu.social_hidden,FALSE)=FALSE) AS comments_count,
        EXISTS(SELECT 1 FROM likes lx WHERE lx.post_id = c.id AND lx.user_id = $1) AS liked,
        EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = c.id AND b.user_id = $1) AS saved,
        (c.user_id = $1) AS own
      FROM candidates c
    )
    SELECT * FROM ranked
    ORDER BY ((likes_count * 2) + comments_count) DESC, created_at DESC, id DESC
    LIMIT $2 OFFSET $3
  `, [req.user.id, limit + 1, offset]);
  let posts = rows.map(normalizePost);
  posts = await attachProtectedMediaUrls(posts, req.user.id);
  posts = await enrichReposts(req.user.id, posts);
  res.json(offsetPage(posts, limit, offset));
}));

app.get('/api/bookmarks', auth, asyncRoute(async (req, res) => {
  const limit = pageLimit(req, 15);
  const offset = pageOffset(req);
  const { rows } = await pool.query(`
    WITH candidates AS (
      SELECT
        p.id, p.user_id, p.text, p.media_id, p.media_type, p.source, p.visibility, p.created_at, p.edited_at, p.repost_of_id,
        u.username, u.name, u.avatar, bk.created_at AS bookmark_created_at
      FROM bookmarks bk
      JOIN posts p ON p.id = bk.post_id
      JOIN users u ON u.id = p.user_id
      WHERE bk.user_id = $1
        AND u.account_status='active'
        AND COALESCE(u.social_hidden,FALSE)=FALSE
        AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$1))
        AND (p.user_id=$1 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=p.user_id))
        AND (
          p.user_id=$1 OR NOT u.friend_gate_enabled OR
          EXISTS(SELECT 1 FROM friendships bkgfr WHERE (bkgfr.user1_id=$1 AND bkgfr.user2_id=p.user_id) OR (bkgfr.user1_id=p.user_id AND bkgfr.user2_id=$1)) OR
          (
            CASE WHEN u.friend_gate_require_post
              THEN (SELECT COUNT(*) FROM referral_attributions bkra WHERE bkra.inviter_id=$1 AND bkra.gate_user_id=p.user_id AND bkra.qualified_at IS NOT NULL)
              ELSE (SELECT COUNT(*) FROM referral_attributions bkra WHERE bkra.inviter_id=$1 AND bkra.gate_user_id=p.user_id)
            END
          ) >= u.friend_gate_required_referrals
        )
      ORDER BY bk.created_at DESC
      LIMIT $2 OFFSET $3
    )
    SELECT
      c.*,
      (SELECT COUNT(*)::int FROM likes l JOIN users lu ON lu.id=l.user_id WHERE l.post_id=c.id AND COALESCE(lu.social_hidden,FALSE)=FALSE) AS likes_count,
      (SELECT COUNT(*)::int FROM comments cm JOIN users cu ON cu.id=cm.user_id WHERE cm.post_id=c.id AND COALESCE(cu.social_hidden,FALSE)=FALSE) AS comments_count,
      EXISTS(SELECT 1 FROM likes lx WHERE lx.post_id = c.id AND lx.user_id = $1) AS liked,
      TRUE AS saved,
      (c.user_id = $1) AS own
    FROM candidates c
    ORDER BY c.bookmark_created_at DESC
  `, [req.user.id, limit + 1, offset]);
  let posts = rows.map(normalizePost);
  posts = await attachProtectedMediaUrls(posts, req.user.id);
  posts = await enrichReposts(req.user.id, posts);
  res.json(offsetPage(posts, limit, offset));
}));

app.post('/api/posts/:id/like', auth, socialAccountOnly, asyncRoute(async (req, res) => {
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
    const count = await client.query('SELECT COUNT(*)::int AS count FROM likes l JOIN users u ON u.id=l.user_id WHERE l.post_id = $1 AND COALESCE(u.social_hidden,FALSE)=FALSE', [postId]);
    return { liked, count: count.rows[0].count };
  });
  res.json(result);
}));

app.post('/api/posts/:id/bookmark', auth, socialAccountOnly, asyncRoute(async (req, res) => {
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

app.post('/api/posts/:id/comments', auth, socialAccountOnly, asyncRoute(async (req, res) => {
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
      AND COALESCE(u.social_hidden,FALSE)=FALSE
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
      AND COALESCE(u.social_hidden,FALSE)=FALSE
      AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=u.id) OR (bl.blocker_id=u.id AND bl.blocked_id=$1))
      AND ($2 = '%%' OR u.username ILIKE $2 OR u.name ILIKE $2 OR u.bio ILIKE $2)
    ORDER BY followers_count DESC, u.created_at DESC LIMIT 50
  `, [req.user.id, pattern]);
  res.json(rows.map(r => ({ ...r, online: isOnline(r.id) })));
}));

// V1.2.9: resolución pública mínima de URLs /usuario. No expone email, bio ni datos privados.
app.get('/api/public/profile/:username', asyncRoute(async (req, res) => {
  const username = String(req.params.username || '').trim().replace(/^@/, '');
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) return res.status(404).json({ error:'Perfil no encontrado' });
  const { rows } = await pool.query(
    `SELECT username, name, friend_gate_enabled, friend_gate_message
       FROM users
      WHERE LOWER(username)=LOWER($1) AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE
      LIMIT 1`,
    [username]
  );
  if (!rows[0]) return res.status(404).json({ error:'Perfil no encontrado' });
  res.json({
    exists:true,
    username:rows[0].username,
    name:rows[0].name,
    friend_gate_enabled:Boolean(rows[0].friend_gate_enabled),
    friend_gate_message:rows[0].friend_gate_enabled ? String(rows[0].friend_gate_message || '').slice(0,220) : ''
  });
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
    FROM users u WHERE LOWER(u.username) = LOWER($2) AND u.account_status='active' AND COALESCE(u.social_hidden,FALSE)=FALSE LIMIT 1
  `, [req.user.id, req.params.username]);
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  const row = rows[0];
  if (row.blocked_me && !row.own) return res.status(404).json({ error:'Perfil no disponible' });
  const canMessage = row.own ? false : await canMessageUser(req.user.id,row.id);
  const friendGate = (!row.own && row.friend_gate_enabled && row.friendship_status !== 'friends') ? await friendGateProgress(req.user.id,row.id) : null;
  if(friendGate?.enabled && !friendGate.unlocked) await recordFriendGateSession(req.user.id,row.id,req.query?.campaign || '');
  const profileLocked = Boolean(friendGate?.enabled && !friendGate.unlocked && row.friendship_status !== 'friends' && !row.own);

  if (profileLocked) {
    const teaser = safeUser(row);
    teaser.cover = '';
    teaser.headline = '';
    teaser.bio = '';
    teaser.interests = '';
    teaser.location = '';
    teaser.website = '';
    return res.json({
      ...teaser,
      can_message:false,
      followers_count:0,
      following_count:0,
      posts_count:0,
      friends_count:0,
      following:Boolean(row.following),
      follow_requested:Boolean(row.follow_requested),
      muted:Boolean(row.muted),
      blocked_by_me:Boolean(row.blocked_by_me),
      friendship_status:row.friendship_status,
      friend_request_id:row.friend_request_id,
      friend_gate:friendGate,
      profile_locked:true,
      own:false,
      online:false,
      last_seen_at:null
    });
  }

  res.json({ ...safeUser(row), can_message:canMessage, followers_count: row.followers_count, following_count: row.following_count, posts_count: row.posts_count, friends_count: row.friends_count, following: Boolean(row.following), follow_requested:Boolean(row.follow_requested), muted:Boolean(row.muted), blocked_by_me:Boolean(row.blocked_by_me), friendship_status: row.friendship_status, friend_request_id: row.friend_request_id, friend_gate:friendGate, profile_locked:false, own: Boolean(row.own), online: isOnline(row.id), last_seen_at: row.last_seen_at });
}));


// V1.9.2: listas de seguidores y perfiles seguidos, accesibles desde los contadores del perfil.
async function socialListAccess(viewerId, username) {
  const { rows } = await pool.query(`
    SELECT u.id, u.username, u.name, u.account_private, u.friend_gate_enabled,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.followed_id=u.id) AS viewer_follows,
      EXISTS(SELECT 1 FROM blocks b WHERE b.blocker_id=u.id AND b.blocked_id=$1) AS blocked_viewer,
      EXISTS(SELECT 1 FROM blocks b WHERE b.blocker_id=$1 AND b.blocked_id=u.id) AS viewer_blocked
    FROM users u
    WHERE LOWER(u.username)=LOWER($2) AND u.account_status='active' AND COALESCE(u.social_hidden,FALSE)=FALSE
    LIMIT 1
  `,[viewerId, username]);
  if (!rows[0] || (rows[0].blocked_viewer && Number(rows[0].id)!==Number(viewerId))) return null;
  const target=rows[0];
  if (Number(target.id)!==Number(viewerId)) {
    if (target.viewer_blocked) return { denied:true, reason:'blocked' };
    if (target.friend_gate_enabled) {
      const pair=friendshipPair(viewerId,target.id);
      const friendship=await pool.query('SELECT 1 FROM friendships WHERE user1_id=$1 AND user2_id=$2 LIMIT 1',pair);
      if (!friendship.rowCount) {
        const gate=await friendGateProgress(viewerId,target.id);
        if (gate?.enabled && !gate.unlocked) return { denied:true, reason:'gate' };
      }
    }
    if (target.account_private && !target.viewer_follows) return { denied:true, reason:'private' };
  }
  return { target };
}

async function socialListRows(viewerId, targetId, type, limit, offset) {
  const join = type === 'followers'
    ? 'JOIN follows rel ON rel.follower_id=u.id AND rel.followed_id=$2'
    : 'JOIN follows rel ON rel.followed_id=u.id AND rel.follower_id=$2';
  const countWhere = type === 'followers' ? 'followed_id=$1' : 'follower_id=$1';
  const [list,total] = await Promise.all([
    pool.query(`
      SELECT u.id,u.username,u.name,u.avatar,u.headline,u.account_private,rel.created_at,
        EXISTS(SELECT 1 FROM follows mine WHERE mine.follower_id=$1 AND mine.followed_id=u.id) AS following,
        EXISTS(SELECT 1 FROM follow_requests frq WHERE frq.follower_id=$1 AND frq.followed_id=u.id) AS follow_requested,
        (SELECT COUNT(*)::int FROM follows fc WHERE fc.followed_id=u.id) AS followers_count
      FROM users u
      ${join}
      WHERE u.account_status='active'
        AND COALESCE(u.social_hidden,FALSE)=FALSE
        AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=u.id) OR (bl.blocker_id=u.id AND bl.blocked_id=$1))
      ORDER BY rel.created_at DESC,u.id DESC
      LIMIT $3 OFFSET $4
    `,[viewerId,targetId,limit+1,offset]),
    pool.query(`SELECT COUNT(*)::int AS total FROM follows WHERE ${countWhere}`,[targetId])
  ]);
  const hasMore=list.rows.length>limit;
  const items=list.rows.slice(0,limit).map(r=>({...r,following:Boolean(r.following),follow_requested:Boolean(r.follow_requested)}));
  return {items,has_more:hasMore,next_offset:hasMore?offset+limit:null,total:Number(total.rows[0]?.total||0)};
}

app.get('/api/users/:username/followers', auth, asyncRoute(async (req,res)=>{
  const access=await socialListAccess(req.user.id,req.params.username);
  if (!access) return res.status(404).json({error:'Perfil no disponible'});
  if (access.denied) return res.status(403).json({error:'Esta lista no está disponible'});
  const limit=Math.min(50,Math.max(1,Number(req.query.limit)||30));
  const offset=Math.max(0,Number(req.query.offset)||0);
  const data=await socialListRows(req.user.id,access.target.id,'followers',limit,offset);
  res.json({...data,username:access.target.username,type:'followers'});
}));

app.get('/api/users/:username/following', auth, asyncRoute(async (req,res)=>{
  const access=await socialListAccess(req.user.id,req.params.username);
  if (!access) return res.status(404).json({error:'Perfil no disponible'});
  if (access.denied) return res.status(403).json({error:'Esta lista no está disponible'});
  const limit=Math.min(50,Math.max(1,Number(req.query.limit)||30));
  const offset=Math.max(0,Number(req.query.offset)||0);
  const data=await socialListRows(req.user.id,access.target.id,'following',limit,offset);
  res.json({...data,username:access.target.username,type:'following'});
}));

app.get('/api/users/:username/posts', auth, asyncRoute(async (req, res) => {
  const found = await pool.query('SELECT id,friend_gate_enabled,social_hidden,role,email FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1', [req.params.username]);
  if (!found.rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
  const target = found.rows[0];
  if (isSociallyHiddenRecord(target)) return res.status(404).json({ error:'Usuario no encontrado' });
  if (Number(target.id) !== Number(req.user.id) && target.friend_gate_enabled) {
    const pair = friendshipPair(req.user.id,target.id);
    const friendship = await pool.query('SELECT 1 FROM friendships WHERE user1_id=$1 AND user2_id=$2 LIMIT 1',pair);
    const gate = friendship.rowCount ? null : await friendGateProgress(req.user.id,target.id);
    if (gate?.enabled && !gate.unlocked) return res.status(403).json({ error:'Completa el reto para ver este perfil', code:'PROFILE_ACCESS_LOCKED', friend_gate:gate });
  }
  const limit = pageLimit(req, 15);
  res.json(await postQuery(req.user.id, { mode: 'all', profileId: target.id, limit, cursor: cursorId(req), paged: true }));
}));

app.post('/api/users/:id/follow', auth, socialAccountOnly, asyncRoute(async (req, res) => {
  const followedId = Number(req.params.id);
  const me = Number(req.user.id);
  if (!Number.isInteger(followedId) || followedId === me) return res.status(400).json({ error: 'No puedes seguirte' });
  const result = await withTransaction(async (client) => {
    const target = await client.query('SELECT id,account_private,email,role,social_hidden,account_status FROM users WHERE id=$1',[followedId]);
    if (!target.rowCount || target.rows[0].account_status!=='active' || isSociallyHiddenRecord(target.rows[0])) { const err=new Error('Usuario no encontrado'); err.status=404; throw err; }
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
  const {rows}=await pool.query(`SELECT account_private,message_policy,content_watermark_mode,
    (SELECT COUNT(*)::int FROM follow_requests WHERE followed_id=$1) AS follow_requests_count,
    (SELECT COUNT(*)::int FROM blocks WHERE blocker_id=$1) AS blocked_count,
    (SELECT COUNT(*)::int FROM mutes WHERE muter_id=$1) AS muted_count
    FROM users WHERE id=$1`,[req.user.id]);
  res.json(rows[0]);
}));

app.patch('/api/privacy', auth, asyncRoute(async (req,res)=>{
  const accountPrivate = req.body.account_private === undefined ? null : Boolean(req.body.account_private);
  const messagePolicy = req.body.message_policy === undefined ? null : String(req.body.message_policy);
  const watermarkMode = req.body.content_watermark_mode === undefined ? null : String(req.body.content_watermark_mode);
  if (messagePolicy !== null && !['everyone','followers','friends','nobody'].includes(messagePolicy)) return res.status(400).json({error:'Privacidad de mensajes inválida'});
  if (watermarkMode !== null && !['off','exclusive','all'].includes(watermarkMode)) return res.status(400).json({error:'Configuración de marca de agua inválida'});
  const result=await withTransaction(async client=>{
    const {rows}=await client.query(`UPDATE users SET account_private=COALESCE($2,account_private), message_policy=COALESCE($3,message_policy), content_watermark_mode=COALESCE($4,content_watermark_mode) WHERE id=$1 RETURNING account_private,message_policy,content_watermark_mode`,[req.user.id,accountPrivate,messagePolicy,watermarkMode]);
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
      AND COALESCE(u.social_hidden,FALSE)=FALSE
      AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=u.id) OR (bl.blocker_id=u.id AND bl.blocked_id=$1))
    ORDER BY fr.created_at DESC LIMIT 100`,[req.user.id]);
  res.json(rows.map(r=>({...r,online:isOnline(r.user_id)})));
}));

app.post('/api/follow-requests/:id/accept', auth, socialAccountOnly, asyncRoute(async (req,res)=>{
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

app.post('/api/users/:id/mute', auth, socialAccountOnly, asyncRoute(async (req,res)=>{
  const target=Number(req.params.id); if(target===Number(req.user.id)) return res.status(400).json({error:'No puedes silenciarte'});
  await assertVisibleSocialUser(target);
  await assertNotBlocked(req.user.id,target);
  const deleted=await pool.query('DELETE FROM mutes WHERE muter_id=$1 AND muted_id=$2 RETURNING muter_id',[req.user.id,target]);
  if(deleted.rowCount) return res.json({muted:false});
  await pool.query('INSERT INTO mutes (muter_id,muted_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[req.user.id,target]);
  res.json({muted:true});
}));

app.post('/api/users/:id/block', auth, socialAccountOnly, asyncRoute(async (req,res)=>{
  const target=Number(req.params.id); if(target===Number(req.user.id)) return res.status(400).json({error:'No puedes bloquearte'});
  await assertVisibleSocialUser(target);
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

app.post('/api/reports', auth, socialAccountOnly, asyncRoute(async (req,res)=>{
  const targetUserId=req.body.target_user_id?Number(req.body.target_user_id):null;
  const postId=req.body.post_id?Number(req.body.post_id):null;
  const reason=String(req.body.reason||'').trim();
  const details=String(req.body.details||'').trim().slice(0,1000);
  const allowed=['spam','harassment','impersonation','nudity','violence','hate','scam','other'];
  if(!targetUserId&&!postId) return res.status(400).json({error:'Falta el contenido a denunciar'});
  if(!allowed.includes(reason)) return res.status(400).json({error:'Motivo inválido'});
  let resolvedTarget=targetUserId;
  if(postId){ const post=await pool.query('SELECT user_id FROM posts WHERE id=$1',[postId]); if(!post.rowCount) return res.status(404).json({error:'Publicación no encontrada'}); resolvedTarget=resolvedTarget||Number(post.rows[0].user_id); }
  if(resolvedTarget){ const usr=await pool.query('SELECT id FROM users WHERE id=$1 AND COALESCE(social_hidden,FALSE)=FALSE',[resolvedTarget]); if(!usr.rowCount) return res.status(404).json({error:'Usuario no encontrado'}); }
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
     WHERE (fr.user1_id=$1 OR fr.user2_id=$1)
       AND COALESCE(u.social_hidden,FALSE)=FALSE
     ORDER BY u.name ASC
  `, [req.user.id]);
  res.json(rows.map(r => ({ ...r, online: isOnline(r.id) })));
}));

app.get('/api/friends/requests', auth, asyncRoute(async (req, res) => {
  const incoming = await pool.query(`
    SELECT fq.id,fq.created_at,u.id AS user_id,u.username,u.name,u.avatar,u.bio,u.last_seen_at
      FROM friend_requests fq JOIN users u ON u.id=fq.from_user_id
     WHERE fq.to_user_id=$1 AND fq.status='pending' AND COALESCE(u.social_hidden,FALSE)=FALSE ORDER BY fq.created_at DESC
  `,[req.user.id]);
  const outgoing = await pool.query(`
    SELECT fq.id,fq.created_at,u.id AS user_id,u.username,u.name,u.avatar,u.bio,u.last_seen_at
      FROM friend_requests fq JOIN users u ON u.id=fq.to_user_id
     WHERE fq.from_user_id=$1 AND fq.status='pending' AND COALESCE(u.social_hidden,FALSE)=FALSE ORDER BY fq.created_at DESC
  `,[req.user.id]);
  res.json({
    incoming: incoming.rows.map(r=>({ ...r, online:isOnline(r.user_id) })),
    outgoing: outgoing.rows.map(r=>({ ...r, online:isOnline(r.user_id) }))
  });
}));

// --- V1.2.3: invitaciones y retos de amistad ------------------------------
app.get('/api/invites/me', auth, asyncRoute(async (req,res)=>{
  const userResult = await pool.query(`SELECT invite_code,username,friend_gate_enabled,friend_gate_required_referrals,friend_gate_require_post FROM users WHERE id=$1`,[req.user.id]);
  const me = userResult.rows[0] || {};
  const code = me.invite_code || '';
  const {rows:summaryRows}=await pool.query(`SELECT COUNT(*)::int AS registered, COUNT(*) FILTER (WHERE qualified_at IS NOT NULL)::int AS qualified FROM referral_attributions WHERE inviter_id=$1`,[req.user.id]);
  const {rows:recent}=await pool.query(`
    SELECT ra.id,ra.registered_at,ra.qualified_at,u.id AS user_id,u.username,u.name,u.avatar,
           gate.username AS gate_username
      FROM referral_attributions ra
      JOIN users u ON u.id=ra.invited_user_id
      LEFT JOIN users gate ON gate.id=ra.gate_user_id
     WHERE ra.inviter_id=$1 ORDER BY ra.registered_at DESC LIMIT 30
  `,[req.user.id]);
  const {rows:growthRows}=await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM friend_gate_sessions fgs WHERE fgs.gate_user_id=$1) AS challenge_starts,
      (SELECT COALESCE(SUM(fgs.share_actions),0)::int FROM friend_gate_sessions fgs WHERE fgs.gate_user_id=$1) AS share_actions,
      (SELECT COUNT(*)::int FROM referral_attributions ra WHERE ra.gate_user_id=$1) AS referred_signups,
      (SELECT COUNT(*)::int FROM friend_gate_sessions fgs WHERE fgs.gate_user_id=$1 AND fgs.completed_at IS NOT NULL) AS completed
  `,[req.user.id]);
  const attributedCampaign=await attributedCampaignForUser(req.user.id);
  const normalLink = `${APP_URL}/?ref=${encodeURIComponent(code)}`;
  const profileLink = me.friend_gate_enabled
    ? `${APP_URL}/${encodeURIComponent(me.username)}?ref=${encodeURIComponent(code)}&invite=profile`
    : '';
  res.json({
    code,
    link:normalLink,
    normal_link:normalLink,
    profile_link:profileLink,
    username:me.username || '',
    friend_gate:{
      enabled:Boolean(me.friend_gate_enabled),
      required:Number(me.friend_gate_required_referrals || 5),
      require_post:me.friend_gate_require_post !== false
    },
    registered:Number(summaryRows[0]?.registered||0),
    qualified:Number(summaryRows[0]?.qualified||0),
    growth:growthRows[0] || {challenge_starts:0,share_actions:0,referred_signups:0,completed:0},
    attributed_campaign:attributedCampaign ? {slug:attributedCampaign.slug,name:attributedCampaign.name,channel:attributedCampaign.channel} : null,
    recent
  });
}));

app.get('/api/friend-gate', auth, asyncRoute(async (req,res)=>{
  const {rows}=await pool.query(`SELECT friend_gate_enabled,friend_gate_required_referrals,friend_gate_require_post,friend_gate_auto_accept,friend_gate_message FROM users WHERE id=$1`,[req.user.id]);
  res.json(rows[0]);
}));

app.patch('/api/friend-gate', auth, asyncRoute(async (req,res)=>{
  const enabled=Boolean(req.body.enabled);
  const required=Math.max(1,Math.min(50,Number(req.body.required_referrals||5)));
  const requirePost=req.body.require_post !== false;
  const autoAccept=req.body.auto_accept !== false;
  const message=String(req.body.access_message || '').trim().replace(/\s+/g,' ').slice(0,220);
  const {rows}=await pool.query(`UPDATE users SET friend_gate_enabled=$2,friend_gate_required_referrals=$3,friend_gate_require_post=$4,friend_gate_auto_accept=$5,friend_gate_message=$6 WHERE id=$1 RETURNING friend_gate_enabled,friend_gate_required_referrals,friend_gate_require_post,friend_gate_auto_accept,friend_gate_message`,[req.user.id,enabled,required,requirePost,autoAccept,message]);
  res.json(rows[0]);
}));


app.post('/api/growth/gate/:username/share', auth, asyncRoute(async (req,res) => {
  const targetResult=await pool.query(`SELECT id,username,friend_gate_enabled FROM users WHERE LOWER(username)=LOWER($1) AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE LIMIT 1`,[req.params.username]);
  const target=targetResult.rows[0];
  if(!target || !target.friend_gate_enabled) return res.status(404).json({error:'Reto de acceso no disponible'});
  if(Number(target.id)===Number(req.user.id)) return res.status(400).json({error:'No puedes contabilizar tu propio reto'});
  const method=String(req.body?.method || 'share').slice(0,30);
  const campaign=await recordFriendGateSession(req.user.id,target.id,req.body?.campaign || '');
  await pool.query(`UPDATE friend_gate_sessions SET share_actions=share_actions+1,last_seen_at=NOW() WHERE viewer_user_id=$1 AND gate_user_id=$2`,[req.user.id,target.id]);
  if(campaign?.id) await incrementGrowthDaily(campaign.id,'share_actions');
  await operationalEvent({userId:req.user.id,eventType:'gate_share',path:`/${target.username}`,metadata:{method,campaign:campaign?.slug || ''}});
  res.json({ok:true});
}));

app.post('/api/friends/request/:userId', auth, socialAccountOnly, asyncRoute(async (req,res)=>{
  const otherId=Number(req.params.userId), myId=Number(req.user.id);
  if(!Number.isInteger(otherId)||otherId===myId) return res.status(400).json({error:'Usuario inválido'});
  const exists=await pool.query('SELECT id,email,role,social_hidden,account_status FROM users WHERE id=$1',[otherId]);
  if(!exists.rowCount || exists.rows[0].account_status!=='active' || isSociallyHiddenRecord(exists.rows[0])) return res.status(404).json({error:'Usuario no encontrado'});
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
  const gate=await friendGateProgress(myId,otherId);
  if(gate?.enabled && !gate.unlocked){
    return res.status(403).json({error:`Necesitas completar el reto de acceso (${gate.progress}/${gate.required}) antes de ser amigo de esta cuenta.`,code:'FRIEND_GATE_LOCKED',friend_gate:gate});
  }
  if(gate?.enabled && gate.unlocked && gate.auto_accept){
    await withTransaction(async client=>{
      await client.query(`INSERT INTO friendships(user1_id,user2_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[a,b]);
      await client.query(`UPDATE friend_requests SET status='declined',updated_at=NOW() WHERE status='pending' AND ((from_user_id=$1 AND to_user_id=$2) OR (from_user_id=$2 AND to_user_id=$1))`,[myId,otherId]);
    });
    return res.json({status:'friends',auto_accepted:true});
  }
  const result=await withTransaction(async client=>{
    const {rows}=await client.query(`INSERT INTO friend_requests(from_user_id,to_user_id) VALUES($1,$2) RETURNING id`,[myId,otherId]);
    await addNotification(client,{userId:otherId,actorId:myId,type:'friend_request'});
    return rows[0];
  });
  res.json({status:'sent',request_id:result.id});
}));

app.post('/api/friends/requests/:id/accept', auth, socialAccountOnly, asyncRoute(async (req,res)=>{
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
      AND COALESCE(u.social_hidden,FALSE)=FALSE
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
        AND COALESCE(u.social_hidden,FALSE)=FALSE
        AND (p.user_id=$1 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=p.user_id))
        AND (
          p.user_id=$1 OR NOT u.friend_gate_enabled OR
          EXISTS(SELECT 1 FROM friendships trgfr WHERE (trgfr.user1_id=$1 AND trgfr.user2_id=p.user_id) OR (trgfr.user1_id=p.user_id AND trgfr.user2_id=$1)) OR
          (
            CASE WHEN u.friend_gate_require_post
              THEN (SELECT COUNT(*) FROM referral_attributions trra WHERE trra.inviter_id=$1 AND trra.gate_user_id=p.user_id AND trra.qualified_at IS NOT NULL)
              ELSE (SELECT COUNT(*) FROM referral_attributions trra WHERE trra.inviter_id=$1 AND trra.gate_user_id=p.user_id)
            END
          ) >= u.friend_gate_required_referrals
        )
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
      AND (n.actor_id IS NULL OR COALESCE(a.social_hidden,FALSE)=FALSE)
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
       AND COALESCE(u.social_hidden,FALSE)=FALSE
       AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=s.user_id) OR (bl.blocker_id=s.user_id AND bl.blocked_id=$1))
       AND NOT EXISTS(SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=s.user_id)
       AND (s.user_id=$1 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=s.user_id))
       AND (
         s.user_id=$1 OR NOT u.friend_gate_enabled OR
         EXISTS(SELECT 1 FROM friendships sgfr WHERE (sgfr.user1_id=$1 AND sgfr.user2_id=s.user_id) OR (sgfr.user1_id=s.user_id AND sgfr.user2_id=$1)) OR
         (
           CASE WHEN u.friend_gate_require_post
             THEN (SELECT COUNT(*) FROM referral_attributions sra WHERE sra.inviter_id=$1 AND sra.gate_user_id=s.user_id AND sra.qualified_at IS NOT NULL)
             ELSE (SELECT COUNT(*) FROM referral_attributions sra WHERE sra.inviter_id=$1 AND sra.gate_user_id=s.user_id)
           END
         ) >= u.friend_gate_required_referrals
       )
       AND (
         s.visibility = 'public' OR s.user_id = $1 OR
         (s.visibility = 'followers' AND EXISTS(
           SELECT 1 FROM follows vf WHERE vf.follower_id = $1 AND vf.followed_id = s.user_id
         ))
       )
     ORDER BY (s.user_id = $1) DESC, following DESC, s.created_at ASC
     LIMIT 200
  `, [req.user.id]);
  let stories = rows.map(r => ({ ...r, media_url: '', viewed: Boolean(r.viewed), own: Boolean(r.own), following: Boolean(r.following), views_count: Number(r.views_count || 0) }));
  stories = await attachProtectedMediaUrls(stories, req.user.id);
  res.json(stories);
}));

app.post('/api/stories', auth, socialAccountOnly, asyncRoute(async (req, res) => {
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

app.post('/api/stories/:id/view', auth, socialAccountOnly, asyncRoute(async (req, res) => {
  const story = await pool.query(`
    SELECT s.id, s.user_id, s.visibility
      FROM stories s JOIN users u ON u.id=s.user_id
     WHERE s.id = $1
       AND u.account_status='active'
       AND COALESCE(u.social_hidden,FALSE)=FALSE
       AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=s.user_id) OR (bl.blocker_id=s.user_id AND bl.blocked_id=$2))
       AND (s.user_id=$2 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$2 AND pf.followed_id=s.user_id))
       AND (
         s.user_id=$2 OR NOT u.friend_gate_enabled OR
         EXISTS(SELECT 1 FROM friendships svgfr WHERE (svgfr.user1_id=$2 AND svgfr.user2_id=s.user_id) OR (svgfr.user1_id=s.user_id AND svgfr.user2_id=$2)) OR
         (
           CASE WHEN u.friend_gate_require_post
             THEN (SELECT COUNT(*) FROM referral_attributions svra WHERE svra.inviter_id=$2 AND svra.gate_user_id=s.user_id AND svra.qualified_at IS NOT NULL)
             ELSE (SELECT COUNT(*) FROM referral_attributions svra WHERE svra.inviter_id=$2 AND svra.gate_user_id=s.user_id)
           END
         ) >= u.friend_gate_required_referrals
       )
       AND s.expires_at > NOW()
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
     WHERE sv.story_id = $1 AND COALESCE(u.social_hidden,FALSE)=FALSE ORDER BY sv.viewed_at DESC LIMIT 200
  `, [req.params.id]);
  res.json(rows);
}));

app.delete('/api/stories/:id', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM stories WHERE id = $1 AND user_id = $2 RETURNING id,media_id', [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Story no encontrada' });
  if (rows[0].media_id) await cleanupMediaIfUnused(rows[0].media_id);
  res.json({ ok: true });
}));

// --- V0.5: Reels -----------------------------------------------------------
app.get('/api/reels', auth, asyncRoute(async (req, res) => {
  const limit = pageLimit(req, 8);
  const offset = pageOffset(req);
  const { rows } = await pool.query(`
    WITH candidates AS (
      SELECT
        p.id, p.user_id, p.text, p.media_id, p.media_type, p.source, p.visibility, p.created_at, p.edited_at, p.repost_of_id,
        u.username, u.name, u.avatar
      FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE p.media_type = 'video'
        AND u.account_status='active'
        AND COALESCE(u.social_hidden,FALSE)=FALSE
        AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$1))
        AND NOT EXISTS(SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=p.user_id)
        AND (p.user_id=$1 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=p.user_id))
        AND (
          p.user_id=$1 OR NOT u.friend_gate_enabled OR
          EXISTS(SELECT 1 FROM friendships rgfr WHERE (rgfr.user1_id=$1 AND rgfr.user2_id=p.user_id) OR (rgfr.user1_id=p.user_id AND rgfr.user2_id=$1)) OR
          (
            CASE WHEN u.friend_gate_require_post
              THEN (SELECT COUNT(*) FROM referral_attributions rra WHERE rra.inviter_id=$1 AND rra.gate_user_id=p.user_id AND rra.qualified_at IS NOT NULL)
              ELSE (SELECT COUNT(*) FROM referral_attributions rra WHERE rra.inviter_id=$1 AND rra.gate_user_id=p.user_id)
            END
          ) >= u.friend_gate_required_referrals
        )
        AND (p.visibility = 'public' OR p.user_id = $1 OR
          (p.visibility = 'followers' AND EXISTS(SELECT 1 FROM follows vf WHERE vf.follower_id = $1 AND vf.followed_id = p.user_id)))
      ORDER BY p.id DESC
      LIMIT 200
    ), ranked AS (
      SELECT
        c.*,
        (SELECT COUNT(*)::int FROM likes l JOIN users lu ON lu.id=l.user_id WHERE l.post_id=c.id AND COALESCE(lu.social_hidden,FALSE)=FALSE) AS likes_count,
        (SELECT COUNT(*)::int FROM comments cm JOIN users cu ON cu.id=cm.user_id WHERE cm.post_id=c.id AND COALESCE(cu.social_hidden,FALSE)=FALSE) AS comments_count,
        EXISTS(SELECT 1 FROM likes lx WHERE lx.post_id = c.id AND lx.user_id = $1) AS liked,
        EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = c.id AND b.user_id = $1) AS saved,
        (c.user_id = $1) AS own
      FROM candidates c
    )
    SELECT * FROM ranked
    ORDER BY ((likes_count * 2) + comments_count) DESC, created_at DESC, id DESC
    LIMIT $2 OFFSET $3
  `, [req.user.id, limit + 1, offset]);
  let posts = rows.map(normalizePost);
  posts = await attachProtectedMediaUrls(posts, req.user.id);
  posts = await enrichReposts(req.user.id, posts);
  res.json(offsetPage(posts, limit, offset));
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
       AND COALESCE(u.social_hidden,FALSE)=FALSE
       AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$2))
       AND (p.user_id=$2 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$2 AND pf.followed_id=p.user_id))
       AND (
         p.user_id=$2 OR NOT u.friend_gate_enabled OR
         EXISTS(SELECT 1 FROM friendships pvgfr WHERE (pvgfr.user1_id=$2 AND pvgfr.user2_id=p.user_id) OR (pvgfr.user1_id=p.user_id AND pvgfr.user2_id=$2)) OR
         (
           CASE WHEN u.friend_gate_require_post
             THEN (SELECT COUNT(*) FROM referral_attributions pvra WHERE pvra.inviter_id=$2 AND pvra.gate_user_id=p.user_id AND pvra.qualified_at IS NOT NULL)
             ELSE (SELECT COUNT(*) FROM referral_attributions pvra WHERE pvra.inviter_id=$2 AND pvra.gate_user_id=p.user_id)
           END
         ) >= u.friend_gate_required_referrals
       )
       AND (p.visibility='public' OR p.user_id=$2 OR
       (p.visibility='followers' AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.followed_id=p.user_id)))
     LIMIT 1
  `,[postId,viewerId]);
  return Boolean(rows[0]);
}

app.post('/api/conversations/direct/:userId', auth, socialAccountOnly, asyncRoute(async (req, res) => {
  const otherId = Number(req.params.userId);
  const myId = Number(req.user.id);
  if (!Number.isInteger(otherId) || otherId === myId) return res.status(400).json({ error: 'Usuario inválido' });
  const exists = await pool.query('SELECT id,email,role,social_hidden,account_status FROM users WHERE id = $1', [otherId]);
  if (!exists.rowCount || exists.rows[0].account_status!=='active' || isSociallyHiddenRecord(exists.rows[0])) return res.status(404).json({ error: 'Usuario no encontrado' });
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
       AND COALESCE(u.social_hidden,FALSE)=FALSE
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
               COALESCE(spu.social_hidden,FALSE)=FALSE AND (sp.user_id=$2 OR NOT spu.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$2 AND pf.followed_id=sp.user_id))
               AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=sp.user_id) OR (bl.blocker_id=sp.user_id AND bl.blocked_id=$2))
               AND (
                 sp.user_id=$2 OR NOT spu.friend_gate_enabled OR
                 EXISTS(SELECT 1 FROM friendships msgfr WHERE (msgfr.user1_id=$2 AND msgfr.user2_id=sp.user_id) OR (msgfr.user1_id=sp.user_id AND msgfr.user2_id=$2)) OR
                 (
                   CASE WHEN spu.friend_gate_require_post
                     THEN (SELECT COUNT(*) FROM referral_attributions msra WHERE msra.inviter_id=$2 AND msra.gate_user_id=sp.user_id AND msra.qualified_at IS NOT NULL)
                     ELSE (SELECT COUNT(*) FROM referral_attributions msra WHERE msra.inviter_id=$2 AND msra.gate_user_id=sp.user_id)
                   END
                 ) >= spu.friend_gate_required_referrals
               )
               AND (sp.visibility='public' OR sp.user_id=$2 OR
               (sp.visibility='followers' AND EXISTS(SELECT 1 FROM follows sf WHERE sf.follower_id=$2 AND sf.followed_id=sp.user_id)))
             ) THEN sp.id END AS shared_visible_id,
             CASE WHEN sp.id IS NOT NULL AND (
               COALESCE(spu.social_hidden,FALSE)=FALSE AND (sp.user_id=$2 OR NOT spu.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$2 AND pf.followed_id=sp.user_id))
               AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=sp.user_id) OR (bl.blocker_id=sp.user_id AND bl.blocked_id=$2))
               AND (
                 sp.user_id=$2 OR NOT spu.friend_gate_enabled OR
                 EXISTS(SELECT 1 FROM friendships msgfr WHERE (msgfr.user1_id=$2 AND msgfr.user2_id=sp.user_id) OR (msgfr.user1_id=sp.user_id AND msgfr.user2_id=$2)) OR
                 (
                   CASE WHEN spu.friend_gate_require_post
                     THEN (SELECT COUNT(*) FROM referral_attributions msra WHERE msra.inviter_id=$2 AND msra.gate_user_id=sp.user_id AND msra.qualified_at IS NOT NULL)
                     ELSE (SELECT COUNT(*) FROM referral_attributions msra WHERE msra.inviter_id=$2 AND msra.gate_user_id=sp.user_id)
                   END
                 ) >= spu.friend_gate_required_referrals
               )
               AND (sp.visibility='public' OR sp.user_id=$2 OR
               (sp.visibility='followers' AND EXISTS(SELECT 1 FROM follows sf WHERE sf.follower_id=$2 AND sf.followed_id=sp.user_id)))
             ) THEN sp.text ELSE NULL END AS shared_text,
             CASE WHEN sp.id IS NOT NULL AND (
               COALESCE(spu.social_hidden,FALSE)=FALSE AND (sp.user_id=$2 OR NOT spu.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$2 AND pf.followed_id=sp.user_id))
               AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=sp.user_id) OR (bl.blocker_id=sp.user_id AND bl.blocked_id=$2))
               AND (
                 sp.user_id=$2 OR NOT spu.friend_gate_enabled OR
                 EXISTS(SELECT 1 FROM friendships msgfr WHERE (msgfr.user1_id=$2 AND msgfr.user2_id=sp.user_id) OR (msgfr.user1_id=sp.user_id AND msgfr.user2_id=$2)) OR
                 (
                   CASE WHEN spu.friend_gate_require_post
                     THEN (SELECT COUNT(*) FROM referral_attributions msra WHERE msra.inviter_id=$2 AND msra.gate_user_id=sp.user_id AND msra.qualified_at IS NOT NULL)
                     ELSE (SELECT COUNT(*) FROM referral_attributions msra WHERE msra.inviter_id=$2 AND msra.gate_user_id=sp.user_id)
                   END
                 ) >= spu.friend_gate_required_referrals
               )
               AND (sp.visibility='public' OR sp.user_id=$2 OR
               (sp.visibility='followers' AND EXISTS(SELECT 1 FROM follows sf WHERE sf.follower_id=$2 AND sf.followed_id=sp.user_id)))
             ) THEN sp.media_id ELSE NULL END AS shared_media_id,
             CASE WHEN sp.id IS NOT NULL AND (
               COALESCE(spu.social_hidden,FALSE)=FALSE AND (sp.user_id=$2 OR NOT spu.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$2 AND pf.followed_id=sp.user_id))
               AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=sp.user_id) OR (bl.blocker_id=sp.user_id AND bl.blocked_id=$2))
               AND (
                 sp.user_id=$2 OR NOT spu.friend_gate_enabled OR
                 EXISTS(SELECT 1 FROM friendships msgfr WHERE (msgfr.user1_id=$2 AND msgfr.user2_id=sp.user_id) OR (msgfr.user1_id=sp.user_id AND msgfr.user2_id=$2)) OR
                 (
                   CASE WHEN spu.friend_gate_require_post
                     THEN (SELECT COUNT(*) FROM referral_attributions msra WHERE msra.inviter_id=$2 AND msra.gate_user_id=sp.user_id AND msra.qualified_at IS NOT NULL)
                     ELSE (SELECT COUNT(*) FROM referral_attributions msra WHERE msra.inviter_id=$2 AND msra.gate_user_id=sp.user_id)
                   END
                 ) >= spu.friend_gate_required_referrals
               )
               AND (sp.visibility='public' OR sp.user_id=$2 OR
               (sp.visibility='followers' AND EXISTS(SELECT 1 FROM follows sf WHERE sf.follower_id=$2 AND sf.followed_id=sp.user_id)))
             ) THEN sp.media_type ELSE NULL END AS shared_media_type,
             spu.username AS shared_username, spu.name AS shared_name, spu.avatar AS shared_avatar,
             spu.friend_gate_enabled AS shared_gate_enabled, spu.content_watermark_mode AS shared_watermark_mode
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
    media_url:r.media_id ? protectedMediaUrl(r.media_id,req.user.id) : '', media_protected:Boolean(r.media_id), watermarked:false, created_at:r.created_at, username:r.username, name:r.name, avatar:r.avatar, own:Boolean(r.own),
    reply: r.reply_to_id ? { id:r.reply_to_id, name:r.reply_name, username:r.reply_username, text:r.reply_text || '', media_type:r.reply_media_type || 'none' } : null,
    shared_post: r.shared_visible_id ? { id:r.shared_visible_id, text:r.shared_text || '', media_type:r.shared_media_type || 'none', media_url:r.shared_media_id ? protectedMediaUrl(r.shared_media_id,req.user.id) : '', media_protected:Boolean(r.shared_media_id), watermarked:Boolean(r.shared_media_id) && String(r.shared_watermark_mode||'exclusive')!=='off' && (String(r.shared_watermark_mode||'exclusive')==='all' || Boolean(r.shared_gate_enabled)), username:r.shared_username, name:r.shared_name, avatar:r.shared_avatar } : (r.shared_post_id ? { unavailable:true } : null)
  })));
}));

app.post('/api/conversations/:id/messages', auth, socialAccountOnly, asyncRoute(async (req, res) => {
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

app.get('/api/onboarding/checklist', auth, asyncRoute(async (req,res) => {
  const { rows } = await pool.query(`
    SELECT
      (COALESCE(NULLIF(TRIM(u.avatar),''),'') <> '') AS has_avatar,
      ((COALESCE(NULLIF(TRIM(u.bio),''),'') <> '') OR (COALESCE(NULLIF(TRIM(u.headline),''),'') <> '') OR (COALESCE(NULLIF(TRIM(u.interests),''),'') <> '')) AS has_profile,
      EXISTS(SELECT 1 FROM posts p WHERE p.user_id=u.id) AS has_post,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=u.id) AS follows_someone
    FROM users u WHERE u.id=$1
  `,[req.user.id]);
  const item = rows[0] || {has_avatar:false,has_profile:false,has_post:false,follows_someone:false};
  const steps = [item.has_avatar,item.has_profile,item.has_post,item.follows_someone].filter(Boolean).length;
  res.json({ ...item, completed:steps===4, steps, total:4 });
}));

app.post('/api/telemetry/session', auth, asyncRoute(async (req,res) => {
  await pool.query(`
    INSERT INTO app_events(user_id,event_type,severity,path,user_agent,metadata)
    SELECT $1,'session_active','info',$2,$3,'{}'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM app_events WHERE user_id=$1 AND event_type='session_active' AND created_at > NOW()-INTERVAL '30 minutes')
  `,[req.user.id,String(req.body?.path || '/').slice(0,500),String(req.get('user-agent') || '').slice(0,500)]);
  res.json({ok:true});
}));

app.post('/api/telemetry/event', auth, asyncRoute(async (req,res) => {
  const type=String(req.body?.type || '').slice(0,60);
  const allowed=new Set(['client_error','pwa_installed']);
  if(!allowed.has(type)) return res.status(400).json({error:'Evento no válido'});
  const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};
  await operationalEvent({userId:req.user.id,eventType:type,severity:type==='client_error'?'error':'info',path:String(req.body?.path || '').slice(0,500),userAgent:req.get('user-agent') || '',metadata});
  res.json({ok:true});
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

app.post('/api/account/email/verification', auth, recoveryLimiter, asyncRoute(async (req,res) => {
  const {rows}=await pool.query('SELECT * FROM users WHERE id=$1',[req.user.id]);
  const user=rows[0];
  if(!user) return res.status(404).json({error:'Usuario no encontrado'});
  if(user.email_verified_at) return res.json({ok:true,already_verified:true});
  if(!emailConfigured()) return res.status(503).json({error:'El correo saliente todavía no está configurado'});
  const sent=await sendVerificationEmail(user);
  await securityEvent(req,'email_verification_requested',user.id,{sent});
  res.json({ok:true});
}));

app.post('/api/account/email', auth, recoveryLimiter, asyncRoute(async (req,res) => {
  if(!emailConfigured()) return res.status(503).json({error:'El correo saliente todavía no está configurado'});
  const currentPassword=String(req.body.current_password || '');
  const newEmail=normalizeEmail(req.body.new_email);
  if(!newEmail.includes('@') || newEmail.length>255) return res.status(400).json({error:'Email inválido'});
  const {rows}=await pool.query('SELECT * FROM users WHERE id=$1',[req.user.id]);
  const user=rows[0];
  if(!user || !(await bcrypt.compare(currentPassword,user.password_hash))) return res.status(400).json({error:'La contraseña actual no es correcta'});
  if(newEmail===user.email) return res.status(400).json({error:'Ese ya es tu email actual'});
  const exists=await pool.query('SELECT 1 FROM users WHERE email=$1 AND id<>$2',[newEmail,user.id]);
  if(exists.rowCount) return res.status(409).json({error:'Ese email ya está en uso'});
  const token=await createAccountToken(user.id,'change_email',{minutes:60,newEmail});
  const url=`${APP_URL}/?action=change-email&token=${encodeURIComponent(token)}`;
  const english=String(user.preferred_language||'').toLowerCase()==='en';
  const sent=await sendEmail({to:newEmail,subject:english?'Confirm your new email · Instant Admirers':'Confirma tu nuevo email · Instant Admirers',text:english?`Confirm the new email for your account at: ${url}\n\nThe link expires in 60 minutes.`:`Confirma el nuevo email de tu cuenta en: ${url}\n\nEl enlace caduca en 60 minutos.`,html:emailShell({ lang:english?'en':'es', title:english?'Confirm your new email':'Confirma tu nuevo email', body:english?'<p>To finish changing the email on your account, confirm this address.</p>':'<p>Para terminar el cambio de email de tu cuenta, confirma esta dirección.</p>', buttonText:english?'Confirm new email':'Confirmar nuevo email', buttonUrl:url, footer:english?'The link expires in 60 minutes.':'El enlace caduca en 60 minutos.' })});
  await securityEvent(req,'email_change_requested',user.id,{sent});
  res.json({ok:true});
}));

app.post('/api/account/password', auth, asyncRoute(async (req, res) => {
  const currentPassword = String(req.body.current_password || '');
  const newPassword = String(req.body.new_password || '');
  if (newPassword.length < 8) return res.status(400).json({ error:'La nueva contraseña debe tener al menos 8 caracteres' });
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) return res.status(400).json({ error:'La contraseña actual no es correcta' });
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash=$2,session_invalid_before=NOW() WHERE id=$1', [req.user.id, hash]);
  await securityEvent(req,'password_changed',req.user.id);
  res.json({ ok:true });
}));

app.delete('/api/account', auth, asyncRoute(async (req, res) => {
  const password = String(req.body.password || '');
  const confirmation = String(req.body.confirmation || '').trim().toUpperCase();
  if (confirmation !== 'ELIMINAR') return res.status(400).json({ error:'Escribe ELIMINAR para confirmar' });
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(400).json({ error:'La contraseña no es correcta' });
  await securityEvent(req,'account_deleted',req.user.id);
  const mediaRows = await pool.query(`SELECT provider,provider_id,resource_type,delivery_type FROM media WHERE user_id=$1 AND provider='cloudinary' AND provider_id<>''`, [req.user.id]);
  await pool.query('DELETE FROM users WHERE id=$1', [req.user.id]);
  await Promise.allSettled(mediaRows.rows.map(item => destroyRemoteAsset(item)));
  res.json({ ok:true });
}));


// V1.10.0: entrega de publicidad activa. Si no hay nada aplicable devuelve 204.
app.get('/api/ads/slot', auth, asyncRoute(async (req,res) => {
  const placement=String(req.query.placement || '').trim();
  const device=String(req.query.device || '').trim()==='mobile' ? 'mobile' : 'desktop';
  const profileUsername=String(req.query.profile || '').trim().replace(/^@/,'').slice(0,30);
  const language=String(req.query.lang || '').trim().toLowerCase()==='en' ? 'en' : 'es';
  if(!AD_PLACEMENTS.has(placement)) return res.status(400).json({error:'Ubicación publicitaria no válida'});

  let profileId=null;
  if(profileUsername){
    const profileResult=await pool.query(`SELECT id FROM users WHERE LOWER(username)=LOWER($1) AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE LIMIT 1`,[profileUsername]);
    profileId=profileResult.rows[0]?.id || null;
  }
  if(placement==='profile' && !profileId) return res.status(204).end();

  const {rows}=await pool.query(`
    SELECT a.id,a.name,a.creative_type,a.image_url,a.mobile_image_url,a.link_url,a.google_code,a.alt_text,a.alt_text_en,a.display_title,a.display_title_en,a.display_text,a.display_text_en,a.button_text,a.button_text_en,a.placements,a.profile_mode
      FROM ads a
      JOIN ad_settings s ON s.id=1 AND s.enabled=TRUE
     WHERE a.active=TRUE
       AND $1::text=ANY(a.placements)
       AND ($2::text='mobile' AND a.mobile_enabled=TRUE OR $2::text='desktop' AND a.desktop_enabled=TRUE)
       AND (a.starts_at IS NULL OR a.starts_at<=NOW())
       AND (a.ends_at IS NULL OR a.ends_at>NOW())
       AND (
         a.profile_mode='all'
         OR (a.profile_mode='include' AND $3::bigint IS NOT NULL AND EXISTS(SELECT 1 FROM ad_profile_targets apt WHERE apt.ad_id=a.id AND apt.user_id=$3))
         OR (a.profile_mode='exclude' AND ($3::bigint IS NULL OR NOT EXISTS(SELECT 1 FROM ad_profile_targets apt WHERE apt.ad_id=a.id AND apt.user_id=$3)))
       )
     ORDER BY a.priority DESC,RANDOM()
     LIMIT 1
  `,[placement,device,profileId]);
  const row=rows[0];
  if(!row) return res.status(204).end();
  res.json({
    id:row.id,
    name:row.name,
    creative_type:row.creative_type,
    image_url:device==='mobile' && row.mobile_image_url ? row.mobile_image_url : row.image_url,
    link_url:row.link_url,
    google_code:row.google_code,
    alt_text:language==='en' ? (row.alt_text_en || row.alt_text || '') : (row.alt_text || ''),
    display_title:language==='en' ? (row.display_title_en || row.display_title || '') : (row.display_title || ''),
    // Compatibilidad con anuncios creados antes de V1.10.3: si display_text ES es NULL,
    // el antiguo texto alternativo se reutiliza. En inglés se usa EN y, si falta, ES.
    display_text:language==='en'
      ? (row.display_text_en || (row.display_text === null ? (row.alt_text || '') : (row.display_text || '')))
      : (row.display_text === null ? (row.alt_text || '') : (row.display_text || '')),
    button_text:language==='en' ? (row.button_text_en || row.button_text || '') : (row.button_text || ''),
    placement
  });
}));

app.post('/api/ads/:id/impression', auth, asyncRoute(async (req,res) => {
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0) return res.status(400).json({error:'Anuncio no válido'});
  await pool.query(`INSERT INTO ad_daily_stats(ad_id,day,impressions) SELECT id,CURRENT_DATE,1 FROM ads WHERE id=$1 ON CONFLICT(ad_id,day) DO UPDATE SET impressions=ad_daily_stats.impressions+1`,[id]);
  res.json({ok:true});
}));

app.post('/api/ads/:id/click', auth, asyncRoute(async (req,res) => {
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0) return res.status(400).json({error:'Anuncio no válido'});
  await pool.query(`INSERT INTO ad_daily_stats(ad_id,day,clicks) SELECT id,CURRENT_DATE,1 FROM ads WHERE id=$1 AND creative_type='image' ON CONFLICT(ad_id,day) DO UPDATE SET clicks=ad_daily_stats.clicks+1`,[id]);
  res.json({ok:true});
}));

app.get('/api/admin/stats', auth, adminOnly, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(social_hidden,FALSE)=FALSE) AS users,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND account_status='suspended') AS suspended_users,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS posts,
      (SELECT COUNT(*)::int FROM comments c JOIN users u ON u.id=c.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS comments,
      (SELECT COUNT(*)::int FROM reports WHERE status='open') AS open_reports,
      (SELECT COUNT(*)::int FROM reports WHERE status='reviewing') AS reviewing_reports,
      (SELECT COUNT(*)::int FROM reports WHERE status='closed') AS closed_reports,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND created_at >= NOW()-INTERVAL '7 days') AS new_users_7d,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND p.created_at >= NOW()-INTERVAL '7 days') AS new_posts_7d
  `);
  res.json(rows[0]);
}));

app.get('/api/admin/launch-dashboard', auth, adminOnly, asyncRoute(async (_req,res) => {
  const settings = await getLaunchSettings();
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(social_hidden,FALSE)=FALSE) AS users_total,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND email_verified_at IS NOT NULL) AS users_verified,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND created_at >= NOW()-INTERVAL '24 hours') AS users_new_24h,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND created_at >= NOW()-INTERVAL '7 days') AS users_new_7d,
      (SELECT COUNT(DISTINCT ae.user_id)::int FROM app_events ae JOIN users u ON u.id=ae.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND ae.event_type='session_active' AND ae.created_at >= NOW()-INTERVAL '24 hours') AS active_24h,
      (SELECT COUNT(DISTINCT ae.user_id)::int FROM app_events ae JOIN users u ON u.id=ae.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND ae.event_type='session_active' AND ae.created_at >= NOW()-INTERVAL '7 days') AS active_7d,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND COALESCE(NULLIF(TRIM(avatar),''),'') <> '') AS users_with_avatar,
      (SELECT COUNT(DISTINCT p.user_id)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS users_with_post,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS posts_total,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND p.created_at >= NOW()-INTERVAL '24 hours') AS posts_24h,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND p.created_at >= NOW()-INTERVAL '7 days') AS posts_7d,
      (SELECT COUNT(*)::int FROM stories s JOIN users u ON u.id=s.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND s.expires_at > NOW()) AS stories_active,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND p.media_type='video') AS reels_total,
      (SELECT COUNT(*)::int FROM messages m JOIN users u ON u.id=m.sender_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND m.created_at >= NOW()-INTERVAL '24 hours') AS messages_24h,
      (SELECT COUNT(*)::int FROM referral_attributions ra JOIN users u ON u.id=ra.invited_user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS referrals_total,
      (SELECT COUNT(*)::int FROM referral_attributions ra JOIN users u ON u.id=ra.invited_user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND ra.registered_at >= NOW()-INTERVAL '7 days') AS referrals_7d,
      (SELECT COUNT(*)::int FROM referral_attributions ra JOIN users u ON u.id=ra.invited_user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND ra.qualified_at IS NOT NULL) AS referrals_qualified,
      (SELECT COUNT(*)::int FROM reports WHERE status IN ('open','reviewing')) AS reports_pending,
      (SELECT COUNT(*)::int FROM app_events WHERE severity='error' AND created_at >= NOW()-INTERVAL '24 hours') AS errors_24h
  `);
  const recentErrors = await pool.query(`
    SELECT ae.id,ae.event_type,ae.path,ae.metadata,ae.created_at,u.username
    FROM app_events ae LEFT JOIN users u ON u.id=ae.user_id
    WHERE ae.severity='error' ORDER BY ae.created_at DESC LIMIT 20
  `);
  res.json({ settings, metrics:rows[0], recent_errors:recentErrors.rows });
}));

app.get('/api/admin/demo/status', auth, adminOnly, asyncRoute(async (_req,res) => {
  res.json(await demoStatus(pool));
}));


app.get('/api/admin/launch-readiness', auth, adminOnly, asyncRoute(async (req,res) => {
  const settings = await getLaunchSettings(true);
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(social_hidden,FALSE)=FALSE) AS users_total,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=TRUE) AS demo_profiles,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND email_verified_at IS NOT NULL) AS users_verified,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND COALESCE(NULLIF(TRIM(avatar),''),'') <> '') AS users_with_avatar,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND ((COALESCE(NULLIF(TRIM(bio),''),'') <> '') OR (COALESCE(NULLIF(TRIM(headline),''),'') <> '') OR (COALESCE(NULLIF(TRIM(interests),''),'') <> ''))) AS users_profile_complete,
      (SELECT COUNT(DISTINCT p.user_id)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS users_with_post,
      (SELECT COUNT(DISTINCT f.follower_id)::int FROM follows f JOIN users u ON u.id=f.follower_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS users_following,
      (SELECT COUNT(DISTINCT ae.user_id)::int FROM app_events ae JOIN users u ON u.id=ae.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND ae.event_type='session_active' AND ae.created_at >= NOW()-INTERVAL '7 days') AS active_7d,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS posts_total,
      (SELECT COUNT(*)::int FROM reports WHERE status IN ('open','reviewing')) AS reports_pending,
      (SELECT COUNT(*)::int FROM app_events WHERE severity='error' AND created_at >= NOW()-INTERVAL '24 hours') AS errors_24h,
      (SELECT COUNT(*)::int FROM users WHERE role='admin' OR LOWER(email)=ANY($1::text[])) AS admins_total
  `,[Array.from(configuredAdminEmails())]);
  const m = rows[0] || {};
  const pwaReady = ['manifest.webmanifest','sw.js','offline.html'].every(file => fs.existsSync(path.join(publicDir,file)));
  const legalReady = ['legal','privacy','cookies','terms','community-guidelines'].every(dir => fs.existsSync(path.join(publicDir,dir,'index.html')));
  const checks = [
    { id:'database', label:'PostgreSQL operativo', ok:true, level:'blocker', detail:'La base de datos responde correctamente.' },
    { id:'email', label:'Email transaccional', ok:emailConfigured(), level:'blocker', detail:emailConfigured()?'Resend está configurado.':'Falta configurar Resend.' },
    { id:'media', label:'Multimedia externa', ok:cloudinaryConfigured(), level:'blocker', detail:cloudinaryConfigured()?'Cloudinary está activo.':'Cloudinary no está configurado.' },
    { id:'pwa', label:'PWA instalable', ok:pwaReady, level:'blocker', detail:pwaReady?'Manifest, Service Worker y modo offline presentes.':'Faltan archivos de la PWA.' },
    { id:'legal', label:'Páginas legales', ok:legalReady, level:'blocker', detail:legalReady?'Aviso legal, privacidad, cookies, términos y normas presentes.':'Falta alguna página legal.' },
    { id:'demo', label:'Laboratorio limpio', ok:Number(m.demo_profiles||0)===0, level:'blocker', detail:Number(m.demo_profiles||0)===0?'No quedan perfiles TEST.':`${m.demo_profiles} perfiles TEST siguen activos.` },
    { id:'errors', label:'Sin errores recientes', ok:Number(m.errors_24h||0)===0, level:'blocker', detail:Number(m.errors_24h||0)===0?'0 errores en las últimas 24 h.':`${m.errors_24h} errores técnicos en las últimas 24 h.` },
    { id:'admin', label:'Administración disponible', ok:Number(m.admins_total||0)>0, level:'blocker', detail:`${m.admins_total||0} cuenta(s) administradora(s).` },
    { id:'reports', label:'Moderación al día', ok:Number(m.reports_pending||0)===0, level:'recommended', detail:Number(m.reports_pending||0)===0?'No hay denuncias pendientes.':`${m.reports_pending} denuncia(s) pendiente(s).` },
    { id:'content', label:'Contenido inicial real', ok:Number(m.posts_total||0)>0, level:'recommended', detail:Number(m.posts_total||0)>0?`${m.posts_total} publicación(es) reales.`:'Todavía no hay publicaciones reales.' }
  ];
  const blockers = checks.filter(c => c.level==='blocker');
  const score = Math.round((checks.filter(c=>c.ok).length / checks.length) * 100);
  const invite = await pool.query(`SELECT invite_code FROM users WHERE id=$1 LIMIT 1`,[req.user.id]);
  const code = String(invite.rows[0]?.invite_code || '');
  res.json({
    settings,
    technical_ready:blockers.every(c=>c.ok),
    score,
    checks,
    funnel:{
      users_total:Number(m.users_total||0), users_verified:Number(m.users_verified||0), users_with_avatar:Number(m.users_with_avatar||0),
      users_profile_complete:Number(m.users_profile_complete||0), users_with_post:Number(m.users_with_post||0), users_following:Number(m.users_following||0), active_7d:Number(m.active_7d||0)
    },
    target:{ value:Number(settings.cohort_target||100), current:Number(m.users_total||0) },
    invite_url:code ? `${APP_URL}/?ref=${encodeURIComponent(code)}` : ''
  });
}));

app.post('/api/admin/demo/generate', auth, adminOnly, asyncRoute(async (req,res) => {
  const result = await withTransaction(async (client) => createDemoEnvironment(client, req.user.id));
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'demo_lab_generate',$2)`, [req.user.id, JSON.stringify(result).slice(0,1000)]);
  res.json({ ok:true, ...result });
}));

app.delete('/api/admin/demo', auth, adminOnly, asyncRoute(async (req,res) => {
  const result = await withTransaction(async (client) => clearDemoEnvironment(client));
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'demo_lab_cleanup',$2)`, [req.user.id, `Perfiles eliminados: ${result.deleted_profiles}`]);
  res.json({ ok:true, ...result });
}));

app.patch('/api/admin/launch/settings', auth, adminOnly, asyncRoute(async (req,res) => {
  const current = await getLaunchSettings(true);
  const mode=String(req.body?.registration_mode ?? current.registration_mode ?? 'open');
  const phase=String(req.body?.launch_phase ?? current.launch_phase ?? 'prelaunch');
  const target=Math.max(10,Math.min(100000,Number(req.body?.cohort_target ?? current.cohort_target ?? 100) || 100));
  const bannerEnabled=req.body?.banner_enabled === undefined ? Boolean(current.banner_enabled) : Boolean(req.body.banner_enabled);
  const bannerText=String(req.body?.banner_text ?? current.banner_text ?? '').trim().slice(0,240);
  if(!['open','invite_only','paused'].includes(mode)) return res.status(400).json({error:'Modo de registro no válido'});
  if(!['prelaunch','pilot','public'].includes(phase)) return res.status(400).json({error:'Fase de lanzamiento no válida'});
  const {rows}=await pool.query(`
    UPDATE launch_settings SET registration_mode=$1,launch_phase=$2,cohort_target=$3,banner_enabled=$4,banner_text=$5,
      public_launched_at=CASE WHEN $7='public' AND public_launched_at IS NULL THEN NOW() ELSE public_launched_at END,
      updated_by=$6,updated_at=NOW() WHERE id=1
    RETURNING registration_mode,launch_phase,cohort_target,banner_enabled,banner_text,public_launched_at,starter_prompts_enabled,newcomer_spotlight_enabled,founding_member_limit,updated_at
  `,[mode,phase,target,bannerEnabled,bannerText,req.user.id,phase]);
  launchSettingsCache={value:rows[0],expires:Date.now()+15000};
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'launch_settings',$2)`,[req.user.id,JSON.stringify({mode,phase,target,bannerEnabled}).slice(0,1000)]);
  res.json(rows[0]);
}));


app.get('/api/admin/community-launch', auth, adminOnly, asyncRoute(async (_req,res) => {
  const settings = await getLaunchSettings(true);
  const {rows}=await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE) AS members_total,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE AND created_at>=NOW()-INTERVAL '7 days') AS members_7d,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND p.created_at>=NOW()-INTERVAL '7 days') AS posts_7d,
      (SELECT COUNT(DISTINCT p.user_id)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS authors_total,
      (SELECT COUNT(*)::int FROM users u WHERE u.is_demo=FALSE AND u.account_status='active' AND COALESCE(u.social_hidden,FALSE)=FALSE AND COALESCE(NULLIF(TRIM(u.avatar),''),'')<>'' AND ((COALESCE(NULLIF(TRIM(u.bio),''),'')<>'') OR (COALESCE(NULLIF(TRIM(u.headline),''),'')<>'') OR (COALESCE(NULLIF(TRIM(u.interests),''),'')<>'')) AND EXISTS(SELECT 1 FROM posts p WHERE p.user_id=u.id) AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=u.id)) AS activated_members,
      (SELECT COUNT(DISTINCT ae.user_id)::int FROM app_events ae JOIN users u ON u.id=ae.user_id WHERE u.is_demo=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND ae.event_type='session_active' AND ae.created_at>=NOW()-INTERVAL '7 days') AS active_7d,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=TRUE) AS demo_profiles
  `);
  res.json({
    settings:{starter_prompts_enabled:Boolean(settings.starter_prompts_enabled),newcomer_spotlight_enabled:Boolean(settings.newcomer_spotlight_enabled),founding_member_limit:Number(settings.founding_member_limit||100)},
    metrics:rows[0] || {},
    prompt_count:COMMUNITY_PROMPTS.length,
    prompts:COMMUNITY_PROMPTS.slice(0,6)
  });
}));

app.patch('/api/admin/community-launch', auth, adminOnly, asyncRoute(async (req,res) => {
  const current=await getLaunchSettings(true);
  const promptsEnabled=req.body?.starter_prompts_enabled===undefined ? Boolean(current.starter_prompts_enabled) : Boolean(req.body.starter_prompts_enabled);
  const newcomersEnabled=req.body?.newcomer_spotlight_enabled===undefined ? Boolean(current.newcomer_spotlight_enabled) : Boolean(req.body.newcomer_spotlight_enabled);
  const foundingLimit=Math.max(10,Math.min(10000,Number(req.body?.founding_member_limit ?? current.founding_member_limit ?? 100)||100));
  const {rows}=await pool.query(`
    UPDATE launch_settings SET starter_prompts_enabled=$1,newcomer_spotlight_enabled=$2,founding_member_limit=$3,updated_by=$4,updated_at=NOW()
    WHERE id=1
    RETURNING registration_mode,launch_phase,cohort_target,banner_enabled,banner_text,public_launched_at,starter_prompts_enabled,newcomer_spotlight_enabled,founding_member_limit,updated_at
  `,[promptsEnabled,newcomersEnabled,foundingLimit,req.user.id]);
  launchSettingsCache={value:rows[0],expires:Date.now()+15000};
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'community_launch_settings',$2)`,[req.user.id,JSON.stringify({promptsEnabled,newcomersEnabled,foundingLimit}).slice(0,1000)]);
  res.json(rows[0]);
}));


// --- V1.9: Growth Engine --------------------------------------------------
app.get('/api/admin/growth-engine', auth, adminOnly, asyncRoute(async (_req,res) => {
  const {rows:campaignRows}=await pool.query(`
    SELECT gc.*,u.username AS target_username,u.name AS target_name,u.invite_code AS target_invite_code,
           u.friend_gate_enabled AS target_gate_enabled,u.friend_gate_required_referrals AS target_gate_required
      FROM growth_campaigns gc JOIN users u ON u.id=gc.target_user_id
     ORDER BY gc.created_at DESC LIMIT 50
  `);
  const campaigns=[];
  for(const row of campaignRows){
    const {rows:mRows}=await pool.query(`
      SELECT
        COALESCE((SELECT SUM(visits)::int FROM growth_campaign_daily WHERE campaign_id=$1),0) AS visits,
        (SELECT COUNT(*)::int FROM growth_campaign_attributions WHERE campaign_id=$1) AS registrations,
        (SELECT COUNT(*)::int FROM friend_gate_sessions WHERE campaign_id=$1) AS challenge_starts,
        COALESCE((SELECT SUM(share_actions)::int FROM friend_gate_sessions WHERE campaign_id=$1),0) AS share_actions,
        (SELECT COUNT(*)::int FROM growth_campaign_attributions gca JOIN referral_attributions ra ON ra.invited_user_id=gca.user_id WHERE gca.campaign_id=$1 AND ra.gate_user_id IS NOT NULL) AS referred_signups,
        (SELECT COUNT(*)::int FROM friend_gate_sessions WHERE campaign_id=$1 AND completed_at IS NOT NULL) AS completed
    `,[row.id]);
    campaigns.push({...row,link:growthCampaignLink(row),metrics:mRows[0] || {}});
  }
  const {rows:profiles}=await pool.query(`
    SELECT u.id,u.username,u.name,u.friend_gate_required_referrals AS required,u.friend_gate_require_post AS require_post,
      (SELECT COUNT(*)::int FROM friend_gate_sessions fgs WHERE fgs.gate_user_id=u.id) AS challenge_starts,
      (SELECT COALESCE(SUM(fgs.share_actions),0)::int FROM friend_gate_sessions fgs WHERE fgs.gate_user_id=u.id) AS share_actions,
      (SELECT COUNT(*)::int FROM referral_attributions ra WHERE ra.gate_user_id=u.id) AS referred_signups,
      (SELECT COUNT(*)::int FROM friend_gate_sessions fgs WHERE fgs.gate_user_id=u.id AND fgs.completed_at IS NOT NULL) AS completed
    FROM users u
    WHERE u.friend_gate_enabled=TRUE AND u.account_status='active' AND COALESCE(u.is_demo,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE
    ORDER BY challenge_starts DESC,u.created_at ASC LIMIT 30
  `);
  res.json({campaigns,profiles,channels:['facebook','instagram','tiktok','whatsapp','other']});
}));

app.post('/api/admin/growth-campaigns', auth, adminOnly, asyncRoute(async (req,res) => {
  const name=String(req.body?.name || '').trim().slice(0,120);
  const channel=String(req.body?.channel || 'other').trim().toLowerCase();
  const username=String(req.body?.target_username || req.user.username || '').trim().replace(/^@/,'');
  if(name.length<2) return res.status(400).json({error:'Escribe un nombre para la campaña'});
  if(!['facebook','instagram','tiktok','whatsapp','other'].includes(channel)) return res.status(400).json({error:'Canal no válido'});
  const targetResult=await pool.query(`SELECT id,username,name,invite_code,friend_gate_enabled,friend_gate_required_referrals FROM users WHERE LOWER(username)=LOWER($1) AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE LIMIT 1`,[username]);
  const target=targetResult.rows[0];
  if(!target) return res.status(404).json({error:'Perfil destino no encontrado'});
  let slug=slugifyCampaign(`${name}-${channel}`);
  for(let i=0;i<6;i++){
    const exists=await pool.query(`SELECT 1 FROM growth_campaigns WHERE slug=$1 LIMIT 1`,[slug]);
    if(!exists.rowCount) break;
    slug=`${slugifyCampaign(`${name}-${channel}`).slice(0,43)}-${crypto.randomBytes(2).toString('hex')}`;
  }
  const {rows}=await pool.query(`INSERT INTO growth_campaigns(created_by,target_user_id,name,slug,channel) VALUES($1,$2,$3,$4,$5) RETURNING *`,[req.user.id,target.id,name,slug,channel]);
  const row={...rows[0],target_username:target.username,target_name:target.name,target_invite_code:target.invite_code,target_gate_enabled:target.friend_gate_enabled,target_gate_required:target.friend_gate_required_referrals};
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,target_user_id,note) VALUES($1,'growth_campaign_create',$2,$3)`,[req.user.id,target.id,JSON.stringify({name,slug,channel}).slice(0,1000)]);
  res.json({...row,link:growthCampaignLink(row)});
}));

app.patch('/api/admin/growth-campaigns/:id', auth, adminOnly, asyncRoute(async (req,res) => {
  const id=Number(req.params.id);
  if(!Number.isInteger(id)) return res.status(400).json({error:'Campaña inválida'});
  const active=Boolean(req.body?.active);
  const {rows}=await pool.query(`UPDATE growth_campaigns SET active=$2,updated_at=NOW() WHERE id=$1 RETURNING id,name,slug,active`,[id,active]);
  if(!rows[0]) return res.status(404).json({error:'Campaña no encontrada'});
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'growth_campaign_status',$2)`,[req.user.id,JSON.stringify({id,active}).slice(0,1000)]);
  res.json(rows[0]);
}));


// --- V1.10.0: Administración de publicidad -------------------------------
app.get('/api/admin/ads', auth, adminOnly, asyncRoute(async (_req,res) => {
  const settingsResult=await pool.query(`SELECT enabled,updated_at FROM ad_settings WHERE id=1`);
  const {rows}=await pool.query(`
    SELECT a.*,
      COALESCE((SELECT SUM(impressions)::bigint FROM ad_daily_stats ds WHERE ds.ad_id=a.id),0)::bigint AS impressions,
      COALESCE((SELECT SUM(clicks)::bigint FROM ad_daily_stats ds WHERE ds.ad_id=a.id),0)::bigint AS clicks,
      COALESCE((SELECT SUM(impressions)::bigint FROM ad_daily_stats ds WHERE ds.ad_id=a.id AND ds.day>=CURRENT_DATE-29),0)::bigint AS impressions_30d,
      COALESCE((SELECT SUM(clicks)::bigint FROM ad_daily_stats ds WHERE ds.ad_id=a.id AND ds.day>=CURRENT_DATE-29),0)::bigint AS clicks_30d
    FROM ads a ORDER BY a.created_at DESC
  `);
  const ids=rows.map(r=>r.id);
  let targets=[];
  if(ids.length){
    const result=await pool.query(`SELECT apt.ad_id,u.id,u.username,u.name,u.avatar FROM ad_profile_targets apt JOIN users u ON u.id=apt.user_id WHERE apt.ad_id=ANY($1::bigint[]) AND COALESCE(u.social_hidden,FALSE)=FALSE ORDER BY u.username`,[ids]);
    targets=result.rows;
  }
  const byAd=new Map();
  targets.forEach(t=>{if(!byAd.has(String(t.ad_id)))byAd.set(String(t.ad_id),[]);byAd.get(String(t.ad_id)).push({id:t.id,username:t.username,name:t.name,avatar:t.avatar});});
  res.json({settings:settingsResult.rows[0] || {enabled:false},ads:rows.map(r=>({...r,targets:byAd.get(String(r.id))||[]}))});
}));

app.patch('/api/admin/ads/settings', auth, adminOnly, asyncRoute(async (req,res) => {
  const enabled=Boolean(req.body?.enabled);
  const {rows}=await pool.query(`UPDATE ad_settings SET enabled=$1,updated_by=$2,updated_at=NOW() WHERE id=1 RETURNING enabled,updated_at`,[enabled,req.user.id]);
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'advertising_settings',$2)`,[req.user.id,JSON.stringify({enabled}).slice(0,1000)]);
  res.json(rows[0]);
}));

app.post('/api/admin/ads/upload', auth, adminOnly, upload.single('file'), asyncRoute(async (req,res) => {
  if(!req.file) return res.status(400).json({error:'Selecciona una imagen'});
  if(!String(req.file.mimetype||'').startsWith('image/')) return res.status(400).json({error:'Para publicidad solo se permiten imágenes'});
  if(req.file.size>MAX_IMAGE_UPLOAD_BYTES) return res.status(413).json({error:'La imagen supera el límite de 10 MB'});
  if(!cloudinaryConfigured()) return res.status(503).json({error:'Cloudinary debe estar configurado para subir banners desde el ordenador'});
  const uploaded=await uploadMediaBuffer(req.file.buffer,{mimeType:req.file.mimetype,originalName:req.file.originalname,userId:req.user.id});
  res.json({url:uploaded.secureUrl,provider:uploaded.provider,provider_id:uploaded.providerId,resource_type:uploaded.resourceType || 'image',width:uploaded.width,height:uploaded.height});
}));

app.post('/api/admin/ads', auth, adminOnly, asyncRoute(async (req,res) => {
  const ad=normalizeAdPayload(req.body || {});
  if(ad.name.length<2) return res.status(400).json({error:'Escribe un nombre interno para el anuncio'});
  const result=await withTransaction(async client=>{
    const targetProfiles=await validateAdTargetUsers(ad.target_ids,client);
    const {rows}=await client.query(`
      INSERT INTO ads(created_by,name,active,creative_type,image_url,image_provider,image_provider_id,image_resource_type,mobile_image_url,mobile_image_provider,mobile_image_provider_id,mobile_image_resource_type,link_url,google_code,alt_text,alt_text_en,display_title,display_title_en,display_text,display_text_en,button_text,button_text_en,placements,desktop_enabled,mobile_enabled,profile_mode,priority,starts_at,ends_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::text[],$24,$25,$26,$27,$28,$29)
      RETURNING *
    `,[req.user.id,ad.name,ad.active,ad.creative_type,ad.image_url,ad.image_provider,ad.image_provider_id,ad.image_resource_type,ad.mobile_image_url,ad.mobile_image_provider,ad.mobile_image_provider_id,ad.mobile_image_resource_type,ad.link_url,ad.google_code,ad.alt_text,ad.alt_text_en,ad.display_title,ad.display_title_en,ad.display_text,ad.display_text_en,ad.button_text,ad.button_text_en,ad.placements,ad.desktop_enabled,ad.mobile_enabled,ad.profile_mode,ad.priority,ad.starts_at,ad.ends_at]);
    const row=rows[0];
    for(const id of ad.target_ids) await client.query(`INSERT INTO ad_profile_targets(ad_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[row.id,id]);
    await client.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'advertising_create',$2)`,[req.user.id,JSON.stringify({id:row.id,name:row.name,type:row.creative_type,placements:row.placements,profile_mode:row.profile_mode}).slice(0,1000)]);
    return {...row,targets:targetProfiles};
  });
  res.json(result);
}));

app.patch('/api/admin/ads/:id', auth, adminOnly, asyncRoute(async (req,res) => {
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0) return res.status(400).json({error:'Anuncio no válido'});
  const ad=normalizeAdPayload(req.body || {});
  if(ad.name.length<2) return res.status(400).json({error:'Escribe un nombre interno para el anuncio'});
  const result=await withTransaction(async client=>{
    const oldResult=await client.query(`SELECT * FROM ads WHERE id=$1 FOR UPDATE`,[id]);
    const old=oldResult.rows[0];
    if(!old) throw Object.assign(new Error('Anuncio no encontrado'),{status:404});
    const targetProfiles=await validateAdTargetUsers(ad.target_ids,client);
    const {rows}=await client.query(`
      UPDATE ads SET name=$2,active=$3,creative_type=$4,image_url=$5,image_provider=$6,image_provider_id=$7,image_resource_type=$8,
        mobile_image_url=$9,mobile_image_provider=$10,mobile_image_provider_id=$11,mobile_image_resource_type=$12,link_url=$13,google_code=$14,alt_text=$15,alt_text_en=$16,
        display_title=$17,display_title_en=$18,display_text=$19,display_text_en=$20,button_text=$21,button_text_en=$22,placements=$23::text[],desktop_enabled=$24,mobile_enabled=$25,profile_mode=$26,priority=$27,starts_at=$28,ends_at=$29,updated_at=NOW()
      WHERE id=$1 RETURNING *
    `,[id,ad.name,ad.active,ad.creative_type,ad.image_url,ad.image_provider,ad.image_provider_id,ad.image_resource_type,ad.mobile_image_url,ad.mobile_image_provider,ad.mobile_image_provider_id,ad.mobile_image_resource_type,ad.link_url,ad.google_code,ad.alt_text,ad.alt_text_en,ad.display_title,ad.display_title_en,ad.display_text,ad.display_text_en,ad.button_text,ad.button_text_en,ad.placements,ad.desktop_enabled,ad.mobile_enabled,ad.profile_mode,ad.priority,ad.starts_at,ad.ends_at]);
    await client.query(`DELETE FROM ad_profile_targets WHERE ad_id=$1`,[id]);
    for(const targetId of ad.target_ids) await client.query(`INSERT INTO ad_profile_targets(ad_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,targetId]);
    await client.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'advertising_update',$2)`,[req.user.id,JSON.stringify({id,name:ad.name,type:ad.creative_type,placements:ad.placements,profile_mode:ad.profile_mode}).slice(0,1000)]);
    return {row:{...rows[0],targets:targetProfiles},old};
  });
  const cleanups=[];
  if(result.old.image_provider_id && result.old.image_provider_id!==result.row.image_provider_id) cleanups.push(destroyRemoteAsset(uploadedAdAsset(result.old,false)));
  if(result.old.mobile_image_provider_id && result.old.mobile_image_provider_id!==result.row.mobile_image_provider_id) cleanups.push(destroyRemoteAsset(uploadedAdAsset(result.old,true)));
  if(cleanups.length) await Promise.allSettled(cleanups);
  res.json(result.row);
}));

app.patch('/api/admin/ads/:id/status', auth, adminOnly, asyncRoute(async (req,res) => {
  const id=Number(req.params.id),active=Boolean(req.body?.active);
  if(!Number.isInteger(id)||id<=0) return res.status(400).json({error:'Anuncio no válido'});
  const {rows}=await pool.query(`UPDATE ads SET active=$2,updated_at=NOW() WHERE id=$1 RETURNING id,name,active`,[id,active]);
  if(!rows[0]) return res.status(404).json({error:'Anuncio no encontrado'});
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'advertising_status',$2)`,[req.user.id,JSON.stringify({id,active}).slice(0,1000)]);
  res.json(rows[0]);
}));

app.delete('/api/admin/ads/:id', auth, adminOnly, asyncRoute(async (req,res) => {
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0) return res.status(400).json({error:'Anuncio no válido'});
  const result=await withTransaction(async client=>{
    const oldResult=await client.query(`SELECT * FROM ads WHERE id=$1 FOR UPDATE`,[id]);
    const old=oldResult.rows[0];
    if(!old) throw Object.assign(new Error('Anuncio no encontrado'),{status:404});
    await client.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'advertising_delete',$2)`,[req.user.id,JSON.stringify({id,name:old.name}).slice(0,1000)]);
    await client.query(`DELETE FROM ads WHERE id=$1`,[id]);
    return old;
  });
  await Promise.allSettled([destroyRemoteAsset(uploadedAdAsset(result,false)),destroyRemoteAsset(uploadedAdAsset(result,true))]);
  res.json({ok:true,id});
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
    const { rows } = await client.query('SELECT id,user_id,media_id FROM posts WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!rows[0]) return null;
    await client.query(`INSERT INTO moderation_actions(admin_id,action,target_user_id,post_id,note) VALUES($1,'remove_post',$2,$3,$4)`,
      [req.user.id, rows[0].user_id, rows[0].id, String(req.body?.note || '').slice(0,1000)]);
    await client.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
    return rows[0];
  });
  if (!result) return res.status(404).json({ error:'Publicación no encontrada' });
  if (result.media_id) await cleanupMediaIfUnused(result.media_id);
  res.json({ ok:true });
}));

app.get('/api/admin/media-storage', auth, adminOnly, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE provider='cloudinary')::int AS cloudinary,
      COUNT(*) FILTER (WHERE data IS NOT NULL)::int AS legacy_in_postgresql,
      COALESCE(SUM(octet_length(data)) FILTER (WHERE data IS NOT NULL),0)::bigint AS legacy_bytes
    FROM media
  `);
  res.json({ ...rows[0], configured: cloudinaryConfigured(), active_provider: cloudinaryConfigured() ? 'cloudinary' : 'postgresql-fallback' });
}));

// V1.9.1: gestión y borrado seguro de usuarios desde Administración.
app.get('/api/admin/users', auth, adminOnly, asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 120);
  const limit = Math.min(100, Math.max(10, Math.floor(Number(req.query.limit) || 50)));
  const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
  const like = q ? `%${q}%` : '';
  const params = [q, like, limit, offset];
  const { rows } = await pool.query(`
    SELECT u.id,u.username,u.name,u.email,u.role,u.account_status,u.social_hidden,u.email_verified_at,u.avatar,
           u.created_at,u.last_seen_at,u.friend_gate_enabled,
           (SELECT COUNT(*)::int FROM posts p WHERE p.user_id=u.id) AS posts_count,
           (SELECT COUNT(*)::int FROM referral_attributions r WHERE r.inviter_id=u.id) AS referrals_count
      FROM users u
     WHERE u.is_demo=FALSE
       AND ($1::text='' OR u.username ILIKE $2::text OR u.name ILIKE $2::text OR u.email ILIKE $2::text)
     ORDER BY u.created_at DESC
     LIMIT $3::int OFFSET $4::int
  `, params);
  const totalResult = await pool.query(`
    SELECT COUNT(*)::int AS total
      FROM users u
     WHERE u.is_demo=FALSE
       AND ($1::text='' OR u.username ILIKE $2::text OR u.name ILIKE $2::text OR u.email ILIKE $2::text)
  `, [q, like]);
  res.json({
    users: rows.map(row => ({ ...row, is_admin: isAdminRecord(row) })),
    total: Number(totalResult.rows[0]?.total || 0),
    query: q,
    limit,
    offset
  });
}));

app.delete('/api/admin/users/:id', auth, adminOnly, asyncRoute(async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error:'Usuario no válido' });
  if (targetId === Number(req.user.id)) return res.status(400).json({ error:'No puedes eliminar tu propia cuenta desde Administración' });

  const confirmation = String(req.body.confirmation || '').trim().replace(/^@/, '');
  const reason = String(req.body.reason || '').trim().slice(0, 1000);

  const result = await withTransaction(async client => {
    const targetResult = await client.query(`
      SELECT id,username,name,email,role,account_status
        FROM users
       WHERE id=$1 AND is_demo=FALSE
       FOR UPDATE
    `, [targetId]);
    const target = targetResult.rows[0];
    if (!target) {
      const err = new Error('Usuario no encontrado');
      err.status = 404;
      throw err;
    }
    if (isAdminRecord(target)) {
      const err = new Error('Las cuentas de administración están protegidas y no se pueden eliminar desde este panel');
      err.status = 400;
      throw err;
    }
    if (!confirmation || confirmation.toLowerCase() !== String(target.username).toLowerCase()) {
      const err = new Error(`Escribe ${target.username} para confirmar la eliminación`);
      err.status = 400;
      throw err;
    }

    const mediaResult = await client.query(`
      SELECT provider,provider_id,resource_type,delivery_type
        FROM media
       WHERE user_id=$1 AND provider='cloudinary' AND provider_id<>''
    `, [targetId]);

    const auditNote = [
      `Usuario eliminado: @${target.username} <${target.email}>`,
      reason ? `Motivo: ${reason}` : 'Sin motivo interno indicado'
    ].join(' · ').slice(0, 2000);
    await client.query(`
      INSERT INTO moderation_actions(admin_id,action,target_user_id,note)
      VALUES($1,'delete_user',$2,$3)
    `, [req.user.id, targetId, auditNote]);

    await client.query('DELETE FROM users WHERE id=$1', [targetId]);
    return { target, media: mediaResult.rows };
  });

  // La base de datos ya quedó consistente. La limpieza remota se hace después para
  // no dejar referencias rotas si Cloudinary tuviera un fallo temporal.
  const cleanup = await Promise.allSettled(result.media.map(item => destroyRemoteAsset(item)));
  const mediaCleanupFailures = cleanup.filter(item => item.status === 'rejected').length;
  io.to(`user:${targetId}`).disconnectSockets(true);
  onlineUsers.delete(String(targetId));
  await securityEvent(req, 'admin_user_deleted', req.user.id, {
    deleted_user_id: targetId,
    deleted_username: result.target.username,
    media_cleanup_failures: mediaCleanupFailures
  });

  res.json({
    ok:true,
    deleted_user:{ id:targetId, username:result.target.username },
    media_cleanup_failures:mediaCleanupFailures
  });
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

app.get('/api/admin/security-events', auth, adminOnly, asyncRoute(async (_req,res) => {
  const {rows}=await pool.query(`
    SELECT se.id,se.event_type,se.metadata,se.created_at,u.username
    FROM security_events se LEFT JOIN users u ON u.id=se.user_id
    ORDER BY se.created_at DESC LIMIT 100
  `);
  res.json(rows);
}));

app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.use((err, req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'El archivo supera el límite máximo de 100 MB.', code:'MEDIA_TOO_LARGE' });
  const status = err.status || 500;
  if (status >= 500) void operationalEvent({ userId:req.user?.id || null, eventType:'server_error', severity:'error', path:req.originalUrl || req.path || '', userAgent:req.get('user-agent') || '', metadata:{ message:String(err?.message || 'Error interno').slice(0,1000) } });
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message });
});


async function hardenLegacyCloudinaryMedia() {
  if (!cloudinaryConfigured()) return;
  if (String(process.env.HARDEN_LEGACY_MEDIA_ON_START || 'true').toLowerCase() === 'false') return;
  const { rows } = await pool.query(`
    SELECT id,provider,provider_id,resource_type,delivery_type
    FROM media
    WHERE provider='cloudinary'
      AND provider_id<>''
      AND COALESCE(delivery_type,'upload') <> 'authenticated'
    ORDER BY id ASC
  `);
  if (!rows.length) return;
  console.log(`Protección multimedia V1.12.3: reforzando ${rows.length} recurso(s) heredado(s)...`);
  let ok = 0;
  let failed = 0;
  for (const item of rows) {
    try {
      const result = await hardenRemoteAsset(item);
      if (!result) continue;
      await pool.query(`
        UPDATE media
        SET provider_id=$2,
            secure_url=COALESCE(NULLIF($3,''),secure_url),
            resource_type=COALESCE(NULLIF($4,''),resource_type),
            delivery_type=$5,
            format=COALESCE(NULLIF($6,''),format),
            migrated_at=NOW()
        WHERE id=$1
      `, [item.id, result.providerId || item.provider_id, result.secureUrl || '', result.resourceType || item.resource_type, result.deliveryType || 'authenticated', result.format || '']);
      ok += 1;
    } catch (err) {
      failed += 1;
      console.error(`Protección multimedia: no se pudo reforzar media #${item.id}:`, err.message);
    }
  }
  console.log(`Protección multimedia V1.12.3: ${ok} reforzado(s), ${failed} pendiente(s).`);
}

async function start() {
  await initDb();
  await syncSystemAccounts();
  await pool.query(`DELETE FROM app_events WHERE created_at < NOW()-INTERVAL '90 days'`).catch(err => console.error('Limpieza app_events:',err.message));
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Instant Admirers V1.12.3 en http://localhost:${PORT}`);
    void hardenLegacyCloudinaryMedia().catch(err => console.error('Protección multimedia heredada:', err.message));
  });
}

start().catch((err) => {
  console.error('No se pudo iniciar Instant Admirers:', err);
  process.exit(1);
});
