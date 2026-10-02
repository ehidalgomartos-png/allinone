const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const os = require('os');
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
const { configured: mediaStorageConfigured, cloudinaryConfigured, cloudinaryUploadFallbackAllowed, imageUploadConfigured, videoUploadConfigured, bunnyStorageConfigured, bunnyStreamConfigured, providerSummary: mediaProviderSummary, uploadBuffer: uploadMediaBuffer, deliveryUrl: remoteDeliveryUrl, cloudinaryDeliveryUrl, getBunnyStreamVideo, hardenAsset: hardenRemoteAsset, destroyAsset: destroyRemoteAsset } = require('./src/mediaStorage');
const { createDemoEnvironment, clearDemoEnvironment, demoStatus } = require('./src/demoLab');
const { createVirtualCommunity, runVirtualActivity, rescheduleVirtualActivity, virtualActivityHistory, runVirtualInteractions, rescheduleVirtualInteractions, virtualInteractionHistory, virtualCommunityStatus, listVirtualProfiles, virtualInbox } = require('./src/virtualCommunity');
const { IMAGE_KINDS, normalizeTags: normalizeVirtualImageTags, safeKind: safeVirtualImageKind, listVirtualProfileMedia, syncPilotVirtualImages, syncVirtualProfileBasePacks, virtualPackStatus } = require('./src/virtualImageSystem');
const { importRealisticPackArchive } = require('./src/virtualPackImporter');
const { MASS_IMPORT_ADVISORY_LOCK, insertJob: insertVirtualMassImportJob, stageMassImportJob, failMassImportJob, commitMassImportJob, rollbackMassImportJob, cancelMassImportJob, massImportJobDetail, massImportHistory, recoverInterruptedMassImports } = require('./src/virtualMassImporter');

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
app.use('/vendor/hls', express.static(path.join(__dirname, 'node_modules', 'hls.js', 'dist'), {
  etag:true, lastModified:true, maxAge:'7d'
}));
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

// V1.12.38 · Emails inteligentes / recuperación.
const SMART_EMAIL_ACTIVE_GRACE_MINUTES = Math.max(5, Math.min(60, Number(process.env.SMART_EMAIL_ACTIVE_GRACE_MINUTES || 10)));
const SMART_EMAIL_LOW_SIGNAL_COOLDOWN_MINUTES = Math.max(15, Math.min(240, Number(process.env.SMART_EMAIL_LOW_SIGNAL_COOLDOWN_MINUTES || 60)));
const SMART_EMAIL_DIGEST_AFTER_HOURS = Math.max(2, Math.min(24, Number(process.env.SMART_EMAIL_DIGEST_AFTER_HOURS || 3)));
const SMART_EMAIL_DIGEST_COOLDOWN_HOURS = Math.max(6, Math.min(48, Number(process.env.SMART_EMAIL_DIGEST_COOLDOWN_HOURS || 18)));
const SMART_EMAIL_RECOVERY_AFTER_DAYS = Math.max(2, Math.min(30, Number(process.env.SMART_EMAIL_RECOVERY_AFTER_DAYS || 3)));
const SMART_EMAIL_RECOVERY_COOLDOWN_DAYS = Math.max(3, Math.min(30, Number(process.env.SMART_EMAIL_RECOVERY_COOLDOWN_DAYS || 7)));
let smartEmailCycleRunning = false;

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
const publicTeaserLimiter = limiter({ windowMs:10*60*1000, max:80, message:'Demasiadas solicitudes de vista previa. Espera unos minutos.' });
app.use('/api', writeLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/forgot-password', recoveryLimiter);
app.use('/api/auth/reset-password', recoveryLimiter);
app.use('/api/auth/verify-email/request', recoveryLimiter);
app.use('/api/reports', reportLimiter);
app.use('/api/telemetry', telemetryLimiter);

function normalizeEmail(value='') { return String(value).trim().toLowerCase(); }
function seoEscapeHtml(value='') {
  return String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
}
function seoEscapeXml(value='') {
  return String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&apos;'}[ch]));
}
function seoPlainText(value='', max=500) {
  return String(value ?? '').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function seoAbsoluteUrl(value='') {
  const raw=String(value || '').trim();
  if(!raw) return '';
  if(/^https?:\/\//i.test(raw)) return raw;
  if(raw.startsWith('/')) return `${APP_URL}${raw}`;
  return '';
}
function seoProfileInterests(profile={}) {
  return String(profile.interests || '')
    .split(',')
    .map(value=>seoPlainText(value,48))
    .filter(Boolean)
    .slice(0,4);
}
function seoProfileDescription(profile={}) {
  const display=seoPlainText(profile.name || profile.username || 'Perfil',80);
  const handle=seoPlainText(profile.username || '',30);
  const details=seoPlainText([profile.headline,profile.bio].filter(Boolean).join(' · '),220);
  const location=seoPlainText(profile.location || '',80);
  if(profile.is_virtual){
    const age=Number(profile.virtual_age || 0);
    const interests=seoProfileInterests(profile);
    const parts=[`${display}${handle ? ` (@${handle})` : ''} es un perfil virtual gestionado por Instant Admirers${location ? ` en ${location}` : ''}.`];
    if(Number.isFinite(age) && age>=18 && age<=99) parts.push(`${age} años.`);
    if(interests.length) parts.push(`Intereses: ${interests.slice(0,3).join(', ')}.`);
    else if(details) parts.push(details);
    return seoPlainText(parts.join(' '),158);
  }
  const prefix=`Descubre el perfil de ${display}${handle ? ` (@${handle})` : ''} en Instant Admirers.`;
  return seoPlainText(details ? `${prefix} ${details}` : `${prefix} Lee sus publicaciones públicas y conecta en la comunidad.`,158);
}
function seoProfileTitle(profile={}) {
  const display=seoPlainText(profile.name || profile.username || 'Perfil',70);
  const handle=seoPlainText(profile.username || '',30);
  if(profile.is_virtual){
    const location=seoPlainText(profile.location || '',45);
    const candidate=`${display} · Perfil virtual${location ? ` en ${location}` : ''} | Instant Admirers`;
    return candidate.length<=68 ? candidate : `${display.slice(0,34)} · Perfil virtual | Instant Admirers`;
  }
  const candidate=`${display}${handle && display.toLowerCase()!==handle.toLowerCase() ? ` (@${handle})` : ''} | Instant Admirers`;
  return candidate.length<=62 ? candidate : `${display.slice(0,40)} | Instant Admirers`;
}
function seoProfileJsonLd(profile, counts={}) {
  const url=`${APP_URL}/${encodeURIComponent(profile.username)}`;
  const description=seoProfileDescription(profile);
  const image=seoAbsoluteUrl(profile.avatar);
  const stats=[];
  const followers=Math.max(0,Number(counts.followers_count||0));
  const posts=Math.max(0,Number(counts.posts_count||0));
  if(followers) stats.push({'@type':'InteractionCounter',interactionType:'https://schema.org/FollowAction',userInteractionCount:followers});
  if(posts) stats.push({'@type':'InteractionCounter',interactionType:'https://schema.org/WriteAction',userInteractionCount:posts});
  const person={
    '@id':`${url}#profile`, '@type':'Person', name:seoPlainText(profile.name || profile.username,100),
    alternateName:`@${seoPlainText(profile.username,30)}`, description, url
  };
  if(profile.is_virtual) {
    person.disambiguatingDescription='Personaje virtual y anfitrión de comunidad gestionado por Instant Admirers; no representa a una persona real.';
    const location=seoPlainText(profile.location || '',80);
    const interests=seoProfileInterests(profile);
    if(location) person.homeLocation={'@type':'Place',name:location};
    if(interests.length) person.knowsAbout=interests;
  }
  if(image) person.image=image;
  if(stats.length) person.interactionStatistic=stats;
  const data={'@context':'https://schema.org','@type':'ProfilePage',url,name:seoProfileTitle(profile),description,mainEntity:person};
  if(profile.created_at) data.dateCreated=new Date(profile.created_at).toISOString();
  return JSON.stringify(data).replace(/</g,'\\u003c');
}
function seoProfileServerHtml(profile, posts=[], counts={}) {
  const title=seoProfileTitle(profile);
  const description=seoProfileDescription(profile);
  const canonical=`${APP_URL}/${encodeURIComponent(profile.username)}`;
  const avatar=seoAbsoluteUrl(profile.avatar);
  const cover=seoAbsoluteUrl(profile.cover);
  const shareImage=avatar || `${APP_URL}/assets/brand/og-card.png`;
  const postHtml=posts.length ? posts.map(post=>{
    const text=seoPlainText(post.text || post.repost_text || '',1200);
    const mediaType=String(post.seo_media_type || 'none').toLowerCase();
    const hasMedia=Boolean(post.seo_has_media);
    const lockLabel=mediaType==='video' ? 'Vídeo bloqueado · Crea una cuenta para verlo' : 'Foto bloqueada · Crea una cuenta para verla';
    return `<article class="seo-profile-post" id="post-${Number(post.id)}">${text?`<p>${seoEscapeHtml(text)}</p>`:''}${hasMedia?`<div class="seo-media-lock" aria-label="Contenido multimedia bloqueado">🔒 ${seoEscapeHtml(lockLabel)}</div>`:''}</article>`;
  }).join('') : '<p class="seo-empty">Este perfil todavía no tiene publicaciones públicas.</p>';
  const registerParams=new URLSearchParams({auth:'register'});
  if(profile.invite_code){ registerParams.set('ref',String(profile.invite_code)); registerParams.set('ref_source','direct_profile'); registerParams.set('direct_profile_referrer',String(profile.username)); }
  const registerUrl=`/${encodeURIComponent(profile.username)}?${registerParams.toString()}`;
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b0b12"><meta name="color-scheme" content="dark light">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<meta name="ia-dynamic-seo" content="profile">
<title>${seoEscapeHtml(title)}</title>
<meta name="description" content="${seoEscapeHtml(description)}">
<link rel="canonical" href="${seoEscapeHtml(canonical)}">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/svg+xml" href="/assets/brand/instant-admirers-mark.svg">
<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">
<meta property="og:type" content="profile"><meta property="og:site_name" content="Instant Admirers"><meta property="og:locale" content="es_ES">
<meta property="og:title" content="${seoEscapeHtml(title)}"><meta property="og:description" content="${seoEscapeHtml(description)}"><meta property="og:url" content="${seoEscapeHtml(canonical)}"><meta property="og:image" content="${seoEscapeHtml(shareImage)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${seoEscapeHtml(title)}"><meta name="twitter:description" content="${seoEscapeHtml(description)}"><meta name="twitter:image" content="${seoEscapeHtml(shareImage)}">
<script type="application/ld+json">${seoProfileJsonLd(profile,counts)}</script>
<script src="/theme.js?v=1.12.42"></script>
<link rel="stylesheet" href="/styles.css?v=1.12.42">
<style>.seo-profile-prerender{max-width:760px;margin:0 auto;padding:26px 16px 110px;color:#f7f7fb;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.seo-profile-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:#fff;font-size:24px;font-weight:800;margin-bottom:18px}.seo-profile-brand img{width:38px;height:38px}.seo-profile-card{overflow:hidden;border:1px solid #2b2d3c;border-radius:22px;background:#141620}.seo-profile-cover{height:190px;background:#222532}.seo-profile-cover img{width:100%;height:100%;object-fit:cover}.seo-profile-body{padding:0 22px 22px}.seo-profile-avatar{width:104px;height:104px;border-radius:50%;margin-top:-54px;border:5px solid #141620;background:#242736;overflow:hidden;display:grid;place-items:center;font-size:28px;font-weight:800}.seo-profile-avatar img{width:100%;height:100%;object-fit:cover}.seo-profile-body h1{font-size:30px;margin:12px 0 2px}.seo-handle{color:#9da3b4}.seo-headline{font-weight:700;margin:15px 0 6px}.seo-bio{color:#d4d7e3;line-height:1.55;white-space:pre-wrap}.seo-virtual-notice{display:flex;gap:8px;align-items:flex-start;margin:14px 0;padding:12px 14px;border:1px solid #7147b8;border-radius:13px;background:rgba(124,60,255,.12);color:#e8dcff;line-height:1.45}.seo-virtual-notice b{white-space:nowrap;color:#ff74c7}.seo-cta{display:inline-flex;margin-top:16px;padding:12px 17px;border-radius:12px;text-decoration:none;color:#fff;font-weight:800;background:linear-gradient(135deg,#ff2aa1,#7c3cff)}.seo-profile-posts{margin-top:20px}.seo-profile-posts h2{font-size:21px}.seo-profile-post{border:1px solid #292c3b;background:#12141d;border-radius:16px;padding:16px;margin:12px 0}.seo-profile-post p{line-height:1.55;white-space:pre-wrap}.seo-media-lock{margin-top:12px;border:1px dashed #555a70;border-radius:12px;padding:18px;color:#c7cad7;text-align:center}.seo-empty{color:#aeb3c3}.seo-profile-prerender-noscript{display:block}</style>
<link rel="stylesheet" href="/theme.css?v=1.12.42">
</head><body>
<div id="app"><main class="seo-profile-prerender">
<a class="seo-profile-brand" href="/"><img src="/assets/brand/instant-admirers-mark.svg" alt=""><span>Instant <b>Admirers</b></span></a>
<section class="seo-profile-card">${cover?`<div class="seo-profile-cover"><img src="${seoEscapeHtml(cover)}" alt="Cabecera de ${seoEscapeHtml(profile.name||profile.username)}"></div>`:'<div class="seo-profile-cover"></div>'}<div class="seo-profile-body"><div class="seo-profile-avatar">${avatar?`<img src="${seoEscapeHtml(avatar)}" alt="${seoEscapeHtml(profile.name||profile.username)}">`:`${seoEscapeHtml(String(profile.name||profile.username||'?').slice(0,1).toUpperCase())}`}</div><h1>${seoEscapeHtml(profile.name||profile.username)}</h1><div class="seo-handle">@${seoEscapeHtml(profile.username)}</div>${profile.is_virtual?'<div class="seo-virtual-notice"><b>✦ Perfil virtual</b><span>Personaje ficticio y anfitrión gestionado por Instant Admirers. No representa a una persona real.</span></div>':''}${profile.headline?`<div class="seo-headline">${seoEscapeHtml(seoPlainText(profile.headline,180))}</div>`:''}${profile.bio?`<p class="seo-bio">${seoEscapeHtml(seoPlainText(profile.bio,700))}</p>`:''}<a class="seo-cta" href="${seoEscapeHtml(registerUrl)}">Crear cuenta para ver todo el contenido</a></div></section>
<section class="seo-profile-posts"><h2>Publicaciones públicas de ${seoEscapeHtml(profile.name||profile.username)}</h2>${postHtml}</section>
</main></div><div id="modal-root"></div>
<script src="/i18n.js?v=1.12.42"></script><script src="/socket.io/socket.io.js"></script><script src="/vendor/hls/hls.min.js?v=1.12.42"></script><script src="/app.js?v=1.12.42"></script>
</body></html>`;
}
function seoProfilesHubHtml(profiles=[]) {
  const title='Perfiles de Instant Admirers | Conoce gente y conecta';
  const description='Descubre perfiles públicos y anfitriones virtuales de Instant Admirers. Explora intereses, publicaciones y nuevas conexiones.';
  const cards=profiles.map(p=>{
    const avatar=seoAbsoluteUrl(p.avatar);
    const desc=seoPlainText(p.headline || p.bio || `Perfil de @${p.username} en Instant Admirers.`,150);
    return `<a class="hub-card" href="/${encodeURIComponent(p.username)}">${avatar?`<img src="${seoEscapeHtml(avatar)}" alt="${seoEscapeHtml(p.name||p.username)}" loading="lazy">`:''}<span>@${seoEscapeHtml(p.username)}</span><b>${seoEscapeHtml(p.name||p.username)}</b>${p.is_virtual?'<em class="hub-virtual-badge">✦ Perfil virtual</em>':''}<p>${seoEscapeHtml(desc)}</p></a>`;
  }).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0b0b12"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1"><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${APP_URL}/perfiles/"><link rel="icon" href="/favicon.ico" sizes="any"><script src="/theme.js?v=1.12.42"></script><link rel="stylesheet" href="/seo.css?v=1.12.42"><link rel="stylesheet" href="/theme.css?v=1.12.42"><style>.hub-card img{width:58px;height:58px;object-fit:cover;border-radius:50%;margin-bottom:10px}.hub-virtual-badge{display:inline-flex;width:max-content;margin:7px 0 1px;padding:4px 8px;border-radius:999px;background:rgba(124,60,255,.12);border:1px solid rgba(124,60,255,.35);color:#9a5dff;font-size:12px;font-style:normal;font-weight:800}</style><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'CollectionPage',name:title,description,url:`${APP_URL}/perfiles/`,isPartOf:{'@type':'WebSite',name:'Instant Admirers',url:`${APP_URL}/`}}).replace(/</g,'\\u003c')}</script></head><body><header class="site-header"><div class="nav-wrap"><a class="brand" href="/" aria-label="Instant Admirers"><img src="/assets/brand/instant-admirers-mark.svg" alt=""><span>Instant <b>Admirers</b></span></a><nav aria-label="Navegación principal"><a href="/ciudades/">Ciudades</a><a href="/guias/">Guías</a><a href="/perfiles/">Perfiles</a><a href="/?auth=login">Entrar</a><a class="nav-cta" href="/?auth=register&utm_source=seo&utm_medium=organic&utm_campaign=public-profiles">Crear cuenta</a></nav></div></header><main><section class="hero"><div class="hero-inner"><div class="breadcrumbs"><a href="/">Inicio</a><span>›</span><span>Perfiles</span></div><p class="eyebrow">Perfiles de Instant Admirers</p><h1>Tu próxima conexión puede estar aquí</h1><p class="hero-lead hub-intro">Descubre perfiles públicos y anfitriones virtuales identificados de Instant Admirers.</p></div></section><section class="hub-grid">${cards || '<div class="hub-card"><b>Muy pronto</b><p>Nuevos perfiles por descubrir.</p></div>'}</section></main><footer class="site-footer"><div class="footer-wrap"><div><b>Instant Admirers</b><p>Comunidad 18+ para conectar, compartir y descubrir perfiles e intereses.</p></div><div class="footer-links"><a href="/ciudades/">Ciudades</a><a href="/guias/">Guías</a><a href="/privacy/">Privacidad</a><a href="/terms/">Términos</a></div></div></footer></body></html>`;
}

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
  const params=new URLSearchParams({
    ref:String(row.target_invite_code),
    invite:'profile',
    campaign:String(row.slug),
    utm_source:String(row.channel || 'other'),
    utm_medium:['facebook','instagram','tiktok'].includes(String(row.channel||'').toLowerCase()) ? 'social' : (String(row.channel||'').toLowerCase()==='whatsapp' ? 'messaging' : (String(row.channel||'').toLowerCase()==='google' ? 'paid-search' : 'referral')),
    utm_campaign:String(row.slug)
  });
  if(String(row.source_tag || '').trim()) params.set('utm_content',String(row.source_tag).trim().slice(0,160));
  return `${APP_URL}/${encodeURIComponent(row.target_username)}?${params.toString()}`;
}

function compactTrackingValue(value='', max=160) {
  return String(value || '').trim().replace(/[\r\n\t]+/g,' ').slice(0,max);
}

function trackingReferrerHost(value='') {
  const raw=compactTrackingValue(value,500);
  if(!raw) return '';
  try { return String(new URL(raw).hostname || '').toLowerCase().replace(/^www\./,'').slice(0,255); }
  catch (_) { return raw.toLowerCase().replace(/^www\./,'').split('/')[0].slice(0,255); }
}

function normalizedTrafficSource({utmSource='',referrerHost='',campaignChannel='other'}={}) {
  const explicit=compactTrackingValue(utmSource,120).toLowerCase();
  if(explicit) return explicit;
  const host=compactTrackingValue(referrerHost,255).toLowerCase();
  if(host){
    let ownHost='';
    try { ownHost=String(new URL(APP_URL).hostname || '').toLowerCase().replace(/^www\./,''); } catch (_) {}
    if(ownHost && host===ownHost){
      const channel=compactTrackingValue(campaignChannel,30).toLowerCase();
      return channel && channel!=='other' ? channel : 'direct';
    }
    if(host.includes('facebook.com') || host.includes('fb.com')) return 'facebook';
    if(host.includes('instagram.com')) return 'instagram';
    if(host.includes('tiktok.com')) return 'tiktok';
    if(host.includes('google.')) return 'google';
    if(host.includes('bing.com')) return 'bing';
    if(host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
    if(host.includes('twitter.com') || host.includes('x.com')) return 'x';
    if(host.includes('linkedin.com')) return 'linkedin';
    if(host.includes('reddit.com')) return 'reddit';
    return host.slice(0,120);
  }
  const channel=compactTrackingValue(campaignChannel,30).toLowerCase();
  return channel && channel!=='other' ? channel : 'direct';
}

function growthDeviceType(req, supplied='') {
  const explicit=compactTrackingValue(supplied,20).toLowerCase();
  if(['mobile','tablet','desktop'].includes(explicit)) return explicit;
  const ua=String(req.get('user-agent') || '').toLowerCase();
  if(/ipad|tablet|kindle|silk/.test(ua)) return 'tablet';
  if(/mobi|android|iphone|ipod/.test(ua)) return 'mobile';
  return ua ? 'desktop' : 'unknown';
}

async function incrementGrowthDaily(campaignId, field, client=pool) {
  const allowed=new Set(['visits','challenge_views','share_actions','teaser_views','teaser_signup_clicks']);
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


// V1.12.36 · Avisos sociales por email.
// Se envían fuera de la transacción para no bloquear likes/comentarios por Resend.
function socialEmailPreferenceKey(type='') {
  if (type === 'like') return 'email_like_notifications';
  if (['comment','mention','repost'].includes(type)) return 'email_comment_notifications';
  if (['follow','follow_request','follow_accept','friend_request','friend_accept'].includes(type)) return 'email_connection_notifications';
  return '';
}

function socialEmailCopy({type,actorName,actorUsername,actorVirtual=false,text='',english=false}={}) {
  const display=String(actorName || actorUsername || (english?'Someone':'Alguien')).trim();
  const safeDisplay=seoEscapeHtml(display);
  const safeHandle=seoEscapeHtml(actorUsername ? `@${actorUsername}` : '');
  const virtualNote=actorVirtual
    ? (english?' <span style="color:#a98cff;font-weight:700">· Virtual profile</span>':' <span style="color:#a98cff;font-weight:700">· Perfil virtual</span>')
    : '';
  const preview=seoEscapeHtml(String(text||'').replace(/\s+/g,' ').trim().slice(0,220));
  const who=`<b style="color:#fff">${safeDisplay}</b>${safeHandle?` <span style="color:#9a9daf">${safeHandle}</span>`:''}${virtualNote}`;
  const es={
    like:{subject:`${display} ha indicado que le gusta tu publicación`,title:'Nuevo Me gusta',body:`<p>${who} ha indicado que le gusta tu publicación.</p>`},
    comment:{subject:`${display} ha comentado tu publicación`,title:'Nuevo comentario',body:`<p>${who} ha comentado tu publicación.</p>${preview?`<div style="margin:14px 0;padding:12px 14px;border-left:3px solid #ff2aa1;background:#0e1018;border-radius:10px">${preview}</div>`:''}`},
    mention:{subject:`${display} te ha mencionado`,title:'Te han mencionado',body:`<p>${who} te ha mencionado en Instant Admirers.</p>${preview?`<div style="margin:14px 0;padding:12px 14px;border-left:3px solid #ff2aa1;background:#0e1018;border-radius:10px">${preview}</div>`:''}`},
    repost:{subject:`${display} ha compartido tu publicación`,title:'Han compartido tu publicación',body:`<p>${who} ha republicado tu contenido en Instant Admirers.</p>`},
    follow:{subject:`${display} ha empezado a seguirte`,title:'Nuevo seguidor',body:`<p>${who} ha empezado a seguirte.</p>`},
    follow_request:{subject:`${display} quiere seguirte`,title:'Nueva solicitud de seguimiento',body:`<p>${who} quiere seguir tu cuenta privada.</p>`},
    follow_accept:{subject:`${display} ha aceptado tu solicitud`,title:'Solicitud aceptada',body:`<p>${who} ha aceptado tu solicitud de seguimiento.</p>`},
    friend_request:{subject:`${display} te ha enviado una solicitud de amistad`,title:'Nueva solicitud de amistad',body:`<p>${who} quiere añadirte como amigo.</p>`},
    friend_accept:{subject:`${display} ha aceptado tu amistad`,title:'Ahora sois amigos',body:`<p>${who} ha aceptado tu solicitud de amistad.</p>`}
  };
  const en={
    like:{subject:`${display} liked your post`,title:'New like',body:`<p>${who} liked your post.</p>`},
    comment:{subject:`${display} commented on your post`,title:'New comment',body:`<p>${who} commented on your post.</p>${preview?`<div style="margin:14px 0;padding:12px 14px;border-left:3px solid #ff2aa1;background:#0e1018;border-radius:10px">${preview}</div>`:''}`},
    mention:{subject:`${display} mentioned you`,title:'You were mentioned',body:`<p>${who} mentioned you on Instant Admirers.</p>${preview?`<div style="margin:14px 0;padding:12px 14px;border-left:3px solid #ff2aa1;background:#0e1018;border-radius:10px">${preview}</div>`:''}`},
    repost:{subject:`${display} shared your post`,title:'Your post was shared',body:`<p>${who} reposted your content on Instant Admirers.</p>`},
    follow:{subject:`${display} started following you`,title:'New follower',body:`<p>${who} started following you.</p>`},
    follow_request:{subject:`${display} wants to follow you`,title:'New follow request',body:`<p>${who} wants to follow your private account.</p>`},
    follow_accept:{subject:`${display} accepted your request`,title:'Request accepted',body:`<p>${who} accepted your follow request.</p>`},
    friend_request:{subject:`${display} sent you a friend request`,title:'New friend request',body:`<p>${who} wants to add you as a friend.</p>`},
    friend_accept:{subject:`${display} accepted your friendship`,title:'You are now friends',body:`<p>${who} accepted your friend request.</p>`}
  };
  return (english?en:es)[type] || null;
}

async function sendSocialNotificationEmail({userId,actorId,type,postId=null,text=''}={}) {
  if (!emailConfigured() || !userId || !actorId) return false;
  const preferenceKey=socialEmailPreferenceKey(String(type||''));
  if (!preferenceKey) return false;
  const {rows}=await pool.query(`
    SELECT recipient.id,recipient.email,recipient.username,recipient.name,recipient.preferred_language,recipient.email_verified_at,
           recipient.is_virtual,recipient.last_seen_at,recipient.email_social_notifications,recipient.email_like_notifications,
           recipient.email_comment_notifications,recipient.email_connection_notifications,
           actor.username AS actor_username,actor.name AS actor_name,actor.is_virtual AS actor_is_virtual
      FROM users recipient JOIN users actor ON actor.id=$2
     WHERE recipient.id=$1 AND recipient.account_status='active'
       AND COALESCE(recipient.social_hidden,FALSE)=FALSE
     LIMIT 1
  `,[Number(userId),Number(actorId)]);
  const row=rows[0];
  if(!row || row.is_virtual || !row.email || !row.email_verified_at || row.email_social_notifications===false || row[preferenceKey]===false) return false;

  // V1.12.38: si la persona está conectada o acaba de usar la app, el aviso in-app es suficiente.
  if (smartEmailRecipientRecentlyActive(row)) return false;

  // Me gusta y seguimientos pueden llegar en ráfagas. Enviamos el primero y dejamos el resto
  // para el resumen inteligente en vez de llenar la bandeja de entrada.
  const lowSignal=['like','follow','follow_accept','friend_accept'].includes(String(type||''));
  if (lowSignal && await smartEmailSentRecently(Number(userId),'social-low-signal',SMART_EMAIL_LOW_SIGNAL_COOLDOWN_MINUTES)) return false;

  // Evita correos repetidos por dobles pulsaciones o varias acciones iguales seguidas.
  const dedupe=await pool.query(`
    SELECT COUNT(*)::int AS count FROM notifications
     WHERE user_id=$1 AND actor_id=$2 AND type=$3
       AND COALESCE(post_id,0)=COALESCE($4::bigint,0)
       AND created_at>=NOW()-INTERVAL '3 minutes'
  `,[Number(userId),Number(actorId),String(type),postId?Number(postId):null]);
  if(Number(dedupe.rows[0]?.count||0)>1) return false;

  const english=String(row.preferred_language||'').toLowerCase()==='en';
  const copy=socialEmailCopy({type:String(type),actorName:row.actor_name,actorUsername:row.actor_username,actorVirtual:Boolean(row.actor_is_virtual),text,english});
  if(!copy) return false;
  const activityUrl=`${APP_URL}/?view=notifications`;
  const actorLabel=String(row.actor_name || row.actor_username || (english?'Someone':'Alguien'));
  const plainMap={
    like:english?`${actorLabel} liked your post.`:`${actorLabel} ha indicado que le gusta tu publicación.`,
    comment:english?`${actorLabel} commented on your post${text?`: ${String(text).slice(0,220)}`:'.'}`:`${actorLabel} ha comentado tu publicación${text?`: ${String(text).slice(0,220)}`:'.'}`,
    mention:english?`${actorLabel} mentioned you on Instant Admirers.`:`${actorLabel} te ha mencionado en Instant Admirers.`,
    repost:english?`${actorLabel} shared your post.`:`${actorLabel} ha compartido tu publicación.`,
    follow:english?`${actorLabel} started following you.`:`${actorLabel} ha empezado a seguirte.`,
    follow_request:english?`${actorLabel} wants to follow you.`:`${actorLabel} quiere seguirte.`,
    follow_accept:english?`${actorLabel} accepted your follow request.`:`${actorLabel} ha aceptado tu solicitud de seguimiento.`,
    friend_request:english?`${actorLabel} sent you a friend request.`:`${actorLabel} te ha enviado una solicitud de amistad.`,
    friend_accept:english?`${actorLabel} accepted your friend request.`:`${actorLabel} ha aceptado tu solicitud de amistad.`
  };
  const virtualFooter=row.actor_is_virtual
    ? (english?'This interaction was made by a virtual profile clearly identified in the app.':'Esta interacción procede de un perfil virtual identificado como tal en la aplicación.')
    : (english?'You can change these email alerts in Account settings.':'Puedes cambiar estos avisos desde Ajustes de cuenta.');
  const sent=await sendEmail({
    to:row.email,
    subject:`${copy.subject} · Instant Admirers`,
    text:`${plainMap[String(type)]||copy.subject}\n\n${activityUrl}`,
    html:emailShell({lang:english?'en':'es',title:copy.title,body:copy.body,buttonText:english?'View activity':'Ver actividad',buttonUrl:activityUrl,footer:virtualFooter})
  });
  if(sent){
    await logSmartEmailDelivery(Number(userId),`social:${String(type)}`,{actor_id:Number(actorId),post_id:postId?Number(postId):null});
    if(lowSignal) await logSmartEmailDelivery(Number(userId),'social-low-signal',{type:String(type)});
  }
  return sent;
}

function queueSocialNotificationEmail(payload={}) {
  if(!emailConfigured()) return;
  const timer=setTimeout(()=>{
    void sendSocialNotificationEmail(payload).catch(err=>console.error('social email:',err.message));
  },250);
  timer.unref?.();
}


// V1.12.38 · Motor de emails inteligentes.
function smartEmailRecipientRecentlyActive(user={}) {
  const id=Number(user.id);
  if(id && onlineUsers.has(String(id))) return true;
  const last=user.last_seen_at ? new Date(user.last_seen_at).getTime() : 0;
  return Boolean(last && Date.now()-last < SMART_EMAIL_ACTIVE_GRACE_MINUTES*60*1000);
}

async function smartEmailSentRecently(userId,kind,minutes) {
  const {rows}=await pool.query(`
    SELECT EXISTS(
      SELECT 1 FROM smart_email_log
       WHERE user_id=$1 AND kind=$2
         AND sent_at>=NOW()-($3::int * INTERVAL '1 minute')
    ) AS yes
  `,[Number(userId),String(kind),Math.max(1,Math.floor(Number(minutes)||1))]);
  return Boolean(rows[0]?.yes);
}

async function logSmartEmailDelivery(userId,kind,metadata={}) {
  try{
    await pool.query(`INSERT INTO smart_email_log(user_id,kind,metadata) VALUES($1,$2,$3::jsonb)`,[
      Number(userId),String(kind).slice(0,50),JSON.stringify(metadata||{})
    ]);
  }catch(err){ console.error('smart email log:',err.message); }
}

async function smartDigestStats(userId) {
  const {rows}=await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE n.type='like')::int AS likes,
      COUNT(*) FILTER (WHERE n.type IN ('comment','mention','repost'))::int AS conversations,
      COUNT(*) FILTER (WHERE n.type IN ('follow','follow_request','follow_accept','friend_request','friend_accept'))::int AS connections
    FROM notifications n
    WHERE n.user_id=$1 AND n.read_at IS NULL
      AND n.created_at>=NOW()-INTERVAL '7 days'
      AND (n.actor_id IS NULL OR NOT EXISTS(
        SELECT 1 FROM blocks bl
         WHERE (bl.blocker_id=$1 AND bl.blocked_id=n.actor_id) OR (bl.blocker_id=n.actor_id AND bl.blocked_id=$1)
      ))
  `,[Number(userId)]);
  const {rows:messageRows}=await pool.query(`
    SELECT COUNT(*)::int AS unread
      FROM messages m
      JOIN conversations cv ON cv.id=m.conversation_id
      LEFT JOIN conversation_reads cr ON cr.conversation_id=cv.id AND cr.user_id=$1
     WHERE (cv.user1_id=$1 OR cv.user2_id=$1)
       AND m.sender_id<>$1
       AND m.created_at>COALESCE(cr.last_read_at,'epoch'::timestamptz)
       AND NOT EXISTS(
         SELECT 1 FROM blocks bl
          WHERE (bl.blocker_id=$1 AND bl.blocked_id=m.sender_id) OR (bl.blocker_id=m.sender_id AND bl.blocked_id=$1)
       )
  `,[Number(userId)]);
  const {rows:actorRows}=await pool.query(`
    SELECT a.name,a.username,a.is_virtual,MAX(n.created_at) AS latest
      FROM notifications n
      JOIN users a ON a.id=n.actor_id
     WHERE n.user_id=$1 AND n.read_at IS NULL AND n.created_at>=NOW()-INTERVAL '7 days'
       AND NOT EXISTS(
         SELECT 1 FROM blocks bl
          WHERE (bl.blocker_id=$1 AND bl.blocked_id=a.id) OR (bl.blocker_id=a.id AND bl.blocked_id=$1)
       )
     GROUP BY a.id,a.name,a.username,a.is_virtual
     ORDER BY latest DESC
     LIMIT 3
  `,[Number(userId)]);
  const base=rows[0]||{};
  const stats={
    likes:Number(base.likes||0),
    conversations:Number(base.conversations||0),
    connections:Number(base.connections||0),
    messages:Number(messageRows[0]?.unread||0),
    actors:actorRows.map(r=>({name:String(r.name||r.username||''),username:String(r.username||''),is_virtual:Boolean(r.is_virtual)}))
  };
  stats.total=stats.likes+stats.conversations+stats.connections+stats.messages;
  return stats;
}

function smartDigestBody(stats={},english=false,preview=false) {
  const rows=[];
  const item=(emoji,count,es,en)=>{ if(Number(count)>0) rows.push(`<div style="padding:9px 0;border-bottom:1px solid #292d3a"><b style="color:#fff">${emoji} ${Number(count)} ${english?en:es}</b></div>`); };
  item('❤',stats.likes,'Me gusta','likes');
  item('💬',stats.conversations,'comentarios, menciones o publicaciones compartidas','comments, mentions or shares');
  item('👤',stats.connections,'novedades de seguidores o amistades','follower or friendship updates');
  item('✉',stats.messages,'mensajes sin leer','unread messages');
  if(!rows.length && preview) rows.push(`<div style="padding:9px 0"><b style="color:#fff">✓ ${english?'Your smart summary is ready':'Tu resumen inteligente está preparado'}</b></div>`);
  const actors=(stats.actors||[]).filter(a=>a.name).slice(0,3);
  const actorText=actors.length
    ? `<p style="margin-top:16px">${english?'Recent activity includes':'Entre la actividad reciente aparecen'}: ${actors.map(a=>`<b style="color:#fff">${seoEscapeHtml(a.name)}</b>${a.is_virtual?` <span style="color:#a98cff">(${english?'virtual profile':'perfil virtual'})</span>`:''}`).join(', ')}.</p>`
    : '';
  return `<p>${english?'Here is what happened while you were away. We group activity so your inbox stays useful.':'Esto es lo que ha pasado mientras no estabas. Agrupamos la actividad para que tu bandeja de entrada siga siendo útil.'}</p><div style="margin:16px 0">${rows.join('')}</div>${actorText}`;
}

async function sendSmartDigestEmailForUser(user,{preview=false}={}) {
  if(!emailConfigured() || !user?.id || !user.email || !user.email_verified_at || user.is_virtual) return {sent:false,reason:'ineligible'};
  if(!preview && smartEmailRecipientRecentlyActive(user)) return {sent:false,reason:'active'};
  const stats=await smartDigestStats(Number(user.id));
  // Un único mensaje privado sí merece un recordatorio; para el resto esperamos varias novedades.
  if(!preview && stats.total<2 && stats.messages<1) return {sent:false,reason:'not_enough_activity',stats};
  const english=String(user.preferred_language||'').toLowerCase()==='en';
  const total=Math.max(0,Number(stats.total||0));
  const activityUrl=`${APP_URL}/?view=notifications`;
  const title=preview
    ? (english?'Smart email test':'Prueba de email inteligente')
    : (english?`${total} updates waiting for you`:`Tienes ${total} novedades`);
  const subject=preview
    ? (english?'Your smart emails are ready · Instant Admirers':'Tus emails inteligentes están listos · Instant Admirers')
    : (english?`You have ${total} updates · Instant Admirers`:`Tienes ${total} novedades · Instant Admirers`);
  const sent=await sendEmail({
    to:user.email,
    subject,
    text:preview
      ? (english?`Your smart email setup is working.\n\n${activityUrl}`:`Tu configuración de emails inteligentes funciona correctamente.\n\n${activityUrl}`)
      : (english?`You have ${total} pending updates on Instant Admirers.\n\n${activityUrl}`:`Tienes ${total} novedades pendientes en Instant Admirers.\n\n${activityUrl}`),
    html:emailShell({
      lang:english?'en':'es',title,body:smartDigestBody(stats,english,preview),
      buttonText:english?'View activity':'Ver actividad',buttonUrl:activityUrl,
      footer:english?'Smart summaries are sent only after you have been away for a while. You can turn them off in Account settings.':'Los resúmenes inteligentes solo se envían cuando llevas un tiempo sin entrar. Puedes desactivarlos en Ajustes de cuenta.'
    })
  });
  return {sent:Boolean(sent),stats};
}

async function discoverableActivityCount(user) {
  const since=user.last_seen_at || user.created_at || new Date(Date.now()-30*86400000).toISOString();
  const {rows}=await pool.query(`
    SELECT COUNT(*)::int AS count
      FROM users candidate
     WHERE candidate.id<>$1 AND candidate.account_status='active'
       AND COALESCE(candidate.social_hidden,FALSE)=FALSE
       AND (candidate.created_at>$2::timestamptz OR candidate.last_seen_at>$2::timestamptz)
       AND NOT EXISTS(
         SELECT 1 FROM blocks bl
          WHERE (bl.blocker_id=$1 AND bl.blocked_id=candidate.id) OR (bl.blocker_id=candidate.id AND bl.blocked_id=$1)
       )
  `,[Number(user.id),since]);
  return Number(rows[0]?.count||0);
}

async function sendRecoveryEmailForUser(user) {
  if(!emailConfigured() || !user?.id || !user.email || !user.email_verified_at || user.is_virtual || user.email_recovery_notifications!==true) return {sent:false,reason:'ineligible'};
  if(smartEmailRecipientRecentlyActive(user)) return {sent:false,reason:'active'};
  const count=await discoverableActivityCount(user);
  if(count<1) return {sent:false,reason:'no_new_activity'};
  const english=String(user.preferred_language||'').toLowerCase()==='en';
  const discoverUrl=`${APP_URL}/?view=discover`;
  const shown=Math.min(99,count);
  const title=english?'See what is new on Instant Admirers':'Descubre qué hay de nuevo';
  const body=english
    ? `<p>There ${shown===1?'is':'are'} <b style="color:#fff">${shown}${count>99?'+':''}</b> ${shown===1?'profile':'profiles'} with new or recent activity since your last visit.</p><p>Open Discover when you feel like coming back.</p>`
    : `<p>Hay <b style="color:#fff">${shown}${count>99?'+':''}</b> ${shown===1?'perfil con actividad nueva o reciente':'perfiles con actividad nueva o reciente'} desde tu última visita.</p><p>Cuando te apetezca volver, los encontrarás en Descubrir.</p>`;
  const sent=await sendEmail({
    to:user.email,
    subject:english?'There is something new to discover · Instant Admirers':'Hay novedades por descubrir · Instant Admirers',
    text:english?`There is new activity to discover on Instant Admirers.\n\n${discoverUrl}`:`Hay nueva actividad por descubrir en Instant Admirers.\n\n${discoverUrl}`,
    html:emailShell({lang:english?'en':'es',title,body,buttonText:english?'Open Discover':'Abrir Descubrir',buttonUrl:discoverUrl,footer:english?'You enabled return reminders in Account settings. You can turn them off at any time.':'Has activado los recordatorios para volver en Ajustes de cuenta. Puedes desactivarlos cuando quieras.'})
  });
  return {sent:Boolean(sent),count};
}

async function runSmartEmailCycle({limit=40}={}) {
  if(!emailConfigured() || smartEmailCycleRunning) return {ok:false,reason:smartEmailCycleRunning?'running':'email_not_configured'};
  smartEmailCycleRunning=true;
  let digests=0,recoveries=0,errors=0;
  try{
    const digestCandidates=await pool.query(`
      SELECT id,email,username,name,preferred_language,email_verified_at,is_virtual,last_seen_at,created_at
        FROM users
       WHERE account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE AND COALESCE(is_virtual,FALSE)=FALSE
         AND email IS NOT NULL AND email_verified_at IS NOT NULL
         AND email_social_notifications IS TRUE AND email_smart_digest_notifications IS TRUE
         AND COALESCE(last_seen_at,created_at)<=NOW()-($1::int * INTERVAL '1 hour')
       ORDER BY COALESCE(last_seen_at,created_at) ASC
       LIMIT $2
    `,[Math.floor(SMART_EMAIL_DIGEST_AFTER_HOURS),Math.max(1,Math.min(100,Number(limit)||40))]);
    for(const user of digestCandidates.rows){
      try{
        if(smartEmailRecipientRecentlyActive(user)) continue;
        if(await smartEmailSentRecently(user.id,'digest',SMART_EMAIL_DIGEST_COOLDOWN_HOURS*60)) continue;
        const result=await sendSmartDigestEmailForUser(user);
        if(result.sent){
          digests+=1;
          await logSmartEmailDelivery(user.id,'digest',{total:result.stats?.total||0,likes:result.stats?.likes||0,conversations:result.stats?.conversations||0,connections:result.stats?.connections||0,messages:result.stats?.messages||0});
        }
      }catch(err){errors+=1;console.error('smart digest:',err.message);}
    }

    const recoveryCandidates=await pool.query(`
      SELECT id,email,username,name,preferred_language,email_verified_at,is_virtual,last_seen_at,created_at,email_recovery_notifications
        FROM users
       WHERE account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE AND COALESCE(is_virtual,FALSE)=FALSE
         AND email IS NOT NULL AND email_verified_at IS NOT NULL
         AND email_social_notifications IS TRUE AND email_recovery_notifications IS TRUE
         AND COALESCE(last_seen_at,created_at)<=NOW()-($1::int * INTERVAL '1 day')
       ORDER BY COALESCE(last_seen_at,created_at) ASC
       LIMIT $2
    `,[Math.floor(SMART_EMAIL_RECOVERY_AFTER_DAYS),Math.max(1,Math.min(50,Math.ceil((Number(limit)||40)/2)))]);
    for(const user of recoveryCandidates.rows){
      try{
        if(smartEmailRecipientRecentlyActive(user)) continue;
        if(await smartEmailSentRecently(user.id,'recovery',SMART_EMAIL_RECOVERY_COOLDOWN_DAYS*24*60)) continue;
        if(await smartEmailSentRecently(user.id,'digest',24*60)) continue;
        const result=await sendRecoveryEmailForUser(user);
        if(result.sent){recoveries+=1;await logSmartEmailDelivery(user.id,'recovery',{discoverable:result.count||0});}
      }catch(err){errors+=1;console.error('recovery email:',err.message);}
    }
    return {ok:true,digests,recoveries,errors};
  }finally{smartEmailCycleRunning=false;}
}

function dispatchVirtualSocialNotification(payload={}) {
  const userId=Number(payload.userId);
  if(Number.isSafeInteger(userId) && userId>0) {
    io.to(`user:${userId}`).emit('notification:new', {
      id: payload.id ? Number(payload.id) : null,
      type: String(payload.type||''),
      actorId: payload.actorId ? Number(payload.actorId) : null,
      postId: payload.postId ? Number(payload.postId) : null,
      commentId: payload.commentId ? Number(payload.commentId) : null,
      text: String(payload.text||'')
    });
  }
  queueSocialNotificationEmail(payload);
}

if (REQUIRE_EMAIL_VERIFICATION && !emailConfigured()) {
  throw new Error('REQUIRE_EMAIL_VERIFICATION=true requiere configurar RESEND_API_KEY y EMAIL_FROM.');
}

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_VIRTUAL_PACK_UPLOAD_BYTES = 100 * 1024 * 1024;

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

const virtualPackUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIRTUAL_PACK_UPLOAD_BYTES, files:1 },
  fileFilter: (_req, file, cb) => {
    const name=String(file.originalname||'').toLowerCase();
    const mime=String(file.mimetype||'').toLowerCase();
    if(name.endsWith('.zip') || mime==='application/zip' || mime==='application/x-zip-compressed' || mime==='application/octet-stream') return cb(null,true);
    cb(new Error('Selecciona un archivo ZIP con los packs realistas.'));
  }
});

// V1.12.42 · ZIP masivo en disco temporal. Evita cargar cientos de MB en RAM.
const VIRTUAL_MASS_IMPORT_TMP = path.join(os.tmpdir(),'instant-admirers-mass-import');
fs.mkdirSync(VIRTUAL_MASS_IMPORT_TMP,{recursive:true});
const requestedVirtualMassZipMb = Number(process.env.MAX_VIRTUAL_MASS_ZIP_MB || 900);
const MAX_VIRTUAL_MASS_ZIP_MB = Number.isFinite(requestedVirtualMassZipMb) ? Math.min(1500,Math.max(100,requestedVirtualMassZipMb)) : 900;
const MAX_VIRTUAL_MASS_ZIP_BYTES = MAX_VIRTUAL_MASS_ZIP_MB * 1024 * 1024;
const virtualMassUpload = multer({
  storage: multer.diskStorage({
    destination: (_req,_file,cb)=>cb(null,VIRTUAL_MASS_IMPORT_TMP),
    filename: (_req,file,cb)=>cb(null,`${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${String(file.originalname||'virtual-media.zip').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-120)}`)
  }),
  limits:{fileSize:MAX_VIRTUAL_MASS_ZIP_BYTES,files:1},
  fileFilter:(_req,file,cb)=>{
    const name=String(file.originalname||'').toLowerCase();
    const mime=String(file.mimetype||'').toLowerCase();
    if(name.endsWith('.zip') || mime==='application/zip' || mime==='application/x-zip-compressed' || mime==='application/octet-stream') return cb(null,true);
    cb(new Error('Selecciona un ZIP para la importación masiva.'));
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
  // V1.12.30: conserva retirados los perfiles virtuales sin convertirlos en
  // cuentas técnicas. Antes social_hidden se recalculaba solo por rol/email.
  await pool.query(`
    UPDATE users u
       SET social_hidden=(
         u.role='admin'
         OR LOWER(u.email)=ANY($1::text[])
         OR (COALESCE(u.is_virtual,FALSE)=TRUE AND EXISTS(
           SELECT 1 FROM virtual_profiles vp WHERE vp.user_id=u.id AND vp.status='retired'
         ))
       )
     WHERE u.social_hidden IS DISTINCT FROM (
       u.role='admin'
       OR LOWER(u.email)=ANY($1::text[])
       OR (COALESCE(u.is_virtual,FALSE)=TRUE AND EXISTS(
         SELECT 1 FROM virtual_profiles vp WHERE vp.user_id=u.id AND vp.status='retired'
       ))
     )
  `,[emails]);

  // La limpieza destructiva de relaciones pertenece SOLO a cuentas técnicas.
  // Un anfitrión retirado conserva conversaciones, follows y demás historial.
  const {rows}=await pool.query(`SELECT id FROM users WHERE role='admin' OR LOWER(email)=ANY($1::text[])`,[emails]);
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

function virtualProfileIndexFromUsername(username='') {
  const m=String(username||'').match(/([0-9]+)$/);
  return m ? Number(m[1]) : 0;
}

async function resolveVirtualProfileDisplayCover(profile, db=pool) {
  if(!profile || !profile.is_virtual) return String(profile?.cover || '');
  const idx=virtualProfileIndexFromUsername(profile.username);

  // V1.12.30: los lotes 32-41 y 52-100 se generaron con una composición
  // de portada que ya contiene un fondo ampliado/desenfocado y una imagen
  // centrada. No es un problema de CSS: está dentro del propio JPG.
  // En esos lotes usamos el avatar realista (archivo limpio) como cabecera,
  // dejando que .profile-cover > img { object-fit:cover } haga el recorte.
  // Los lotes 02-31 y 42-51 conservan su portada importada porque no presentan
  // ese defecto de composición.
  const affected=(idx>=32 && idx<=41) || (idx>=52 && idx<=100);
  if(!affected) return String(profile.cover || '');

  const avatar=String(profile.avatar || '').trim();
  if(avatar) return avatar;

  const {rows}=await db.query(`
    SELECT '/media/'||vpm.media_id::text AS cover
      FROM virtual_profile_media vpm
      JOIN media m ON m.id=vpm.media_id
     WHERE vpm.user_id=$1
       AND vpm.active=TRUE
       AND vpm.archived_at IS NULL
       AND vpm.kind='avatar'
       AND COALESCE(m.provider_meta->>'realistic_pack','false')='true'
     ORDER BY vpm.id DESC
     LIMIT 1
  `,[profile.id]);
  return String(rows[0]?.cover || profile.cover || '');
}

async function hydrateVirtualProfileDisplayCover(profile, db=pool) {
  if(!profile) return profile;
  profile.cover=await resolveVirtualProfileDisplayCover(profile,db);
  return profile;
}

async function repairLegacyVirtualCoverFrames() {
  // V1.12.30: corrige también los datos persistidos para cualquier vista que
  // no pase por el hidratador. Solo toca los lotes realmente afectados.
  const {rows}=await pool.query(`
    UPDATE users u
       SET cover=u.avatar
     WHERE COALESCE(u.is_virtual,FALSE)=TRUE
       AND COALESCE(u.avatar,'')<>''
       AND substring(u.username FROM '([0-9]+)$') IS NOT NULL
       AND (
         substring(u.username FROM '([0-9]+)$')::int BETWEEN 32 AND 41
         OR substring(u.username FROM '([0-9]+)$')::int BETWEEN 52 AND 100
       )
       AND COALESCE(u.cover,'') IS DISTINCT FROM COALESCE(u.avatar,'')
    RETURNING u.id,u.username,u.cover
  `);
  if(rows.length) console.log(`V1.12.30: normalizadas ${rows.length} portada(s) virtuales afectadas usando avatar limpio.`);
  return rows.length;
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

function adDisplayUrl(row, mobile=false, ttlSeconds=3600) {
  const asset = uploadedAdAsset(row,mobile);
  if (asset.provider === 'bunny_storage' && asset.provider_id) {
    return remoteDeliveryUrl({ ...asset, secure_url: mobile ? row?.mobile_image_url : row?.image_url }, ttlSeconds) || '';
  }
  return String(mobile ? (row?.mobile_image_url || '') : (row?.image_url || ''));
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
    is_virtual: Boolean(row.is_virtual),
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
    user.public_profile_preview_enabled = Boolean(row.public_profile_preview_enabled);
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

function adminMediaPreviewSignature(mediaId, adminId, expiresAt) {
  return crypto.createHmac('sha256', JWT_SECRET)
    .update(`admin-preview.${Number(mediaId)}.${Number(adminId)}.${Number(expiresAt)}`)
    .digest('base64url');
}

function adminMediaPreviewUrl(mediaId, adminId) {
  if (!mediaId || !adminId) return '';
  const expiresAt = Math.floor(Date.now() / 1000) + Math.min(1800, MEDIA_URL_TTL_SECONDS);
  const sig = adminMediaPreviewSignature(mediaId, adminId, expiresAt);
  return `/admin-media-preview/${Number(mediaId)}?uid=${Number(adminId)}&exp=${expiresAt}&sig=${encodeURIComponent(sig)}`;
}

function verifyAdminMediaPreviewRequest(req) {
  const mediaId = Number(req.params.id);
  const adminId = Number(req.query.uid);
  const expiresAt = Number(req.query.exp);
  const sig = String(req.query.sig || '');
  if (!Number.isSafeInteger(mediaId) || mediaId <= 0 || !Number.isSafeInteger(adminId) || adminId <= 0 || !Number.isSafeInteger(expiresAt) || !sig) return null;
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt < now || expiresAt > now + 2 * 60 * 60) return null;
  const expected = adminMediaPreviewSignature(mediaId, adminId, expiresAt);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { mediaId, adminId };
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

async function messageAccessState(senderId, recipientId, client = pool) {
  const blocked = await blockState(senderId, recipientId, client);
  if (blocked.iBlocked || blocked.blockedMe) return { allowed:false, code:'INTERACTION_BLOCKED', reason:'blocked' };

  const { rows } = await client.query(`
    SELECT message_policy, friend_gate_enabled
      FROM users
     WHERE id=$1 AND account_status='active'
     LIMIT 1
  `,[recipientId]);
  const recipient = rows[0];
  if (!recipient) return { allowed:false, code:'USER_UNAVAILABLE', reason:'unavailable' };

  // El reto de acceso también protege el chat: un fan no puede escribir al
  // perfil protegido hasta completar el reto (o ser ya amigo).
  if (recipient.friend_gate_enabled) {
    const [a,b] = friendshipPair(senderId,recipientId);
    const friendship = await client.query(
      'SELECT 1 FROM friendships WHERE user1_id=$1 AND user2_id=$2 LIMIT 1',
      [a,b]
    );
    if (!friendship.rowCount) {
      const gate = await friendGateProgress(senderId,recipientId,client);
      if (gate?.enabled && !gate.unlocked) {
        return {
          allowed:false,
          code:'FRIEND_GATE_CHAT_LOCKED',
          reason:'challenge',
          friend_gate:gate
        };
      }
    }
  }

  const policy = recipient.message_policy || 'everyone';
  if (policy === 'everyone') return { allowed:true, reason:'policy' };
  if (policy === 'followers') {
    const q = await client.query(
      'SELECT 1 FROM follows WHERE follower_id=$1 AND followed_id=$2 LIMIT 1',
      [senderId,recipientId]
    );
    if (q.rowCount) return { allowed:true, reason:'policy' };
  } else if (policy === 'friends') {
    const [a,b] = friendshipPair(senderId,recipientId);
    const q = await client.query(
      'SELECT 1 FROM friendships WHERE user1_id=$1 AND user2_id=$2 LIMIT 1',
      [a,b]
    );
    if (q.rowCount) return { allowed:true, reason:'policy' };
  } else if (policy !== 'nobody') {
    return { allowed:false, code:'MESSAGE_POLICY_BLOCKED', reason:'policy' };
  }

  // Si el destinatario ya escribió antes en esta conversación, se considera
  // que abrió el canal y permitimos responderle. Esto evita conversaciones
  // unidireccionales en las que alguien puede escribir pero no recibir respuesta.
  // El reto de acceso se evalúa arriba y siempre tiene prioridad.
  const reply = await client.query(`
    SELECT 1
      FROM conversations c
      JOIN messages m ON m.conversation_id=c.id
     WHERE ((c.user1_id=$1 AND c.user2_id=$2) OR (c.user1_id=$2 AND c.user2_id=$1))
       AND m.sender_id=$2
     LIMIT 1
  `,[senderId,recipientId]);
  if (reply.rowCount) return { allowed:true, reason:'reply' };

  return { allowed:false, code:'MESSAGE_POLICY_BLOCKED', reason:'policy' };
}

async function canMessageUser(senderId, recipientId, client = pool) {
  return Boolean((await messageAccessState(senderId, recipientId, client)).allowed);
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
       AND NOT EXISTS (SELECT 1 FROM virtual_profile_media vpm WHERE vpm.media_id=m.id)
       AND NOT EXISTS (SELECT 1 FROM users u WHERE u.avatar=$2 OR u.cover=$2)
  `, [mediaId, localUrl]);
  const item = rows[0];
  if (!item) return false;
  await pool.query('DELETE FROM media WHERE id=$1', [mediaId]);
  if (['cloudinary','bunny_storage','bunny_stream'].includes(String(item.provider || ''))) await destroyRemoteAsset(item);
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
  if (isAdminRecord(socket.user)) socket.join('admins');
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
    SELECT m.id,m.user_id,m.provider,m.provider_status,u.friend_gate_enabled,u.content_watermark_mode
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
    const streaming = String(m.provider || '') === 'bunny_stream';
    const processing = streaming && String(m.provider_status || '') !== 'ready';
    return {
      ...item,
      media_url: processing ? '' : protectedMediaUrl(item.media_id, viewerId),
      media_protected: true,
      media_provider: String(m.provider || ''),
      media_streaming: streaming,
      media_processing: processing,
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
           u.username,u.name,u.avatar,u.is_virtual,u.friend_gate_enabled,u.content_watermark_mode,pm.provider AS media_provider,pm.provider_status AS media_provider_status,
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
      LEFT JOIN media pm ON pm.id=p.media_id
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
      media_url:original.media_id && !(String(original.media_provider || '')==='bunny_stream' && String(original.media_provider_status || '')!=='ready') ? protectedMediaUrl(original.media_id,userId) : '',
      media_protected:Boolean(original.media_id),
      media_provider:String(original.media_provider || ''),
      media_streaming:String(original.media_provider || '')==='bunny_stream',
      media_processing:String(original.media_provider || '')==='bunny_stream' && String(original.media_provider_status || '')!=='ready',
      watermarked:Boolean(original.media_id) && Number(original.user_id)!==Number(userId) && (String(original.content_watermark_mode||'exclusive')==='all' || (String(original.content_watermark_mode||'exclusive')==='exclusive' && Boolean(original.friend_gate_enabled))),
      visibility:original.visibility, created_at:original.created_at, edited_at:original.edited_at,
      username:original.username, name:original.name, avatar:original.avatar || '', is_virtual:Boolean(original.is_virtual)
    }};
  });
}

function extractMentions(text = '') {
  const matches = String(text).match(/(^|\s)@([a-zA-Z0-9_.]{3,30})/g) || [];
  return [...new Set(matches.map(x => x.trim().slice(1).toLowerCase()))].slice(0, 20);
}

async function notifyMentions(client, { text, actorId, postId = null, commentId = null }) {
  const usernames = extractMentions(text);
  if (!usernames.length) return;
  const { rows } = await client.query(
    'SELECT id,username FROM users WHERE LOWER(username) = ANY($1::text[]) AND COALESCE(social_hidden,FALSE)=FALSE',
    [usernames]
  );
  for (const user of rows) {
    if (Number(user.id) === Number(actorId)) continue;
    await addNotification(client, { userId:user.id, actorId, type:'mention', postId, commentId, text:String(text || '').slice(0,220) });
  }
}

async function postQuery(userId, { mode = 'following', profileId = null, postId = null, search = '', limit = 60, cursor = null, paged = false } = {}) {
  const params = [userId];
  const clauses = [];

  if (mode === 'following') {
    clauses.push(`(p.user_id = $1 OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followed_id = p.user_id))`);
  }
  if (profileId) {
    params.push(profileId);
    clauses.push(`p.user_id = $${params.length}`);
  }
  if (postId) {
    params.push(Number(postId));
    clauses.push(`p.id = $${params.length}`);
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
  if (!profileId && mode !== 'activity') clauses.push(`NOT EXISTS (SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=p.user_id)`);
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
        u.username, u.name, u.avatar, u.is_virtual
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

async function addNotification(client, { userId, actorId, type, postId = null, commentId = null, text = '' }) {
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
    INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id, text)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, created_at
  `, [userId, actorId, type, postId, commentId, String(text || '').slice(0, 500)]);
  io.to(`user:${userId}`).emit('notification:new', { id: rows[0]?.id, type, actorId: Number(actorId), postId: postId ? Number(postId) : null, commentId: commentId ? Number(commentId) : null, text });
  queueSocialNotificationEmail({userId,actorId,type,postId,commentId,text});
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

function discoverContentReason(row = {}) {
  const location=String(row.author_location || '').trim();
  if (Number(row.interest_match || 0) > 0) return 'Coincide con tus intereses';
  if (row.same_location && location) return `De alguien de ${location}`;
  if (Number(row.affinity_score || 0) >= 8) return 'Relacionado con lo que te gusta';
  if (row.mutual_signal) return 'Tu red conecta con este perfil';
  if (row.following_author) return 'De alguien que sigues';
  if ((Number(row.real_likes_count || 0) + Number(row.real_comments_count || 0)) >= 4) return 'Con conversación reciente';
  if (Number(row.age_hours || 999) <= 18) return 'Publicado hace poco';
  return 'Para descubrir';
}

function peopleRecommendationReason(row = {}) {
  if (Number(row.shared_interest || 0) > 0) return 'Tenéis intereses en común';
  if (Number(row.mutual_count || 0) > 0) return `${Number(row.mutual_count)} conexión${Number(row.mutual_count) === 1 ? '' : 'es'} en común`;
  if (Number(row.interaction_score || 0) > 0) return 'Has interactuado con su contenido';
  if (Number(row.followers_count || 0) > 0) return 'Activo en la comunidad';
  return 'Nuevo en Instant Admirers';
}

// V1.12.39.1 · Descubrir 2.0 + Balance Hotfix.
function discoveryPeopleReason(row = {}, mode = 'for_you') {
  const shared=Number(row.shared_interest_count || 0);
  const mutual=Number(row.mutual_count || 0);
  const sameLocation=Boolean(row.same_location);
  const online=Boolean(row.online);
  const activityAt=row.activity_at ? new Date(row.activity_at).getTime() : 0;
  const createdAt=row.created_at ? new Date(row.created_at).getTime() : 0;
  const now=Date.now();
  const activeHours=activityAt ? Math.max(0,(now-activityAt)/3600000) : 99999;
  const accountDays=createdAt ? Math.max(0,(now-createdAt)/86400000) : 99999;
  const location=String(row.location || '').trim();

  if (mode === 'local' && sameLocation && location) return `También está en ${location}`;
  if (mode === 'active' && online) return 'Activo ahora';
  if (mode === 'active' && activeHours <= 24) return 'Actividad reciente';
  if (mode === 'new' && accountDays <= 30) return 'Se ha unido hace poco';
  if (shared > 0) return shared === 1 ? 'Tenéis un interés en común' : `Tenéis ${shared} intereses en común`;
  if (sameLocation && location) return `También está en ${location}`;
  if (mutual > 0) return `${mutual} conexión${mutual === 1 ? '' : 'es'} en común`;
  if (Number(row.interaction_score || 0) > 0) return 'Has interactuado con su contenido';
  if (online) return 'Activo ahora';
  if (activeHours <= 24) return 'Activo hoy';
  if (accountDays <= 30) return 'Nuevo en Instant Admirers';
  return 'Sugerido para ti';
}

function discoveryPeopleBadges(row = {}) {
  const badges=[];
  const location=String(row.location || '').trim();
  const shared=Number(row.shared_interest_count || 0);
  const mutual=Number(row.mutual_count || 0);
  const activityAt=row.activity_at ? new Date(row.activity_at).getTime() : 0;
  const activeHours=activityAt ? Math.max(0,(Date.now()-activityAt)/3600000) : 99999;
  if (row.online) badges.push({ kind:'online', label:'Ahora' });
  else if (activeHours <= 24) badges.push({ kind:'active', label:'Activo hoy' });
  if (row.same_location && location) badges.push({ kind:'location', label:location.slice(0,28) });
  if (shared > 0) badges.push({ kind:'interest', label:`${shared} interés${shared===1?'':'es'}` });
  else if (mutual > 0) badges.push({ kind:'mutual', label:`${mutual} en común` });
  return badges.slice(0,2);
}

function discoveryRowComparator(mode = 'for_you') {
  return (a,b) => {
    if (mode === 'active') {
      const onlineDelta=Number(Boolean(b.online))-Number(Boolean(a.online));
      if (onlineDelta) return onlineDelta;
      const activeDelta=new Date(b.activity_at||0)-new Date(a.activity_at||0);
      if (activeDelta) return activeDelta;
    }
    if (mode === 'new') {
      const createdDelta=new Date(b.created_at||0)-new Date(a.created_at||0);
      if (createdDelta) return createdDelta;
    }
    const scoreDelta=Number(b.recommendation_score||0)-Number(a.recommendation_score||0);
    if (scoreDelta) return scoreDelta;
    return Number(b.id||0)-Number(a.id||0);
  };
}

// V1.12.39.1 · Balance adaptativo: las cuentas reales válidas tienen prioridad,
// pero las virtuales completan el carrusel cuando la comunidad real aún es pequeña.
function diversifyDiscoveryPeople(rows = [], limit = 10, mode = 'for_you') {
  const now=Date.now();
  const activeCutoff=7*24*3600000;
  const eligible=rows.filter(row => {
    if (mode !== 'active') return true;
    if (row.online) return true;
    const at=row.activity_at ? new Date(row.activity_at).getTime() : 0;
    return at > 0 && (now-at) <= activeCutoff;
  });
  const compare=discoveryRowComparator(mode);
  const real=eligible.filter(r=>!r.is_virtual).sort(compare);
  const virtual=eligible.filter(r=>Boolean(r.is_virtual)).sort(compare);
  const selected=[];
  // No se reserva una cuota fija: si hay pocos reales se muestran todos y se
  // completa con virtuales; si crece la comunidad real, los reales ocupan más huecos.
  selected.push(...real.slice(0,limit));
  if (selected.length < limit) selected.push(...virtual.slice(0,limit-selected.length));
  return selected;
}

async function recordDiscoveryImpressions(viewerId, targetIds = []) {
  const ids=[...new Set(targetIds.map(Number).filter(Number.isSafeInteger))];
  if (!ids.length) return;
  await pool.query(`
    INSERT INTO discovery_profile_impressions(viewer_id,target_id,shown_count,first_shown_at,last_shown_at)
    SELECT $1, target_id, 1, NOW(), NOW() FROM unnest($2::bigint[]) AS target_id
    ON CONFLICT (viewer_id,target_id) DO UPDATE SET
      shown_count=discovery_profile_impressions.shown_count+1,
      last_shown_at=NOW()
  `,[viewerId,ids]);
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
  res.json({ ok: true, version: '1.12.42', database: 'postgresql', mode: 'own-community', email: { configured: emailConfigured(), provider: EMAIL_PROVIDER, verification_required: REQUIRE_EMAIL_VERIFICATION }, media: mediaProviderSummary(), features: ['stories','reels','messages','friends','realtime','replies','private-sharing','mentions','hashtags','reposts','post-editing','advanced-profiles','for-you','people-suggestions','personalized-discovery','private-accounts','follow-requests','blocking','muting','reports','message-privacy','onboarding','account-settings','password-change','account-deletion','admin-moderation','report-review','ux-quality','connection-status','optimistic-actions','instant-admirers-brand','pwa-assets','seo-metadata','legal-pages','18-plus-registration','terms-acceptance','mobile-profile-ux','mobile-logout','composer-media-ux','compact-mobile-auth','visual-polish','unified-ui','profile-visual-refresh','email-verification','password-recovery','email-change','rate-limits','security-events','resend-email','whatsapp-invites','referrals','friend-access-gates','dual-invite-flows','direct-profile-invites','profile-access-locks','pretty-profile-urls','shareable-profile-links','compact-access-gate','mobile-auth-personality','mobile-auth-final-polish','direct-profile-auth-return','validated-profile-routes','profile-return-no-fallback','profile-image-live-preview','external-media-storage','cloudinary-media','legacy-media-migration','media-cleanup','large-video-uploads','upload-error-recovery','mobile-camera-capture','feed-pagination','profile-pagination','discover-pagination','reels-pagination','bookmarks-pagination','infinite-scroll','lazy-video-loading','viewport-video-pause','cloudinary-auto-image-optimization','performance-indexes','rightbar-cache','static-asset-cache','pwa-installable','service-worker','offline-launch','install-prompt','maskable-icons','standalone-app','controlled-launch','registration-modes','launch-dashboard','activation-checklist','operational-metrics','client-error-reporting','server-error-log','demo-lab','synthetic-test-data','demo-cleanup','launch-readiness','launch-phases','launch-cohort','launch-banner','launch-invite-link','launch-settings-type-fix','community-warm-start','newcomer-spotlight','founding-cohort','community-launch-dashboard','growth-engine','campaign-links','campaign-attribution','growth-funnel','viral-referral-tracking','enhanced-access-challenge','admin-user-management','admin-user-deletion','follow-lists','clickable-profile-stats','connections-hub','following-in-friends','profile-stat-links-fix','pwa-auto-refresh','advertising-management','image-ads','google-adsense-code','ad-scheduling','ad-profile-targeting','ad-impressions-clicks','ad-visible-copy','system-admin-account','social-admin-exclusion','bilingual-ui','spanish-english','browser-language-detection','saved-language-preference','bilingual-legal-pages','bilingual-ad-copy','protected-profile-content','gate-aware-discovery','signed-media-delivery','session-bound-media','protected-media-proxy','legacy-cloudinary-read-compatibility','viewer-watermarks','download-deterrence','enhanced-contextmenu-deterrence','resilient-media-streaming','media-upstream-error-isolation','profile-access-message','compact-direct-profile-auth','campaign-access-message','growth-source-attribution','growth-utm-tracking','growth-visit-details','growth-profile-preview','growth-auth-profile-preview','seo-40-landings','seo-city-pages','seo-guides','sitemap-index','seo-internal-linking','bunny-storage-images','bunny-stream-video','bunny-token-delivery','hls-playback','adaptive-video-startup-quality','network-aware-hls-startup','bunny-stream-status-polling','cloudinary-legacy-compatibility','cloudinary-upload-disabled-by-default','growth-public-teaser-profile','growth-teaser-media-lock','growth-teaser-signup-attribution','public-teaser-desktop-layout-fix','feed-full-image-fit','full-image-viewer','protected-image-lightbox','friend-gate-chat-lock','conversation-reply-continuity','chat-video-processing-refresh','chat-scroll-containment','chat-bottom-autoscroll','mobile-chat-composer-layout','mobile-chat-composer-viewport-fix','mobile-chat-active-header-compaction','direct-public-profile','direct-profile-media-lock','direct-profile-referral-attribution','public-profile-preview-control','seo-public-profiles','dynamic-profile-meta','profilepage-structured-data','profile-sitemap','public-profiles-hub','seo-profile-privacy-noindex','seo-navigation-cache-safety','visitor-theme-switcher','light-theme','dark-theme','theme-preference-persistence','light-theme-contrast-fix','light-sent-message-contrast-fix','sent-message-delete','message-delete-realtime','virtual-community','virtual-host-profiles','virtual-daily-activity','virtual-admin-inbox','virtual-admin-reply','virtual-profile-media-pools','virtual-profile-disclosure','virtual-profile-seo','virtual-profile-sitemap','virtual-profile-public-hub','virtual-profile-seo-disclosure','virtual-profile-dynamic-meta','profile-seo-hydration-preservation','virtual-profile-image-library','virtual-profile-image-tags','virtual-profile-image-usage-history','virtual-profile-image-auto-selection','virtual-profile-image-admin','virtual-profile-image-batch-upload','virtual-profile-image-pilot','virtual-profile-base-packs','virtual-profile-pack-auto-sync','virtual-profile-pack-status','virtual-realistic-pack-importer','virtual-mass-media-import','virtual-mass-zip-staging','virtual-mass-auto-assignment','virtual-mass-username-folder-fix','virtual-mass-preview','virtual-mass-progress','virtual-mass-history','virtual-mass-atomic-commit','virtual-mass-rollback','virtual-visual-manager-2','virtual-visual-single-replace','virtual-visual-post-reorder','virtual-visual-duplicate-detection','virtual-visual-change-history','virtual-visual-last-change-rollback','virtual-quality-center','virtual-quality-broken-reference-scan','virtual-quality-duplicate-scan','virtual-quality-low-resolution-scan','virtual-quality-admin-filters','virtual-pack-zip-validation','virtual-pack-manifest-v1','virtual-pack-safe-replacement','virtual-pack-import-history','virtual-image-admin-preview-fix','virtual-profile-retire-fix','virtual-profile-cover-display-fix','virtual-profile-retire-transaction-fix','virtual-profile-cover-runtime-resolver','virtual-profile-cover-clean-avatar-fallback','virtual-profile-retire-failsafe','virtual-historical-post-media-relink','virtual-historical-story-media-relink','virtual-activity-2','virtual-activity-smart-schedule','virtual-activity-content-variety','virtual-activity-history','virtual-activity-weekend-mode','virtual-activity-text-photo-mix','virtual-interaction-2','virtual-interaction-smart-targeting','virtual-interaction-rate-limits','virtual-interaction-history','virtual-like-comment-follow','virtual-interaction-no-private-dm','virtual-interaction-ranking-safety','post-comment-previews','post-like-people','post-social-preview-batch','social-email-notifications','email-like-alerts','email-comment-alerts','email-connection-alerts','email-notification-preferences','virtual-interaction-email-alerts','activity-center-2','activity-grouped-likes','activity-unread-actions','activity-direct-targets','notification-comment-targets','virtual-notification-realtime','activity-person-like-grouping','activity-follower-grouping','activity-mobile-tools-scroll','activity-visual-polish','activity-count-labels','post-like-summary-spacing-fix','smart-email-digests','smart-email-inactive-recovery','social-email-online-suppression','social-email-rate-guard','smart-email-test','discover-2','discover-person-modes','discover-profile-rotation','discover-profile-dismissals','discover-location-mode','discover-content-diversity','discover-real-engagement-ranking','discover-adaptive-real-balance','discover-sidebar-dedupe','discover-carousel-controls','discover-mobile-density'] });
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
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE) AS members_total,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE AND created_at >= NOW()-INTERVAL '7 days') AS members_7d,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND p.visibility='public' AND p.created_at >= NOW()-INTERVAL '7 days') AS posts_7d,
      (SELECT COUNT(DISTINCT ae.user_id)::int FROM app_events ae JOIN users u ON u.id=ae.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND ae.event_type='session_active' AND ae.created_at >= NOW()-INTERVAL '7 days') AS active_7d
  `);
  const recentResult = settings.newcomer_spotlight_enabled ? await pool.query(`
    SELECT u.id,u.username,u.name,u.bio,u.avatar,u.location,u.headline,u.interests,u.created_at,u.last_seen_at,u.account_private,u.is_virtual,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.followed_id=u.id) AS following,
      EXISTS(SELECT 1 FROM follow_requests frq WHERE frq.follower_id=$1 AND frq.followed_id=u.id) AS follow_requested,
      (SELECT COUNT(*)::int FROM follows f WHERE f.followed_id=u.id) AS followers_count
    FROM users u
    WHERE u.id<>$1 AND u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND u.account_status='active' AND COALESCE(u.social_hidden,FALSE)=FALSE AND u.email_verified_at IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=u.id) OR (bl.blocker_id=u.id AND bl.blocked_id=$1))
      AND NOT EXISTS(SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=u.id)
    ORDER BY u.created_at DESC,u.id DESC LIMIT 8
  `,[req.user.id]) : {rows:[]};
  const rankResult = await pool.query(`
    SELECT cohort_rank FROM (
      SELECT id,ROW_NUMBER() OVER(ORDER BY created_at ASC,id ASC)::int AS cohort_rank
      FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE
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


// V1.12.4: visita anónima de campaña con atribución de procedencia. No guarda IP.
app.post('/api/growth/campaign/visit', asyncRoute(async (req,res) => {
  const campaign=await growthCampaignBySlug(req.body?.campaign || '');
  if(!campaign) return res.status(404).json({error:'Campaña no disponible'});
  const referrerHost=trackingReferrerHost(req.body?.referrer || req.get('referer') || '');
  const utmSource=compactTrackingValue(req.body?.utm_source,120).toLowerCase();
  const utmMedium=compactTrackingValue(req.body?.utm_medium,120).toLowerCase();
  const utmCampaign=compactTrackingValue(req.body?.utm_campaign,160).toLowerCase();
  const utmContent=compactTrackingValue(req.body?.utm_content,160);
  const visitorKey=compactTrackingValue(req.body?.visitor_key,80);
  const landingPath=compactTrackingValue(req.body?.landing_path || `/${campaign.target_username}`,500);
  const deviceType=growthDeviceType(req,req.body?.device_type || '');
  const source=normalizedTrafficSource({utmSource,referrerHost,campaignChannel:campaign.channel});
  const {rows}=await pool.query(`
    INSERT INTO growth_campaign_visits(campaign_id,visitor_key,source,referrer_host,utm_source,utm_medium,utm_campaign,utm_content,device_type,landing_path)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id,visited_at
  `,[campaign.id,visitorKey,source,referrerHost,utmSource,utmMedium,utmCampaign,utmContent,deviceType,landingPath]);
  await incrementGrowthDaily(campaign.id,'visits');
  res.json({ok:true,visit_id:rows[0]?.id || null,source,campaign:{slug:campaign.slug,name:campaign.name,channel:campaign.channel,target_username:campaign.target_username}});
}));

const RESERVED_PROFILE_SLUGS = new Set([
  'api','media','protected-media','assets','socket.io','legal','privacy','cookies','terms','community-guidelines','en','ciudades','guias','perfiles',
  'favicon.ico','manifest.webmanifest','sw.js','offline.html','robots.txt','sitemap.xml','sitemap-core.xml','sitemap-landings.xml','sitemap-profiles.xml','login','register','logout','admin',
  'feed','reels','discover','search','messages','notifications','bookmarks','friends','settings','profile',
  'invite','invites','help','support','about'
]);

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { username, name, email, password, age_confirmed, terms_accepted, terms_version, referral_code, referral_source, direct_profile_referrer, gate_code, campaign_code, campaign_visit_id, campaign_context, language } = req.body;
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
  let normalizedReferralSource = String(referral_source || '').trim().toLowerCase()==='direct_profile' ? 'direct_profile' : 'invite';
  const directReferrerUsername=String(direct_profile_referrer || '').trim().replace(/^@/,'').toLowerCase().slice(0,30);
  if(normalizedReferralSource==='direct_profile') {
    const directRef=await pool.query(`SELECT invite_code FROM users WHERE LOWER(username)=LOWER($1) AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE AND COALESCE(account_private,FALSE)=FALSE AND COALESCE(public_profile_preview_enabled,FALSE)=TRUE LIMIT 1`,[directReferrerUsername]);
    const validDirectCode=String(directRef.rows[0]?.invite_code || '').trim().toLowerCase();
    if(!validDirectCode || validDirectCode!==normalizedReferral) normalizedReferralSource='invite';
  }
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
        if(campaign){
          const visitId=Number(campaign_visit_id);
          let visit=null;
          if(Number.isInteger(visitId) && visitId>0){
            const visitResult=await client.query(`SELECT id,source,utm_source,utm_medium,utm_content FROM growth_campaign_visits WHERE id=$1 AND campaign_id=$2 LIMIT 1`,[visitId,campaign.id]);
            visit=visitResult.rows[0] || null;
          }
          const ctx=(campaign_context && typeof campaign_context==='object') ? campaign_context : {};
          const ctxReferrer=trackingReferrerHost(ctx.referrer || '');
          const ctxUtmSource=compactTrackingValue(ctx.utm_source,120).toLowerCase();
          const ctxUtmMedium=compactTrackingValue(ctx.utm_medium,120).toLowerCase();
          const ctxUtmContent=compactTrackingValue(ctx.utm_content,160);
          const attributedSource=visit?.source || normalizedTrafficSource({utmSource:ctxUtmSource,referrerHost:ctxReferrer,campaignChannel:campaign.channel});
          await client.query(`
            INSERT INTO growth_campaign_attributions(user_id,campaign_id,visit_id,source,utm_source,utm_medium,utm_content)
            VALUES($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (user_id) DO NOTHING
          `,[created.id,campaign.id,visit?.id || null,attributedSource,visit?.utm_source || ctxUtmSource,visit?.utm_medium || ctxUtmMedium,visit?.utm_content || ctxUtmContent || campaign.source_tag || '']);
        }
      }
      const ref = normalizedReferral;
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
          await client.query(`INSERT INTO referral_attributions(inviter_id,invited_user_id,gate_user_id,source) VALUES($1,$2,$3,$4) ON CONFLICT (invited_user_id) DO NOTHING`,[inviter.id,created.id,gateUserId,normalizedReferralSource]);
          if (gateUserId) await autoCompleteFriendGate(client,inviter.id,gateUserId);
        }
      }
      return created;
    });
    const emailSent = await sendVerificationEmail(user).catch(err => { console.error('verification email:', err.message); return false; });
    await securityEvent(req, 'account_registered', user.id, { email_sent:emailSent, referral:Boolean(normalizedReferral), referral_source:normalizedReferralSource, gate:Boolean(gate_code), campaign:Boolean(normalizedCampaign) });
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
      ) AS unread_messages,
      CASE WHEN u.role='admin' THEN (SELECT COUNT(*)::int FROM virtual_message_alerts WHERE replied_at IS NULL) ELSE 0 END AS virtual_inbox_unread
    FROM users u WHERE u.id = $1
  `, [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ ...safeUser(rows[0], true), followers_count: rows[0].followers_count, following_count: rows[0].following_count, posts_count: rows[0].posts_count, friends_count: rows[0].friends_count, friend_requests_count: rows[0].friend_requests_count, follow_requests_count: rows[0].follow_requests_count, blocked_count: rows[0].blocked_count, muted_count: rows[0].muted_count, unread_notifications: rows[0].unread_notifications, unread_messages: rows[0].unread_messages, virtual_inbox_unread: Number(rows[0].virtual_inbox_unread || 0), online: true, last_seen_at: rows[0].last_seen_at });
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
  const viewerRole=await pool.query('SELECT role FROM users WHERE id=$1',[viewerId]);
  if (viewerRole.rows[0]?.role === 'admin') return true;

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
           resource_type,delivery_type,format,provider_status,provider_meta
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
  if ((item.provider === 'bunny_storage' || item.provider === 'bunny_stream') && item.provider_id) {
    if (item.provider === 'bunny_stream' && String(item.provider_status || '') !== 'ready') {
      res.set('Retry-After','8');
      return res.status(425).end();
    }
    const ttl = String(cacheControl || '').includes('public')
      ? 3600
      : (item.provider === 'bunny_stream' ? MEDIA_URL_TTL_SECONDS : Math.min(900, MEDIA_URL_TTL_SECONDS));
    const target = remoteDeliveryUrl(item, ttl);
    if (!target) return res.status(503).end();
    res.set('Cache-Control','no-store');
    res.set('X-Robots-Tag','noindex, nofollow, noarchive');
    return res.redirect(302,target);
  }
  if (item.provider === 'cloudinary' && item.provider_id) return proxyCloudinaryMedia(req,res,item,cacheControl);
  if (item.provider === 'demo' && /^\/assets\/demo\/[a-z0-9._-]+$/i.test(String(item.secure_url || ''))) {
    const demoPath = path.join(publicDir, String(item.secure_url).replace(/^\//,''));
    res.set('Cache-Control',cacheControl);
    res.set('Content-Disposition','inline');
    res.set('X-Content-Type-Options','nosniff');
    res.set('Cross-Origin-Resource-Policy','same-origin');
    return res.sendFile(demoPath);
  }
  if (item.provider === 'virtual_local' && /^\/assets\/virtual\/(?:[a-z0-9._-]+\/)*[a-z0-9._-]+$/i.test(String(item.secure_url || ''))) {
    const virtualPath = path.join(publicDir, String(item.secure_url).replace(/^\//,''));
    res.set('Cache-Control',cacheControl);
    res.set('Content-Disposition','inline');
    res.set('X-Content-Type-Options','nosniff');
    res.set('Cross-Origin-Resource-Policy','same-origin');
    return res.sendFile(virtualPath);
  }
  if (item.data) return sendBufferWithRange(req,res,item,cacheControl);
  return res.status(404).end();
}

app.get('/admin-media-preview/:id', asyncRoute(async (req,res) => {
  const signed = verifyAdminMediaPreviewRequest(req);
  if (!signed) return res.status(404).end();
  const adminResult = await pool.query('SELECT id,email,role,account_status FROM users WHERE id=$1 LIMIT 1',[signed.adminId]);
  const adminUser = adminResult.rows[0];
  if (!adminUser || adminUser.account_status === 'suspended' || !isAdminRecord(adminUser)) return res.status(404).end();
  const item = await mediaRecord(signed.mediaId);
  if (!item) return res.status(404).end();
  res.set('X-Robots-Tag','noindex, nofollow, noarchive');
  res.set('Referrer-Policy','same-origin');
  return serveMedia(req,res,item,'private, no-store, max-age=0');
}));

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
  // Bunny puede aplicar Allowed Referrers. Conservamos solo el origen al saltar al CDN;
  // no exponemos la URL completa de la página y mantenemos compatibilidad con HLS.
  res.set('Referrer-Policy','strict-origin-when-cross-origin');
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
  const remoteAvailable = isVideo ? videoUploadConfigured() : imageUploadConfigured();
  if (remoteAvailable) {
    const uploaded = await uploadMediaBuffer(req.file.buffer, {
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      userId: req.user.id,
      privateDelivery: true
    });
    const { rows } = await pool.query(`
      INSERT INTO media (
        user_id,mime_type,original_name,size_bytes,data,provider,provider_id,secure_url,
        resource_type,delivery_type,width,height,duration_seconds,format,migrated_at,provider_status,provider_meta
      ) VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),$14,$15::jsonb) RETURNING id
    `, [
      req.user.id, req.file.mimetype, req.file.originalname, uploaded.sizeBytes || req.file.size,
      uploaded.provider, uploaded.providerId, uploaded.secureUrl, uploaded.resourceType, uploaded.deliveryType || '', uploaded.width, uploaded.height,
      uploaded.durationSeconds, uploaded.format, uploaded.providerStatus || 'ready', JSON.stringify({ uploaded_at:new Date().toISOString() })
    ]);
    mediaId = rows[0].id;
    provider = uploaded.provider;
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
        u.username, u.name, u.avatar, u.is_virtual, u.interests AS author_interests, u.headline AS author_headline
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
        (SELECT COUNT(*)::int FROM likes l JOIN users lu ON lu.id=l.user_id WHERE l.post_id=cp.id AND COALESCE(lu.social_hidden,FALSE)=FALSE AND COALESCE(lu.is_virtual,FALSE)=FALSE) AS real_likes_count,
        (SELECT COUNT(*)::int FROM comments c JOIN users cu ON cu.id=c.user_id WHERE c.post_id=cp.id AND COALESCE(cu.social_hidden,FALSE)=FALSE AND COALESCE(cu.is_virtual,FALSE)=FALSE) AS real_comments_count,
        EXISTS(SELECT 1 FROM likes lx WHERE lx.post_id = cp.id AND lx.user_id = $1) AS liked,
        EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = cp.id AND b.user_id = $1) AS saved,
        (cp.user_id = $1) AS own,
        COALESCE(a.score,0)::numeric AS affinity_score,
        CASE WHEN EXISTS (
          SELECT 1
            FROM regexp_split_to_table((SELECT interests FROM viewer), '\\s*,\\s*') AS term
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
        + LEAST(18, real_likes_count * 1.5 + real_comments_count * 2.5)
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

app.get('/api/discover/people', auth, asyncRoute(async (req, res) => {
  const mode=['for_you','local','active','new'].includes(String(req.query.mode || '')) ? String(req.query.mode) : 'for_you';
  const limit=Math.min(16,Math.max(4,Number(req.query.limit || 10)));
  const viewerResult=await pool.query(`SELECT location FROM users WHERE id=$1 LIMIT 1`,[req.user.id]);
  const viewerLocation=String(viewerResult.rows[0]?.location || '').trim();
  if (mode === 'local' && !viewerLocation) {
    return res.json({items:[],mode,viewer_location:'',local_available:false});
  }

  const fetchLimit=Math.min(80,Math.max(limit*6,36));
  const { rows } = await pool.query(`
    WITH viewer AS (
      SELECT id,
             LOWER(TRIM(SPLIT_PART(COALESCE(location,''), ',', 1))) AS viewer_location
        FROM users WHERE id=$1
    ), viewer_terms AS (
      SELECT DISTINCT LOWER(TRIM(term)) AS term
        FROM users v
        CROSS JOIN LATERAL regexp_split_to_table(COALESCE(v.interests,''), '\\s*,\\s*') AS term
       WHERE v.id=$1 AND LENGTH(TRIM(term)) >= 2
    ), interactions AS (
      SELECT author_id,SUM(points)::numeric AS score
        FROM (
          SELECT p.user_id AS author_id,3::numeric AS points FROM likes x JOIN posts p ON p.id=x.post_id WHERE x.user_id=$1
          UNION ALL
          SELECT p.user_id,4::numeric FROM comments x JOIN posts p ON p.id=x.post_id WHERE x.user_id=$1
          UNION ALL
          SELECT p.user_id,5::numeric FROM bookmarks x JOIN posts p ON p.id=x.post_id WHERE x.user_id=$1
        ) q
       GROUP BY author_id
    ), candidates AS (
      SELECT
        u.id,u.username,u.name,u.bio,u.avatar,u.location,u.headline,u.interests,u.created_at,u.last_seen_at,u.account_private,u.is_virtual,
        FALSE AS following,
        EXISTS(SELECT 1 FROM follow_requests frq WHERE frq.follower_id=$1 AND frq.followed_id=u.id) AS follow_requested,
        (SELECT COUNT(*)::int FROM follows f JOIN users fu ON fu.id=f.follower_id WHERE f.followed_id=u.id AND COALESCE(fu.is_virtual,FALSE)=FALSE AND COALESCE(fu.social_hidden,FALSE)=FALSE) AS followers_count,
        COALESCE(i.score,0)::numeric AS interaction_score,
        (SELECT COUNT(*)::int
           FROM follows mine
           JOIN users bridge ON bridge.id=mine.followed_id AND COALESCE(bridge.is_virtual,FALSE)=FALSE AND COALESCE(bridge.social_hidden,FALSE)=FALSE
           JOIN follows other ON other.follower_id=mine.followed_id AND other.followed_id=u.id
          WHERE mine.follower_id=$1) AS mutual_count,
        (SELECT COUNT(*)::int FROM viewer_terms vt
          WHERE LOWER(COALESCE(u.interests,'')) LIKE '%' || vt.term || '%'
             OR LOWER(COALESCE(u.headline,'')) LIKE '%' || vt.term || '%'
             OR LOWER(COALESCE(u.bio,'')) LIKE '%' || vt.term || '%') AS shared_interest_count,
        (v.viewer_location <> '' AND LOWER(TRIM(SPLIT_PART(COALESCE(u.location,''), ',', 1)))=v.viewer_location) AS same_location,
        COALESCE(imp.shown_count,0)::int AS shown_count,
        imp.last_shown_at,
        lp.latest_post_at,
        GREATEST(COALESCE(u.last_seen_at,u.created_at),COALESCE(lp.latest_post_at,u.created_at),u.created_at) AS activity_at,
        ((CASE WHEN COALESCE(u.avatar,'')<>'' THEN 2 ELSE 0 END)
          +(CASE WHEN COALESCE(u.headline,'')<>'' THEN 2 ELSE 0 END)
          +(CASE WHEN COALESCE(u.bio,'')<>'' THEN 2 ELSE 0 END)
          +(CASE WHEN COALESCE(u.interests,'')<>'' THEN 2 ELSE 0 END))::int AS profile_quality
      FROM users u
      CROSS JOIN viewer v
      LEFT JOIN interactions i ON i.author_id=u.id
      LEFT JOIN discovery_profile_impressions imp ON imp.viewer_id=$1 AND imp.target_id=u.id
      LEFT JOIN LATERAL (SELECT MAX(p.created_at) AS latest_post_at FROM posts p WHERE p.user_id=u.id) lp ON TRUE
      WHERE u.id<>$1
        AND u.account_status='active'
        AND COALESCE(u.social_hidden,FALSE)=FALSE
        AND NOT EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.followed_id=u.id)
        AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=u.id) OR (bl.blocker_id=u.id AND bl.blocked_id=$1))
        AND NOT EXISTS(SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=u.id)
        AND NOT EXISTS(SELECT 1 FROM discovery_profile_dismissals dd WHERE dd.viewer_id=$1 AND dd.target_id=u.id)
        AND ($3::text<>'local' OR (v.viewer_location<>'' AND LOWER(TRIM(SPLIT_PART(COALESCE(u.location,''), ',', 1)))=v.viewer_location))
        AND ($3::text<>'new' OR u.created_at > NOW()-INTERVAL '120 days')
    ), scored AS (
      SELECT c.*,
        (
          LEAST(42,shared_interest_count*14)
          + CASE WHEN same_location THEN 12 ELSE 0 END
          + LEAST(24,mutual_count*6)
          + LEAST(22,interaction_score*1.7)
          + CASE
              WHEN activity_at > NOW()-INTERVAL '1 day' THEN 12
              WHEN activity_at > NOW()-INTERVAL '7 days' THEN 7
              WHEN activity_at > NOW()-INTERVAL '30 days' THEN 3 ELSE 0 END
          + CASE
              WHEN created_at > NOW()-INTERVAL '14 days' THEN 7
              WHEN created_at > NOW()-INTERVAL '45 days' THEN 3 ELSE 0 END
          + profile_quality
          + LEAST(5,followers_count*0.55)
          + CASE WHEN is_virtual THEN 0 ELSE 5 END
          - CASE
              WHEN last_shown_at > NOW()-INTERVAL '12 hours' THEN 24
              WHEN last_shown_at > NOW()-INTERVAL '3 days' THEN 13
              WHEN last_shown_at > NOW()-INTERVAL '14 days' THEN 5 ELSE 0 END
          - LEAST(10,shown_count*1.1)
        )::numeric AS recommendation_score
      FROM candidates c
    )
    SELECT * FROM scored
    ORDER BY
      CASE WHEN $3::text='active' THEN activity_at END DESC NULLS LAST,
      CASE WHEN $3::text='new' THEN created_at END DESC NULLS LAST,
      recommendation_score DESC,
      activity_at DESC,
      id DESC
    LIMIT $2
  `,[req.user.id,fetchLimit,mode]);

  const onlineRows=rows.map(r=>({...r,online:isOnline(r.id)}));
  if (mode === 'active') onlineRows.sort((a,b)=>Number(Boolean(b.online))-Number(Boolean(a.online)) || new Date(b.activity_at||0)-new Date(a.activity_at||0) || Number(b.recommendation_score||0)-Number(a.recommendation_score||0));
  const selected=diversifyDiscoveryPeople(onlineRows,limit,mode).map(r=>({
    ...r,
    recommendation_reason:discoveryPeopleReason(r,mode),
    discovery_badges:discoveryPeopleBadges(r)
  }));
  await recordDiscoveryImpressions(req.user.id,selected.map(r=>Number(r.id)));
  res.json({items:selected,mode,viewer_location:viewerLocation,local_available:Boolean(viewerLocation)});
}));

app.post('/api/discover/people/:id/dismiss', auth, asyncRoute(async (req,res)=>{
  const targetId=Number(req.params.id);
  if (!Number.isSafeInteger(targetId) || targetId<=0 || targetId===Number(req.user.id)) return res.status(400).json({error:'Perfil no válido'});
  const target=await pool.query(`SELECT id FROM users WHERE id=$1 AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE LIMIT 1`,[targetId]);
  if (!target.rowCount) return res.status(404).json({error:'Perfil no encontrado'});
  await pool.query(`INSERT INTO discovery_profile_dismissals(viewer_id,target_id) VALUES($1,$2) ON CONFLICT (viewer_id,target_id) DO NOTHING`,[req.user.id,targetId]);
  res.json({ok:true});
}));

app.get('/api/suggestions', auth, asyncRoute(async (req, res) => {
  const limit = Math.min(20, Math.max(1, Number(req.query.limit || 10)));
  const excludeIds=[...new Set(String(req.query.exclude||'').split(',').map(Number).filter(n=>Number.isSafeInteger(n)&&n>0&&n!==Number(req.user.id)))].slice(0,24);
  const fetchLimit=Math.min(80,Math.max(limit*6,24));
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
    SELECT u.id,u.username,u.name,u.bio,u.avatar,u.location,u.headline,u.interests,u.created_at,u.last_seen_at,u.account_private,u.is_virtual,
      FALSE AS following,
      EXISTS(SELECT 1 FROM follow_requests frq WHERE frq.follower_id=$1 AND frq.followed_id=u.id) AS follow_requested,
      (SELECT COUNT(*)::int FROM follows f JOIN users fu ON fu.id=f.follower_id WHERE f.followed_id=u.id AND COALESCE(fu.is_virtual,FALSE)=FALSE AND COALESCE(fu.social_hidden,FALSE)=FALSE) AS followers_count,
      COALESCE(i.score,0)::numeric AS interaction_score,
      (SELECT COUNT(*)::int
         FROM follows mine
         JOIN users bridge ON bridge.id=mine.followed_id AND COALESCE(bridge.is_virtual,FALSE)=FALSE AND COALESCE(bridge.social_hidden,FALSE)=FALSE
         JOIN follows other ON other.follower_id=mine.followed_id AND other.followed_id=u.id
        WHERE mine.follower_id=$1) AS mutual_count,
      CASE WHEN EXISTS (
        SELECT 1 FROM regexp_split_to_table((SELECT interests FROM viewer), '\\s*,\\s*') AS term
         WHERE LENGTH(TRIM(term)) >= 2
           AND (
             LOWER(COALESCE(u.interests,'')) LIKE '%' || TRIM(term) || '%'
             OR LOWER(COALESCE(u.headline,'')) LIKE '%' || TRIM(term) || '%'
             OR LOWER(COALESCE(u.bio,'')) LIKE '%' || TRIM(term) || '%'
           )
      ) THEN 1 ELSE 0 END AS shared_interest,
      (
        (CASE WHEN EXISTS (
          SELECT 1 FROM regexp_split_to_table((SELECT interests FROM viewer), '\\s*,\\s*') AS term
           WHERE LENGTH(TRIM(term)) >= 2
             AND (
               LOWER(COALESCE(u.interests,'')) LIKE '%' || TRIM(term) || '%'
               OR LOWER(COALESCE(u.headline,'')) LIKE '%' || TRIM(term) || '%'
               OR LOWER(COALESCE(u.bio,'')) LIKE '%' || TRIM(term) || '%'
             )
        ) THEN 12 ELSE 0 END)
        + COALESCE(i.score,0) * 2
        + (SELECT COUNT(*)::int FROM follows mine JOIN follows other ON other.follower_id=mine.followed_id AND other.followed_id=u.id WHERE mine.follower_id=$1) * 5
        + LEAST(8,(SELECT COUNT(*)::int FROM follows f JOIN users fu ON fu.id=f.follower_id WHERE f.followed_id=u.id AND COALESCE(fu.is_virtual,FALSE)=FALSE AND COALESCE(fu.social_hidden,FALSE)=FALSE))
      )::numeric AS recommendation_score
    FROM users u
    LEFT JOIN interactions i ON i.author_id=u.id
    WHERE u.id <> $1
      AND u.account_status='active'
      AND COALESCE(u.social_hidden,FALSE)=FALSE
      AND NOT (u.id = ANY($3::bigint[]))
      AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.followed_id=u.id)
      AND NOT EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=u.id) OR (bl.blocker_id=u.id AND bl.blocked_id=$1))
      AND NOT EXISTS (SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=u.id)
      AND NOT EXISTS (SELECT 1 FROM discovery_profile_dismissals dd WHERE dd.viewer_id=$1 AND dd.target_id=u.id)
    ORDER BY recommendation_score DESC,u.created_at DESC
    LIMIT $2
  `, [req.user.id, fetchLimit, excludeIds]);
  const selected=diversifyDiscoveryPeople(rows.map(r=>({...r,online:isOnline(r.id)})),limit,'for_you');
  res.json(selected.map(r => ({ ...r, recommendation_reason:peopleRecommendationReason(r) })));
}));

app.get('/api/discover', auth, asyncRoute(async (req, res) => {
  const limit = pageLimit(req, 15);
  const offset = pageOffset(req);
  const { rows } = await pool.query(`
    WITH viewer AS (
      SELECT LOWER(COALESCE(interests,'')) AS interests,
             LOWER(TRIM(SPLIT_PART(COALESCE(location,''), ',', 1))) AS viewer_location
        FROM users WHERE id=$1
    ), affinity AS (
      SELECT author_id,SUM(points)::numeric AS score
        FROM (
          SELECT p.user_id AS author_id,4::numeric AS points FROM likes x JOIN posts p ON p.id=x.post_id WHERE x.user_id=$1
          UNION ALL
          SELECT p.user_id,5::numeric FROM comments x JOIN posts p ON p.id=x.post_id WHERE x.user_id=$1
          UNION ALL
          SELECT p.user_id,6::numeric FROM bookmarks x JOIN posts p ON p.id=x.post_id WHERE x.user_id=$1
          UNION ALL
          SELECT followed_id,3::numeric FROM follows WHERE follower_id=$1
        ) signals
       GROUP BY author_id
    ), candidates AS (
      SELECT
        p.id,p.user_id,p.text,p.media_id,p.media_type,p.source,p.visibility,p.created_at,p.edited_at,p.repost_of_id,
        u.username,u.name,u.avatar,u.is_virtual,u.interests AS author_interests,u.headline AS author_headline,u.location AS author_location,
        ROW_NUMBER() OVER (PARTITION BY p.user_id ORDER BY p.created_at DESC,p.id DESC) AS author_recent_rank
      FROM posts p
      JOIN users u ON u.id=p.user_id
      WHERE u.account_status='active'
        AND COALESCE(u.social_hidden,FALSE)=FALSE
        AND (p.visibility='public' OR p.user_id=$1)
        AND (p.user_id=$1 OR NOT u.account_private OR EXISTS(SELECT 1 FROM follows pf WHERE pf.follower_id=$1 AND pf.followed_id=p.user_id))
        AND (
          p.user_id=$1 OR NOT u.friend_gate_enabled OR
          EXISTS(SELECT 1 FROM friendships dgfr WHERE (dgfr.user1_id=$1 AND dgfr.user2_id=p.user_id) OR (dgfr.user1_id=p.user_id AND dgfr.user2_id=$1)) OR
          (
            CASE WHEN u.friend_gate_require_post
              THEN (SELECT COUNT(*) FROM referral_attributions dra WHERE dra.inviter_id=$1 AND dra.gate_user_id=p.user_id AND dra.qualified_at IS NOT NULL)
              ELSE (SELECT COUNT(*) FROM referral_attributions dra WHERE dra.inviter_id=$1 AND dra.gate_user_id=p.user_id)
            END
          ) >= u.friend_gate_required_referrals
        )
        AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$1))
        AND NOT EXISTS(SELECT 1 FROM mutes mu WHERE mu.muter_id=$1 AND mu.muted_id=p.user_id)
      ORDER BY p.id DESC
      LIMIT 360
    ), scored AS (
      SELECT
        cp.*,
        (SELECT COUNT(*)::int FROM likes l JOIN users lu ON lu.id=l.user_id WHERE l.post_id=cp.id AND COALESCE(lu.social_hidden,FALSE)=FALSE) AS likes_count,
        (SELECT COUNT(*)::int FROM comments c JOIN users cu ON cu.id=c.user_id WHERE c.post_id=cp.id AND COALESCE(cu.social_hidden,FALSE)=FALSE) AS comments_count,
        (SELECT COUNT(*)::int FROM likes l JOIN users lu ON lu.id=l.user_id WHERE l.post_id=cp.id AND COALESCE(lu.social_hidden,FALSE)=FALSE AND COALESCE(lu.is_virtual,FALSE)=FALSE) AS real_likes_count,
        (SELECT COUNT(*)::int FROM comments c JOIN users cu ON cu.id=c.user_id WHERE c.post_id=cp.id AND COALESCE(cu.social_hidden,FALSE)=FALSE AND COALESCE(cu.is_virtual,FALSE)=FALSE) AS real_comments_count,
        EXISTS(SELECT 1 FROM likes lx WHERE lx.post_id=cp.id AND lx.user_id=$1) AS liked,
        EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id=cp.id AND b.user_id=$1) AS saved,
        (cp.user_id=$1) AS own,
        COALESCE(a.score,0)::numeric AS affinity_score,
        CASE WHEN EXISTS (
          SELECT 1 FROM regexp_split_to_table((SELECT interests FROM viewer), '\\s*,\\s*') AS term
           WHERE LENGTH(TRIM(term))>=2
             AND (
               LOWER(COALESCE(cp.text,'')) LIKE '%' || TRIM(term) || '%'
               OR LOWER(COALESCE(cp.author_interests,'')) LIKE '%' || TRIM(term) || '%'
               OR LOWER(COALESCE(cp.author_headline,'')) LIKE '%' || TRIM(term) || '%'
             )
        ) THEN 1 ELSE 0 END AS interest_match,
        ((SELECT viewer_location FROM viewer)<>'' AND LOWER(TRIM(SPLIT_PART(COALESCE(cp.author_location,''), ',', 1)))=(SELECT viewer_location FROM viewer)) AS same_location,
        EXISTS(
          SELECT 1 FROM follows mine
          JOIN users bridge ON bridge.id=mine.followed_id AND COALESCE(bridge.is_virtual,FALSE)=FALSE AND COALESCE(bridge.social_hidden,FALSE)=FALSE
          JOIN follows second_degree ON second_degree.follower_id=mine.followed_id
          WHERE mine.follower_id=$1 AND second_degree.followed_id=cp.user_id
        ) AS mutual_signal,
        EXISTS(SELECT 1 FROM follows mine WHERE mine.follower_id=$1 AND mine.followed_id=cp.user_id) AS following_author,
        EXTRACT(EPOCH FROM (NOW()-cp.created_at))/3600.0 AS age_hours
      FROM candidates cp
      LEFT JOIN affinity a ON a.author_id=cp.user_id
    )
    SELECT *,(
      affinity_score*1.6
      + interest_match*12
      + CASE WHEN same_location THEN 5 ELSE 0 END
      + CASE WHEN mutual_signal THEN 5 ELSE 0 END
      + CASE WHEN following_author THEN 3 ELSE 0 END
      + LEAST(20,real_likes_count*1.4 + real_comments_count*2.7)
      + GREATEST(0,16-LEAST(age_hours,16))
      + CASE WHEN is_virtual THEN 0 ELSE 2 END
      - GREATEST(0,(author_recent_rank-1)*5)
      - CASE WHEN own THEN 28 ELSE 0 END
    ) AS recommendation_score
    FROM scored
    ORDER BY recommendation_score DESC,created_at DESC,id DESC
    LIMIT $2 OFFSET $3
  `,[req.user.id,limit+1,offset]);
  let posts=rows.map(r=>({...normalizePost(r),recommendation_reason:discoverContentReason(r)}));
  posts=await attachProtectedMediaUrls(posts,req.user.id);
  posts=await enrichReposts(req.user.id,posts);
  res.json(offsetPage(posts,limit,offset));
}));

app.get('/api/bookmarks', auth, asyncRoute(async (req, res) => {
  const limit = pageLimit(req, 15);
  const offset = pageOffset(req);
  const { rows } = await pool.query(`
    WITH candidates AS (
      SELECT
        p.id, p.user_id, p.text, p.media_id, p.media_type, p.source, p.visibility, p.created_at, p.edited_at, p.repost_of_id,
        u.username, u.name, u.avatar, u.is_virtual, bk.created_at AS bookmark_created_at
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


// V1.12.36 · Previsualización social en publicaciones.
// Devuelve hasta 2 perfiles que han dado like y los 3 comentarios más recientes
// para las publicaciones que el usuario ya puede ver.
app.get('/api/posts/social-preview', auth, asyncRoute(async (req, res) => {
  const ids=[...new Set(String(req.query.ids||'').split(',').map(v=>Number(v)).filter(Number.isSafeInteger))].slice(0,30);
  if (!ids.length) return res.json({posts:{}});
  const allowedFlags=await Promise.all(ids.map(id=>canUserViewPost(id,req.user.id)));
  const allowed=ids.filter((_,index)=>allowedFlags[index]);
  if (!allowed.length) return res.json({posts:{}});

  const [likesResult,commentsResult]=await Promise.all([
    pool.query(`
      WITH ranked AS (
        SELECT l.post_id,u.id,u.username,u.name,u.avatar,u.is_virtual,l.created_at,
               ROW_NUMBER() OVER(PARTITION BY l.post_id ORDER BY l.created_at DESC,l.user_id DESC) AS rn
        FROM likes l
        JOIN users u ON u.id=l.user_id
        WHERE l.post_id=ANY($1::bigint[])
          AND u.account_status='active'
          AND COALESCE(u.social_hidden,FALSE)=FALSE
          AND NOT EXISTS(
            SELECT 1 FROM blocks bl
            WHERE (bl.blocker_id=$2 AND bl.blocked_id=u.id) OR (bl.blocker_id=u.id AND bl.blocked_id=$2)
          )
      )
      SELECT post_id,id,username,name,avatar,is_virtual,created_at
      FROM ranked
      WHERE rn<=2
      ORDER BY post_id,rn ASC
    `,[allowed,req.user.id]),
    pool.query(`
      WITH ranked AS (
        SELECT c.post_id,c.id,c.user_id,c.text,c.created_at,u.username,u.name,u.avatar,u.is_virtual,
               ROW_NUMBER() OVER(PARTITION BY c.post_id ORDER BY c.created_at DESC,c.id DESC) AS rn
        FROM comments c
        JOIN users u ON u.id=c.user_id
        WHERE c.post_id=ANY($1::bigint[])
          AND u.account_status='active'
          AND COALESCE(u.social_hidden,FALSE)=FALSE
          AND NOT EXISTS(
            SELECT 1 FROM blocks bl
            WHERE (bl.blocker_id=$2 AND bl.blocked_id=u.id) OR (bl.blocker_id=u.id AND bl.blocked_id=$2)
          )
      )
      SELECT post_id,id,user_id,text,created_at,username,name,avatar,is_virtual
      FROM ranked
      WHERE rn<=3
      ORDER BY post_id,rn DESC
    `,[allowed,req.user.id])
  ]);

  const posts={};
  allowed.forEach(id=>{posts[String(id)]={likes:[],comments:[]};});
  likesResult.rows.forEach(row=>{ if(posts[String(row.post_id)]) posts[String(row.post_id)].likes.push(row); });
  commentsResult.rows.forEach(row=>{ if(posts[String(row.post_id)]) posts[String(row.post_id)].comments.push(row); });
  res.json({posts});
}));

app.get('/api/posts/:id/likes', auth, asyncRoute(async (req,res) => {
  if (!(await canUserViewPost(req.params.id,req.user.id))) return res.status(404).json({error:'Publicación no disponible'});
  const {rows}=await pool.query(`
    SELECT u.id,u.username,u.name,u.avatar,u.is_virtual,l.created_at
    FROM likes l
    JOIN users u ON u.id=l.user_id
    WHERE l.post_id=$1
      AND u.account_status='active'
      AND COALESCE(u.social_hidden,FALSE)=FALSE
      AND NOT EXISTS(
        SELECT 1 FROM blocks bl
        WHERE (bl.blocker_id=$2 AND bl.blocked_id=u.id) OR (bl.blocker_id=u.id AND bl.blocked_id=$2)
      )
    ORDER BY l.created_at DESC,l.user_id DESC
    LIMIT 100
  `,[req.params.id,req.user.id]);
  res.json(rows);
}));

// V1.12.38 · Destino individual para el Centro de actividad.
app.get('/api/posts/:id', auth, asyncRoute(async (req,res)=>{
  const postId=Number(req.params.id);
  if(!Number.isSafeInteger(postId) || postId<=0) return res.status(404).json({error:'Publicación no disponible'});
  const posts=await postQuery(req.user.id,{mode:'activity',postId,limit:1,paged:false});
  if(!posts.length) return res.status(404).json({error:'Publicación no disponible'});
  res.json(posts[0]);
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
    await addNotification(client, { userId: post.rows[0].user_id, actorId: req.user.id, type: 'comment', postId: req.params.id, commentId: rows[0].id, text });
    await notifyMentions(client, { text, actorId:req.user.id, postId:req.params.id, commentId: rows[0].id });
    const count=await client.query('SELECT COUNT(*)::int AS count FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 AND COALESCE(u.social_hidden,FALSE)=FALSE',[req.params.id]);
    return {...rows[0],count:count.rows[0]?.count||0};
  });
  res.json({ ok: true, id: result.id, count: result.count });
}));

app.get('/api/posts/:id/comments', auth, asyncRoute(async (req, res) => {
  if (!(await canUserViewPost(req.params.id,req.user.id))) return res.status(404).json({error:'Publicación no disponible'});
  const { rows } = await pool.query(`
    SELECT c.id, c.post_id, c.user_id, c.text, c.created_at, u.username, u.name, u.avatar, u.is_virtual,
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
  const result=await withTransaction(async client=>{
    const deleted=await client.query('DELETE FROM comments WHERE id = $1 AND user_id = $2 RETURNING id,post_id', [req.params.id, req.user.id]);
    if (!deleted.rows[0]) { const err=new Error('Comentario no encontrado'); err.status=404; throw err; }
    const count=await client.query('SELECT COUNT(*)::int AS count FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 AND COALESCE(u.social_hidden,FALSE)=FALSE',[deleted.rows[0].post_id]);
    return {post_id:deleted.rows[0].post_id,count:count.rows[0]?.count||0};
  });
  res.json({ ok: true, post_id:result.post_id, count:result.count });
}));

app.get('/api/users', auth, asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const pattern = `%${q}%`;
  const { rows } = await pool.query(`
    SELECT u.id, u.username, u.name, u.bio, u.avatar, u.location, u.headline, u.interests, u.created_at, u.last_seen_at, u.account_private, u.is_virtual,
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

// V1.12.9: resolución pública de /usuario + vista previa visual segura para campañas Growth Engine.
app.get('/api/public/profile/:username', asyncRoute(async (req, res) => {
  const username = String(req.params.username || '').trim().replace(/^@/, '');
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) return res.status(404).json({ error:'Perfil no encontrado' });
  const { rows } = await pool.query(
    `SELECT id,username,name,bio,avatar,headline,cover,friend_gate_enabled,friend_gate_message,account_private,public_profile_preview_enabled,is_virtual
       FROM users
      WHERE LOWER(username)=LOWER($1) AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE
      LIMIT 1`,
    [username]
  );
  const target=rows[0];
  if (!target) return res.status(404).json({ error:'Perfil no encontrado' });
  await hydrateVirtualProfileDisplayCover(target);

  let campaignMessage='';
  let growthPreview=false;
  let growthCampaign=null;
  const campaignSlug=normalizeCampaignSlug(req.query?.campaign || '');
  if(campaignSlug){
    growthCampaign=await growthCampaignBySlug(campaignSlug);
    if(growthCampaign && Number(growthCampaign.target_user_id)===Number(target.id)){
      growthPreview=true;
      campaignMessage=String(growthCampaign.access_message || '').trim().slice(0,220);
    }
  }

  const profileMessage=String(target.friend_gate_message || '').trim().slice(0,220);
  res.json({
    exists:true,
    username:target.username,
    name:target.name,
    is_virtual:Boolean(target.is_virtual),
    friend_gate_enabled:Boolean(target.friend_gate_enabled),
    friend_gate_message:target.friend_gate_enabled ? profileMessage : '',
    access_message:target.friend_gate_enabled ? (campaignMessage || profileMessage) : '',
    access_message_source:campaignMessage ? 'campaign' : (profileMessage ? 'profile' : 'default'),
    growth_campaign_preview:growthPreview,
    direct_profile_preview:Boolean(!growthPreview && target.public_profile_preview_enabled && !target.account_private),
    public_teaser_enabled:Boolean((growthPreview && growthCampaign?.public_teaser_enabled) || (!growthPreview && target.public_profile_preview_enabled && !target.account_private)),
    profile_preview:(growthPreview || (target.public_profile_preview_enabled && !target.account_private)) ? {
      username:target.username,
      name:String(target.name || '').slice(0,100),
      headline:String(target.headline || '').slice(0,140),
      bio:String(target.bio || '').slice(0,500),
      avatar:String(target.avatar || '').slice(0,2000),
      cover:String(target.cover || '').slice(0,2000),
      is_virtual:Boolean(target.is_virtual)
    } : null
  });
}));


// V1.12.24: teaser público desde Growth Engine o directamente desde /usuario; tema claro/oscuro disponible en la capa cliente.
// La URL directa sólo funciona si el propietario la activa y la cuenta no es privada.
// Nunca se entregan URLs de fotos/vídeos; sólo texto y el tipo de multimedia bloqueada.
app.get('/api/public/profile/:username/teaser', publicTeaserLimiter, asyncRoute(async (req,res)=>{
  const username=String(req.params.username || '').trim().replace(/^@/,'');
  if(!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) return res.status(404).json({error:'Perfil no encontrado'});
  const campaignSlug=normalizeCampaignSlug(req.query?.campaign || '');
  const campaign=campaignSlug ? await growthCampaignBySlug(campaignSlug) : null;
  const campaignPreview=Boolean(campaign && campaign.public_teaser_enabled);
  if(campaignSlug && !campaignPreview) return res.status(404).json({error:'Vista previa no disponible'});

  const lookupParams=[username];
  let ownershipSql='';
  if(campaignPreview){ lookupParams.push(campaign.target_user_id); ownershipSql='AND id=$2'; }
  else ownershipSql='AND COALESCE(public_profile_preview_enabled,FALSE)=TRUE AND COALESCE(account_private,FALSE)=FALSE';

  const {rows:users}=await pool.query(`
    SELECT id,username,name,bio,avatar,headline,cover,invite_code,account_private,public_profile_preview_enabled,is_virtual
      FROM users
     WHERE LOWER(username)=LOWER($1) ${ownershipSql} AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE
     LIMIT 1
  `,lookupParams);
  const target=users[0];
  if(!target) return res.status(404).json({error:'Vista previa no disponible'});
  await hydrateVirtualProfileDisplayCover(target);

  const limit=Math.min(30,Math.max(5,Number(req.query?.limit || 15)));
  const before=Number(req.query?.before || 0);
  const params=[target.id];
  let cursorSql='';
  if(Number.isInteger(before) && before>0){ params.push(before); cursorSql=`AND p.id < $${params.length}`; }
  params.push(limit+1);
  const limitParam=params.length;
  const {rows:rawPosts}=await pool.query(`
    SELECT p.id,p.text,p.media_type,p.media_id,p.external_url,p.created_at,p.repost_of_id,
           rp.text AS repost_text,rp.media_type AS repost_media_type,rp.media_id AS repost_media_id,rp.external_url AS repost_external_url
      FROM posts p
      LEFT JOIN posts rp ON rp.id=p.repost_of_id AND rp.visibility='public'
     WHERE p.user_id=$1 AND p.visibility='public' ${cursorSql}
     ORDER BY p.id DESC
     LIMIT $${limitParam}
  `,params);
  const hasMore=rawPosts.length>limit;
  const page=rawPosts.slice(0,limit);

  const posts=page.map(post=>{
    const ownType=String(post.media_type || 'none').toLowerCase();
    const repostType=String(post.repost_media_type || 'none').toLowerCase();
    const ownMedia=Boolean(post.media_id || String(post.external_url||'').trim() || (ownType && ownType!=='none'));
    const repostMedia=Boolean(post.repost_media_id || String(post.repost_external_url||'').trim() || (repostType && repostType!=='none'));
    const mediaType=(ownType==='video' || repostType==='video') ? 'video' : ((ownMedia || repostMedia) ? 'image' : 'none');
    return {
      id:Number(post.id),
      text:String(post.text || ''),
      repost_text:String(post.repost_text || ''),
      is_repost:Boolean(post.repost_of_id),
      has_media:Boolean(ownMedia || repostMedia),
      media_type:mediaType,
      created_at:post.created_at
    };
  });

  res.json({
    ok:true,
    source:campaignPreview ? 'growth' : 'direct_profile',
    campaign:campaignPreview ? String(campaign.slug) : '',
    signup_referral_code:campaignPreview ? '' : String(target.invite_code || ''),
    profile:{
      username:target.username,
      name:String(target.name || '').slice(0,100),
      headline:String(target.headline || '').slice(0,140),
      bio:String(target.bio || '').slice(0,500),
      avatar:String(target.avatar || '').slice(0,2000),
      cover:String(target.cover || '').slice(0,2000),
      is_virtual:Boolean(target.is_virtual)
    },
    posts,
    has_more:hasMore,
    next_before:hasMore && posts.length ? posts[posts.length-1].id : null
  });
}));

app.post('/api/growth/campaign/teaser-event', asyncRoute(async (req,res)=>{
  const campaign=await growthCampaignBySlug(req.body?.campaign || '');
  if(!campaign || !campaign.public_teaser_enabled) return res.status(404).json({error:'Campaña no encontrada'});
  const event=String(req.body?.event || '').trim().toLowerCase();
  const field=event==='view' ? 'teaser_views' : (event==='signup_click' ? 'teaser_signup_clicks' : '');
  if(!field) return res.status(400).json({error:'Evento no válido'});
  await incrementGrowthDaily(campaign.id,field);
  res.json({ok:true});
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
  await hydrateVirtualProfileDisplayCover(row);
  if (row.blocked_me && !row.own) return res.status(404).json({ error:'Perfil no disponible' });
  const canMessage = row.own ? false : await canMessageUser(req.user.id,row.id);
  const friendGate = (!row.own && row.friend_gate_enabled && row.friendship_status !== 'friends') ? await friendGateProgress(req.user.id,row.id) : null;
  if(friendGate?.enabled && !friendGate.unlocked){
    const gateCampaign=await recordFriendGateSession(req.user.id,row.id,req.query?.campaign || '');
    if(gateCampaign && Number(gateCampaign.target_user_id)===Number(row.id) && String(gateCampaign.access_message || '').trim()){
      friendGate.access_message=String(gateCampaign.access_message).trim().slice(0,220);
      friendGate.access_message_source='campaign';
    }else{
      friendGate.access_message_source=String(friendGate.access_message || '').trim() ? 'profile' : 'default';
    }
  }
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
      SELECT u.id,u.username,u.name,u.avatar,u.headline,u.account_private,u.is_virtual,rel.created_at,
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

// --- V1.12.36: preferencias de avisos sociales por email -------------------
app.get('/api/email-notifications', auth, asyncRoute(async (req,res)=>{
  const {rows}=await pool.query(`SELECT email_social_notifications,email_like_notifications,email_comment_notifications,email_connection_notifications,email_smart_digest_notifications,email_recovery_notifications FROM users WHERE id=$1`,[req.user.id]);
  if(!rows[0]) return res.status(404).json({error:'Usuario no encontrado'});
  res.json({
    enabled:rows[0].email_social_notifications!==false,
    likes:rows[0].email_like_notifications!==false,
    comments:rows[0].email_comment_notifications!==false,
    connections:rows[0].email_connection_notifications!==false,
    digest:rows[0].email_smart_digest_notifications!==false,
    recovery:rows[0].email_recovery_notifications===true,
    email_configured:emailConfigured()
  });
}));

app.patch('/api/email-notifications', auth, asyncRoute(async (req,res)=>{
  const value=(key)=>req.body?.[key]===undefined?null:Boolean(req.body[key]);
  const enabled=value('enabled'),likes=value('likes'),comments=value('comments'),connections=value('connections'),digest=value('digest'),recovery=value('recovery');
  const {rows}=await pool.query(`
    UPDATE users SET
      email_social_notifications=COALESCE($2,email_social_notifications),
      email_like_notifications=COALESCE($3,email_like_notifications),
      email_comment_notifications=COALESCE($4,email_comment_notifications),
      email_connection_notifications=COALESCE($5,email_connection_notifications),
      email_smart_digest_notifications=COALESCE($6,email_smart_digest_notifications),
      email_recovery_notifications=COALESCE($7,email_recovery_notifications)
    WHERE id=$1
    RETURNING email_social_notifications,email_like_notifications,email_comment_notifications,email_connection_notifications,email_smart_digest_notifications,email_recovery_notifications
  `,[req.user.id,enabled,likes,comments,connections,digest,recovery]);
  res.json({
    enabled:rows[0].email_social_notifications!==false,
    likes:rows[0].email_like_notifications!==false,
    comments:rows[0].email_comment_notifications!==false,
    connections:rows[0].email_connection_notifications!==false,
    digest:rows[0].email_smart_digest_notifications!==false,
    recovery:rows[0].email_recovery_notifications===true
  });
}));

app.post('/api/email-notifications/test-smart', auth, asyncRoute(async (req,res)=>{
  if(!emailConfigured()) return res.status(503).json({error:'El envío de correo no está configurado'});
  const {rows}=await pool.query(`SELECT id,email,username,name,preferred_language,email_verified_at,is_virtual,last_seen_at,created_at FROM users WHERE id=$1`,[req.user.id]);
  const user=rows[0];
  if(!user?.email_verified_at) return res.status(400).json({error:'Verifica tu email antes de enviar una prueba'});
  const result=await sendSmartDigestEmailForUser(user,{preview:true});
  if(!result.sent) return res.status(502).json({error:'No se pudo enviar el correo de prueba'});
  res.json({ok:true});
}));

// --- V0.9: privacidad, solicitudes de seguimiento y control --------------
app.get('/api/privacy', auth, asyncRoute(async (req,res)=>{
  const {rows}=await pool.query(`SELECT account_private,public_profile_preview_enabled,message_policy,content_watermark_mode,
    (SELECT COUNT(*)::int FROM follow_requests WHERE followed_id=$1) AS follow_requests_count,
    (SELECT COUNT(*)::int FROM blocks WHERE blocker_id=$1) AS blocked_count,
    (SELECT COUNT(*)::int FROM mutes WHERE muter_id=$1) AS muted_count
    FROM users WHERE id=$1`,[req.user.id]);
  res.json(rows[0]);
}));

app.patch('/api/privacy', auth, asyncRoute(async (req,res)=>{
  const accountPrivate = req.body.account_private === undefined ? null : Boolean(req.body.account_private);
  const publicProfilePreview = req.body.public_profile_preview_enabled === undefined ? null : Boolean(req.body.public_profile_preview_enabled);
  const messagePolicy = req.body.message_policy === undefined ? null : String(req.body.message_policy);
  const watermarkMode = req.body.content_watermark_mode === undefined ? null : String(req.body.content_watermark_mode);
  if (messagePolicy !== null && !['everyone','followers','friends','nobody'].includes(messagePolicy)) return res.status(400).json({error:'Privacidad de mensajes inválida'});
  if (watermarkMode !== null && !['off','exclusive','all'].includes(watermarkMode)) return res.status(400).json({error:'Configuración de marca de agua inválida'});
  const result=await withTransaction(async client=>{
    const {rows}=await client.query(`UPDATE users SET account_private=COALESCE($2,account_private), public_profile_preview_enabled=COALESCE($3,public_profile_preview_enabled), message_policy=COALESCE($4,message_policy), content_watermark_mode=COALESCE($5,content_watermark_mode) WHERE id=$1 RETURNING account_private,public_profile_preview_enabled,message_policy,content_watermark_mode`,[req.user.id,accountPrivate,publicProfilePreview,messagePolicy,watermarkMode]);
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
  const {rows}=await pool.query('SELECT u.id,u.username,u.name,u.avatar,u.is_virtual,b.created_at FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=$1 ORDER BY b.created_at DESC',[req.user.id]);
  res.json(rows);
}));
app.get('/api/muted', auth, asyncRoute(async (req,res)=>{
  const {rows}=await pool.query('SELECT u.id,u.username,u.name,u.avatar,u.is_virtual,m.created_at FROM mutes m JOIN users u ON u.id=m.muted_id WHERE m.muter_id=$1 ORDER BY m.created_at DESC',[req.user.id]);
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
    SELECT u.id,u.username,u.name,u.avatar,u.bio,u.last_seen_at,u.is_virtual,fr.created_at
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
    SELECT u.id, u.username, u.name, u.bio, u.avatar, u.headline, u.interests, u.last_seen_at, u.account_private, u.is_virtual,
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
        AND COALESCE(u.social_hidden,FALSE)=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE
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
             COUNT(DISTINCT l.user_id) FILTER(WHERE COALESCE(lu.is_virtual,FALSE)=FALSE)::int AS likes,
             COUNT(DISTINCT c.id) FILTER(WHERE COALESCE(cu.is_virtual,FALSE)=FALSE)::int AS comments
      FROM posts p
      LEFT JOIN likes l ON l.post_id=p.id
      LEFT JOIN users lu ON lu.id=l.user_id
      LEFT JOIN comments c ON c.post_id=p.id
      LEFT JOIN users cu ON cu.id=c.user_id
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
    SELECT n.id, n.type, n.post_id, n.comment_id, n.text, n.read_at, n.created_at,
           a.id AS actor_id, a.username, a.name, a.avatar, a.is_virtual
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
  const ids=Array.isArray(req.body?.ids)
    ? [...new Set(req.body.ids.map(Number).filter(Number.isSafeInteger).filter(id=>id>0))].slice(0,100)
    : [];
  if(ids.length) {
    await pool.query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND id = ANY($2::bigint[]) AND read_at IS NULL', [req.user.id,ids]);
  } else {
    await pool.query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
  }
  const {rows}=await pool.query(`
    SELECT COUNT(*)::int AS count FROM notifications n
     WHERE n.user_id=$1 AND n.read_at IS NULL
       AND (n.actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=n.actor_id) OR (bl.blocker_id=n.actor_id AND bl.blocked_id=$1)))
  `,[req.user.id]);
  res.json({ ok: true, unread: Number(rows[0]?.count||0) });
}));


// --- V0.5: Stories ---------------------------------------------------------
app.get('/api/stories', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.id, s.user_id, s.media_id, s.media_type, s.text, s.visibility, s.created_at, s.expires_at,
           u.username, u.name, u.avatar, u.is_virtual,
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
        u.username, u.name, u.avatar, u.is_virtual
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
  const access = await messageAccessState(myId,otherId);
  if (!access.allowed) {
    if (access.code === 'FRIEND_GATE_CHAT_LOCKED') {
      return res.status(403).json({
        error:'Completa el reto de acceso antes de poder usar el chat con este perfil.',
        code:access.code,
        friend_gate:access.friend_gate || null
      });
    }
    return res.status(403).json({error:'Esta persona no acepta mensajes tuyos',code:access.code || 'MESSAGE_POLICY_BLOCKED'});
  }
  const a = Math.min(myId, otherId), b = Math.max(myId, otherId);
  const { rows } = await pool.query(`
    INSERT INTO conversations (user1_id, user2_id) VALUES ($1,$2)
    ON CONFLICT (user1_id,user2_id) DO UPDATE SET updated_at = conversations.updated_at
    RETURNING id
  `, [a,b]);
  await pool.query(`INSERT INTO conversation_reads (conversation_id,user_id,last_read_at) VALUES ($1,$2,NOW()) ON CONFLICT DO NOTHING`, [rows[0].id, myId]);
  res.json({ id: rows[0].id });
}));

app.get('/api/conversations/:id/access', auth, asyncRoute(async (req,res)=>{
  const conversation = await requireConversationMember(req.params.id, req.user.id);
  const otherId = conversationOtherId(conversation, req.user.id);
  const access = await messageAccessState(req.user.id,otherId);
  res.json({
    allowed:Boolean(access.allowed),
    code:access.code || '',
    reason:access.reason || '',
    friend_gate:access.friend_gate || null
  });
}));

app.get('/api/conversations', auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT c.id, c.created_at, c.updated_at,
           u.id AS other_id, u.username, u.name, u.avatar, u.last_seen_at, u.is_virtual,
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
             mm.provider AS media_provider, mm.provider_status AS media_provider_status,
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
             spu.friend_gate_enabled AS shared_gate_enabled, spu.content_watermark_mode AS shared_watermark_mode,
             smm.provider AS shared_media_provider, smm.provider_status AS shared_media_provider_status
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        LEFT JOIN media mm ON mm.id=m.media_id
        LEFT JOIN messages rm ON rm.id=m.reply_to_id AND rm.conversation_id=m.conversation_id
        LEFT JOIN users ru ON ru.id=rm.sender_id
        LEFT JOIN posts sp ON sp.id=m.shared_post_id
        LEFT JOIN media smm ON smm.id=sp.media_id
        LEFT JOIN users spu ON spu.id=sp.user_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC, m.id DESC LIMIT 150
    ) x ORDER BY created_at ASC, id ASC
  `, [req.params.id, req.user.id]);
  res.json(rows.map(r => ({
    id:r.id, conversation_id:r.conversation_id, sender_id:r.sender_id, text:r.text, media_id:r.media_id, media_type:r.media_type,
    media_url:r.media_id && !(String(r.media_provider||'')==='bunny_stream'&&String(r.media_provider_status||'')!=='ready') ? protectedMediaUrl(r.media_id,req.user.id) : '', media_protected:Boolean(r.media_id), media_provider:String(r.media_provider||''), media_streaming:String(r.media_provider||'')==='bunny_stream', media_processing:String(r.media_provider||'')==='bunny_stream'&&String(r.media_provider_status||'')!=='ready', watermarked:false, created_at:r.created_at, username:r.username, name:r.name, avatar:r.avatar, own:Boolean(r.own),
    reply: r.reply_to_id ? { id:r.reply_to_id, name:r.reply_name, username:r.reply_username, text:r.reply_text || '', media_type:r.reply_media_type || 'none' } : null,
    shared_post: r.shared_visible_id ? { id:r.shared_visible_id, text:r.shared_text || '', media_type:r.shared_media_type || 'none', media_url:r.shared_media_id && !(String(r.shared_media_provider||'')==='bunny_stream'&&String(r.shared_media_provider_status||'')!=='ready') ? protectedMediaUrl(r.shared_media_id,req.user.id) : '', media_protected:Boolean(r.shared_media_id), media_provider:String(r.shared_media_provider||''), media_streaming:String(r.shared_media_provider||'')==='bunny_stream', media_processing:String(r.shared_media_provider||'')==='bunny_stream'&&String(r.shared_media_provider_status||'')!=='ready', watermarked:Boolean(r.shared_media_id) && String(r.shared_watermark_mode||'exclusive')!=='off' && (String(r.shared_watermark_mode||'exclusive')==='all' || Boolean(r.shared_gate_enabled)), username:r.shared_username, name:r.shared_name, avatar:r.shared_avatar } : (r.shared_post_id ? { unavailable:true } : null)
  })));
}));

app.post('/api/conversations/:id/messages', auth, socialAccountOnly, asyncRoute(async (req, res) => {
  const conversation = await requireConversationMember(req.params.id, req.user.id);
  const otherId = conversationOtherId(conversation, req.user.id);
  await assertNotBlocked(req.user.id,otherId);
  const access = await messageAccessState(req.user.id,otherId);
  if (!access.allowed) {
    if (access.code === 'FRIEND_GATE_CHAT_LOCKED') {
      return res.status(403).json({
        error:'Completa el reto de acceso antes de poder usar el chat con este perfil.',
        code:access.code,
        friend_gate:access.friend_gate || null
      });
    }
    return res.status(403).json({error:'Esta persona no acepta mensajes tuyos',code:access.code || 'MESSAGE_POLICY_BLOCKED'});
  }
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
  const virtualRecipient=await pool.query(`SELECT u.id,u.username,u.name,vp.reply_enabled FROM users u JOIN virtual_profiles vp ON vp.user_id=u.id WHERE u.id=$1 AND u.is_virtual=TRUE AND vp.status<>'retired' LIMIT 1`,[otherId]);
  if(virtualRecipient.rowCount && virtualRecipient.rows[0].reply_enabled!==false){
    await pool.query(`INSERT INTO virtual_message_alerts(conversation_id,message_id,virtual_user_id,real_user_id) VALUES($1,$2,$3,$4) ON CONFLICT(message_id) DO NOTHING`,[req.params.id,rows[0].id,otherId,req.user.id]);
    io.to('admins').emit('virtual-inbox:new',{conversationId:Number(req.params.id),messageId:Number(rows[0].id),virtualUserId:Number(otherId),virtualName:virtualRecipient.rows[0].name,realUserId:Number(req.user.id),text:text.slice(0,160)});
  }
  res.json(rows[0]);
}));

// V1.12.22: el remitente puede borrar sus propios mensajes. El borrado es para ambos
// participantes, mantiene sincronizados otros dispositivos y limpia multimedia huérfana.
app.delete('/api/conversations/:id/messages/:messageId', auth, socialAccountOnly, asyncRoute(async (req,res)=>{
  const conversation = await requireConversationMember(req.params.id, req.user.id);
  const messageId = Number(req.params.messageId);
  if (!Number.isInteger(messageId) || messageId <= 0) return res.status(400).json({error:'Mensaje inválido'});
  const otherId = conversationOtherId(conversation, req.user.id);
  const { rows } = await pool.query(`
    DELETE FROM messages
     WHERE id=$1 AND conversation_id=$2 AND sender_id=$3
     RETURNING id,media_id
  `,[messageId,req.params.id,req.user.id]);
  if (!rows[0]) return res.status(404).json({error:'No puedes borrar este mensaje o ya no existe'});

  await pool.query(`
    UPDATE conversations c
       SET updated_at=COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id=c.id),c.created_at)
     WHERE c.id=$1
  `,[req.params.id]);

  if (rows[0].media_id) {
    await cleanupMediaIfUnused(rows[0].media_id).catch(err=>console.error('Limpieza de multimedia de mensaje:',err.message));
  }

  const event={conversationId:Number(req.params.id),messageId:Number(rows[0].id)};
  io.to(`user:${req.user.id}`).emit('message:deleted',event);
  io.to(`user:${otherId}`).emit('message:deleted',event);
  const virtualSide=await pool.query(`SELECT 1 FROM users WHERE id=$1 AND is_virtual=TRUE LIMIT 1`,[otherId]);
  if(virtualSide.rowCount){
    const status=await virtualCommunityStatus(pool);
    io.to('admins').emit('virtual-inbox:resolved',{conversationId:Number(req.params.id),unread:Number(status.inbox_unread||0)});
  }
  res.json({ok:true,id:Number(rows[0].id)});
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
  const mediaRows = await pool.query(`SELECT provider,provider_id,resource_type,delivery_type FROM media WHERE user_id=$1 AND provider IN ('cloudinary','bunny_storage','bunny_stream') AND provider_id<>''`, [req.user.id]);
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
    SELECT a.id,a.name,a.creative_type,a.image_url,a.image_provider,a.image_provider_id,a.image_resource_type,a.mobile_image_url,a.mobile_image_provider,a.mobile_image_provider_id,a.mobile_image_resource_type,a.link_url,a.google_code,a.alt_text,a.alt_text_en,a.display_title,a.display_title_en,a.display_text,a.display_text_en,a.button_text,a.button_text_en,a.placements,a.profile_mode
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
    image_url:device==='mobile' && row.mobile_image_url ? adDisplayUrl(row,true) : adDisplayUrl(row,false),
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
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND COALESCE(social_hidden,FALSE)=FALSE) AS users,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND account_status='suspended') AS suspended_users,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS posts,
      (SELECT COUNT(*)::int FROM comments c JOIN users u ON u.id=c.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS comments,
      (SELECT COUNT(*)::int FROM reports WHERE status='open') AS open_reports,
      (SELECT COUNT(*)::int FROM reports WHERE status='reviewing') AS reviewing_reports,
      (SELECT COUNT(*)::int FROM reports WHERE status='closed') AS closed_reports,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND created_at >= NOW()-INTERVAL '7 days') AS new_users_7d,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND p.created_at >= NOW()-INTERVAL '7 days') AS new_posts_7d
  `);
  res.json(rows[0]);
}));

app.get('/api/admin/launch-dashboard', auth, adminOnly, asyncRoute(async (_req,res) => {
  const settings = await getLaunchSettings();
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND COALESCE(social_hidden,FALSE)=FALSE) AS users_total,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND email_verified_at IS NOT NULL) AS users_verified,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND created_at >= NOW()-INTERVAL '24 hours') AS users_new_24h,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND created_at >= NOW()-INTERVAL '7 days') AS users_new_7d,
      (SELECT COUNT(DISTINCT ae.user_id)::int FROM app_events ae JOIN users u ON u.id=ae.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND ae.event_type='session_active' AND ae.created_at >= NOW()-INTERVAL '24 hours') AS active_24h,
      (SELECT COUNT(DISTINCT ae.user_id)::int FROM app_events ae JOIN users u ON u.id=ae.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND ae.event_type='session_active' AND ae.created_at >= NOW()-INTERVAL '7 days') AS active_7d,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND COALESCE(NULLIF(TRIM(avatar),''),'') <> '') AS users_with_avatar,
      (SELECT COUNT(DISTINCT p.user_id)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS users_with_post,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS posts_total,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND p.created_at >= NOW()-INTERVAL '24 hours') AS posts_24h,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND p.created_at >= NOW()-INTERVAL '7 days') AS posts_7d,
      (SELECT COUNT(*)::int FROM stories s JOIN users u ON u.id=s.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND s.expires_at > NOW()) AS stories_active,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND p.media_type='video') AS reels_total,
      (SELECT COUNT(*)::int FROM messages m JOIN users u ON u.id=m.sender_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND m.created_at >= NOW()-INTERVAL '24 hours') AS messages_24h,
      (SELECT COUNT(*)::int FROM referral_attributions ra JOIN users u ON u.id=ra.invited_user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS referrals_total,
      (SELECT COUNT(*)::int FROM referral_attributions ra JOIN users u ON u.id=ra.invited_user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND ra.registered_at >= NOW()-INTERVAL '7 days') AS referrals_7d,
      (SELECT COUNT(*)::int FROM referral_attributions ra JOIN users u ON u.id=ra.invited_user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND ra.qualified_at IS NOT NULL) AS referrals_qualified,
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
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND COALESCE(social_hidden,FALSE)=FALSE) AS users_total,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=TRUE) AS demo_profiles,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND email_verified_at IS NOT NULL) AS users_verified,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND COALESCE(NULLIF(TRIM(avatar),''),'') <> '') AS users_with_avatar,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND COALESCE(social_hidden,FALSE)=FALSE AND ((COALESCE(NULLIF(TRIM(bio),''),'') <> '') OR (COALESCE(NULLIF(TRIM(headline),''),'') <> '') OR (COALESCE(NULLIF(TRIM(interests),''),'') <> ''))) AS users_profile_complete,
      (SELECT COUNT(DISTINCT p.user_id)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS users_with_post,
      (SELECT COUNT(DISTINCT f.follower_id)::int FROM follows f JOIN users u ON u.id=f.follower_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS users_following,
      (SELECT COUNT(DISTINCT ae.user_id)::int FROM app_events ae JOIN users u ON u.id=ae.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND ae.event_type='session_active' AND ae.created_at >= NOW()-INTERVAL '7 days') AS active_7d,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS posts_total,
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
    { id:'media', label:'Multimedia externa', ok:bunnyStorageConfigured() && bunnyStreamConfigured(), level:'blocker', detail:bunnyStorageConfigured() && bunnyStreamConfigured()?'Bunny Storage + Bunny Stream activos.':cloudinaryConfigured()?'Cloudinary solo conserva compatibilidad con archivos antiguos; faltan credenciales Bunny para nuevas subidas.':'Configura Bunny Storage y Bunny Stream.' },
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


// Comunidad virtual identificada: no cuenta como usuario real en métricas; los perfiles públicos elegibles sí participan en SEO con divulgación explícita.
app.get('/api/admin/virtual-community', auth, adminOnly, asyncRoute(async (req,res) => {
  const [status,profiles,inbox,packs,recentActivity,recentInteractions,massImports]=await Promise.all([
    virtualCommunityStatus(pool),
    listVirtualProfiles(pool,{limit:Number(req.query?.limit||24),q:req.query?.q||''}),
    virtualInbox(pool,{limit:30}),
    virtualPackStatus(pool),
    virtualActivityHistory(pool,{limit:24}),
    virtualInteractionHistory(pool,{limit:24}),
    massImportHistory(pool,{limit:8})
  ]);
  res.json({status:{...status,...packs},profiles,inbox,recent_activity:recentActivity,recent_interactions:recentInteractions,mass_imports:massImports,mass_import_max_zip_mb:MAX_VIRTUAL_MASS_ZIP_MB});
}));

app.post('/api/admin/virtual-community/seed', auth, adminOnly, asyncRoute(async (req,res) => {
  const result=await withTransaction(client=>createVirtualCommunity(client));
  const pilot=await syncPilotVirtualImages(pool).catch(err=>({installed:false,error:err.message}));
  const packs=await syncVirtualProfileBasePacks(pool,{includePilot:false}).catch(err=>({profiles:0,images:0,error:err.message}));
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'virtual_community_seed',$2)`,[req.user.id,JSON.stringify({...result,pilot,packs:{profiles:packs.profiles,images:packs.images}}).slice(0,1000)]);
  io.to('admins').emit('virtual-community:update',{type:'seed',...result,packs});
  res.json({ok:true,...result,pilot,packs});
}));

app.post('/api/admin/virtual-community/sync-image-packs', auth, adminOnly, asyncRoute(async (req,res) => {
  const result=await syncVirtualProfileBasePacks(pool,{includePilot:false});
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'virtual_pack_sync',$2)`,[req.user.id,JSON.stringify({profiles:result.profiles,images:result.images,created_media:result.created_media}).slice(0,1000)]);
  io.to('admins').emit('virtual-community:update',{type:'packs',profiles:result.profiles,images:result.images});
  res.json({ok:true,...result});
}));

app.post('/api/admin/virtual-community/import-realistic-packs', auth, adminOnly, virtualPackUpload.single('file'), asyncRoute(async (req,res) => {
  if(!req.file) return res.status(400).json({error:'Selecciona un ZIP con los packs realistas.',code:'VIRTUAL_PACK_FILE_REQUIRED'});
  const archiveName=String(req.file.originalname||'packs-realistas.zip').slice(0,180);
  const report=await importRealisticPackArchive({
    db:pool,
    withTransaction,
    archiveBuffer:req.file.buffer,
    archiveName,
    adminId:req.user.id,
    uploadMediaBuffer,
    imageUploadConfigured
  });
  await pool.query(`
    INSERT INTO virtual_profile_pack_imports(admin_id,batch_key,archive_name,archive_sha256,profiles_requested,profiles_imported,images_requested,images_imported,images_reused,partial,summary)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
  `,[req.user.id,report.batch,archiveName,report.archive_sha256,report.profiles_requested,report.profiles_imported,report.images_requested,report.images_imported,report.images_reused,Boolean(report.partial),JSON.stringify(report)]);
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'virtual_realistic_pack_import',$2)`,[req.user.id,JSON.stringify({batch:report.batch,profiles:report.profiles_imported,images:report.images_imported,reused:report.images_reused,errors:report.errors.length}).slice(0,1000)]);
  io.to('admins').emit('virtual-community:update',{type:'realistic-packs',profiles:report.profiles_imported,images:report.images_imported,partial:report.partial});
  const status=await virtualPackStatus(pool);
  res.json({ok:report.profiles_imported>0,report,status});
}));

app.get('/api/admin/virtual-community/realistic-pack-imports', auth, adminOnly, asyncRoute(async (_req,res) => {
  const {rows}=await pool.query(`SELECT id,batch_key,archive_name,profiles_requested,profiles_imported,images_requested,images_imported,images_reused,partial,created_at FROM virtual_profile_pack_imports ORDER BY id DESC LIMIT 20`);
  res.json({items:rows});
}));


// V1.12.42 · Importación masiva segura + resolución de carpetas por username.
// 1) upload -> 2) validación íntegra -> 3) staging remoto -> 4) preview -> 5) commit atómico.
app.post('/api/admin/virtual-community/mass-imports', auth, adminOnly, virtualMassUpload.single('file'), asyncRoute(async (req,res) => {
  if(!req.file) return res.status(400).json({error:'Selecciona un ZIP con las fotos de los 100 perfiles.',code:'VIRTUAL_MASS_FILE_REQUIRED'});
  const archiveName=String(req.file.originalname||'virtual-media.zip').slice(0,180);
  const prepared=await withTransaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock($1)',[MASS_IMPORT_ADVISORY_LOCK]);
    const active=await client.query(`SELECT id,status FROM virtual_media_import_jobs WHERE status=ANY($1::varchar[]) ORDER BY id DESC LIMIT 1`,[['uploaded','validating','staging','ready','committing','rolling_back','cancelling']]);
    if(active.rowCount) return {active:active.rows[0]};
    const jobId=await insertVirtualMassImportJob({db:client,adminId:req.user.id,archiveName,archivePath:req.file.path,archiveBytes:req.file.size});
    return {jobId};
  });
  if(prepared.active){await fs.promises.unlink(req.file.path).catch(()=>{});return res.status(409).json({error:`Ya hay una importación #${prepared.active.id} en estado ${prepared.active.status}. Confírmala o cancélala antes de subir otro ZIP.`,code:'VIRTUAL_MASS_ACTIVE_JOB',job_id:Number(prepared.active.id)});}
  const jobId=prepared.jobId;
  res.status(202).json({ok:true,job_id:jobId,status:'uploaded',max_zip_mb:MAX_VIRTUAL_MASS_ZIP_MB});
  setImmediate(()=>{
    void stageMassImportJob({
      db:pool,jobId,adminId:req.user.id,archivePath:req.file.path,archiveName,
      uploadMediaBuffer,imageUploadConfigured,
      onProgress:async(payload)=>{io.to('admins').emit('virtual-mass-import:progress',payload);}
    }).then(summary=>{
      io.to('admins').emit('virtual-mass-import:ready',{jobId,summary});
    }).catch(async err=>{
      console.error(`Importación masiva #${jobId}:`,err.message);
      await failMassImportJob({db:pool,jobId,error:err,archivePath:req.file.path,destroyAsset:destroyRemoteAsset});
      io.to('admins').emit('virtual-mass-import:failed',{jobId,error:String(err.message||err)});
    });
  });
}));

app.get('/api/admin/virtual-community/mass-imports', auth, adminOnly, asyncRoute(async (req,res) => {
  res.json({items:await massImportHistory(pool,{limit:Number(req.query?.limit||20)}),max_zip_mb:MAX_VIRTUAL_MASS_ZIP_MB});
}));

app.get('/api/admin/virtual-community/mass-imports/:id', auth, adminOnly, asyncRoute(async (req,res) => {
  const detail=await massImportJobDetail(pool,Number(req.params.id));
  if(!detail) return res.status(404).json({error:'Importación no encontrada',code:'VIRTUAL_MASS_NOT_FOUND'});
  const profiles=(detail.profiles||[]).map(profile=>{
    const images=Array.isArray(profile.images)?profile.images:[];
    const preview=images.slice(0,4).map(item=>({
      media_id:Number(item.media_id),kind:item.kind,source_path:item.source_path,reused:Boolean(item.reused),
      url:item.media_id?adminMediaPreviewUrl(Number(item.media_id),req.user.id):''
    }));
    return {user_id:Number(profile.user_id),username:profile.username,image_count:images.length,reused:images.filter(x=>x.reused).length,preview};
  });
  res.json({...detail,profiles,max_zip_mb:MAX_VIRTUAL_MASS_ZIP_MB});
}));

app.post('/api/admin/virtual-community/mass-imports/:id/commit', auth, adminOnly, asyncRoute(async (req,res) => {
  const result=await commitMassImportJob({db:pool,withTransaction,jobId:Number(req.params.id),adminId:req.user.id});
  io.to('admins').emit('virtual-mass-import:completed',{jobId:Number(req.params.id),...result});
  res.json({ok:true,...result});
}));

app.post('/api/admin/virtual-community/mass-imports/:id/rollback', auth, adminOnly, asyncRoute(async (req,res) => {
  const result=await rollbackMassImportJob({db:pool,withTransaction,jobId:Number(req.params.id),adminId:req.user.id});
  io.to('admins').emit('virtual-mass-import:rolled-back',{jobId:Number(req.params.id),...result});
  res.json({ok:true,...result});
}));

app.delete('/api/admin/virtual-community/mass-imports/:id', auth, adminOnly, asyncRoute(async (req,res) => {
  const result=await cancelMassImportJob({db:pool,jobId:Number(req.params.id),adminId:req.user.id,destroyAsset:destroyRemoteAsset});
  io.to('admins').emit('virtual-mass-import:cancelled',{jobId:Number(req.params.id)});
  res.json({ok:true,...result});
}));

app.post('/api/admin/virtual-community/run-activity', auth, adminOnly, asyncRoute(async (req,res) => {
  const result=await withTransaction(client=>runVirtualActivity(client,{force:Boolean(req.body?.force),limit:Number(req.body?.limit||36)}));
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'virtual_activity_run',$2)`,[req.user.id,JSON.stringify(result).slice(0,1000)]);
  io.to('admins').emit('virtual-community:update',{type:'activity',...result});
  res.json({ok:true,...result});
}));

app.post('/api/admin/virtual-community/reschedule', auth, adminOnly, asyncRoute(async (req,res) => {
  const result=await withTransaction(client=>rescheduleVirtualActivity(client,{limit:Number(req.body?.limit||100)}));
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'virtual_activity_reschedule',$2)`,[req.user.id,JSON.stringify(result).slice(0,1000)]);
  io.to('admins').emit('virtual-community:update',{type:'activity-reschedule',...result});
  res.json({ok:true,...result});
}));

app.post('/api/admin/virtual-community/run-interactions', auth, adminOnly, asyncRoute(async (req,res) => {
  const result=await withTransaction(client=>runVirtualInteractions(client,{force:Boolean(req.body?.force),limit:Number(req.body?.limit||12),onNotification:dispatchVirtualSocialNotification}));
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'virtual_interactions_run',$2)`,[req.user.id,JSON.stringify(result).slice(0,1000)]);
  io.to('admins').emit('virtual-community:update',{type:'interactions',...result});
  res.json({ok:true,...result});
}));

app.post('/api/admin/virtual-community/reschedule-interactions', auth, adminOnly, asyncRoute(async (req,res) => {
  const result=await withTransaction(client=>rescheduleVirtualInteractions(client,{limit:Number(req.body?.limit||100)}));
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'virtual_interactions_reschedule',$2)`,[req.user.id,JSON.stringify(result).slice(0,1000)]);
  io.to('admins').emit('virtual-community:update',{type:'interaction-reschedule',...result});
  res.json({ok:true,...result});
}));

app.patch('/api/admin/virtual-profiles/:userId', auth, adminOnly, asyncRoute(async (req,res) => {
  const userId=Number(req.params.userId);
  if(!Number.isSafeInteger(userId)||userId<=0) return res.status(400).json({error:'Perfil virtual inválido'});

  let stage='load';
  try {
    const current=await pool.query(`SELECT vp.*,u.username,u.account_status,u.social_hidden FROM virtual_profiles vp JOIN users u ON u.id=vp.user_id WHERE vp.user_id=$1 AND u.is_virtual=TRUE`,[userId]);
    if(!current.rowCount) return res.status(404).json({error:'Perfil virtual no encontrado'});
    const row=current.rows[0];
    const status=req.body?.status===undefined?row.status:String(req.body.status);
    if(!['active','paused','retired'].includes(status)) return res.status(400).json({error:'Estado no válido'});
    const autoPost=req.body?.auto_post_enabled===undefined?Boolean(row.auto_post_enabled):Boolean(req.body.auto_post_enabled);
    const replyEnabled=req.body?.reply_enabled===undefined?Boolean(row.reply_enabled):Boolean(req.body.reply_enabled);
    const autoInteract=req.body?.auto_interact_enabled===undefined?Boolean(row.auto_interact_enabled):Boolean(req.body.auto_interact_enabled);
    const interactionsPerDay=req.body?.interactions_per_day===undefined?Number(row.interactions_per_day||2):Math.min(4,Math.max(1,Number(req.body.interactions_per_day)||2));
    const postsPerWeek=req.body?.posts_per_week===undefined?Number(row.posts_per_week||3):Math.min(7,Math.max(1,Number(req.body.posts_per_week)||3));
    const retiring=status==='retired';

    // V1.12.30: operación principal deliberadamente mínima y fuera de una
    // transacción multi-tabla. Si una actualización auxiliar falla no impide
    // retirar/activar el perfil, evitando el 500 que aparecía en producción.
    stage='virtual-profile-status';
    const updated=await pool.query(`
      UPDATE virtual_profiles
         SET status=$2,
             auto_post_enabled=$3,
             reply_enabled=$4,
             posts_per_week=$5,
             auto_interact_enabled=$6,
             interactions_per_day=$7,
             next_auto_post_at=CASE
               WHEN $2='active' AND next_auto_post_at IS NULL THEN NOW()+INTERVAL '2 hours'
               ELSE next_auto_post_at
             END,
             next_auto_interact_at=CASE
               WHEN $2='active' AND $6=TRUE AND next_auto_interact_at IS NULL THEN NOW()+INTERVAL '3 hours'
               ELSE next_auto_interact_at
             END
       WHERE user_id=$1
       RETURNING *
    `,[userId,status,autoPost,replyEnabled,postsPerWeek,autoInteract,interactionsPerDay]);
    if(!updated.rowCount) return res.status(404).json({error:'Perfil virtual no encontrado'});

    stage='visibility';
    let visibilityUpdated=true;
    try {
      await pool.query(`UPDATE users SET social_hidden=$2 WHERE id=$1 AND is_virtual=TRUE`,[userId,retiring]);
    } catch(err) {
      visibilityUpdated=false;
      console.error(`V1.12.30 visibilidad perfil virtual #${userId}:`,err.message);
    }

    stage='audit';
    await pool.query(`INSERT INTO moderation_actions(admin_id,action,target_user_id,note) VALUES($1,'virtual_profile_update',$2,$3)`,[
      req.user.id,userId,JSON.stringify({status,auto_post_enabled:autoPost,auto_interact_enabled:autoInteract,reply_enabled:replyEnabled,posts_per_week:postsPerWeek,interactions_per_day:interactionsPerDay,visibility_updated:visibilityUpdated}).slice(0,1000)
    ]).catch(err=>console.error(`V1.12.30 auditoría perfil virtual #${userId}:`,err.message));

    io.to('admins').emit('virtual-community:update',{type:'profile-status',user_id:userId,status});
    return res.json({ok:true,profile:updated.rows[0],visibility:{social_hidden:retiring,updated:visibilityUpdated}});
  } catch(err) {
    console.error(`V1.12.30 error actualizando perfil virtual #${userId} en ${stage}:`,err);
    return res.status(500).json({
      error:'No se pudo actualizar el perfil virtual',
      code:'VIRTUAL_PROFILE_UPDATE_FAILED',
      stage,
      detail:String(err?.message||'Error desconocido').slice(0,240)
    });
  }
}));

function virtualPoolSnapshot(row={}) {
  return {
    id:Number(row.id||0),user_id:Number(row.user_id||0),media_id:Number(row.media_id||0),
    label:String(row.label||''),kind:String(row.kind||'post'),tags:Array.isArray(row.tags)?row.tags:normalizeVirtualImageTags(row.tags||[]),
    alt_text:String(row.alt_text||''),active:Boolean(row.active),featured:Boolean(row.featured),sort_order:Number(row.sort_order||0),
    times_used:Number(row.times_used||0),last_used_at:row.last_used_at||null,archived_at:row.archived_at||null,
    created_at:row.created_at||null,updated_at:row.updated_at||null
  };
}

async function logVirtualVisualAction(client,{adminId,userId,actionType,poolId=null,mediaId=null,before={},after={},reversible=true}) {
  const {rows}=await client.query(`
    INSERT INTO virtual_visual_actions(admin_id,user_id,action_type,pool_id,media_id,before_state,after_state,reversible,status,created_at)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,'applied',NOW()) RETURNING id
  `,[Number(adminId),Number(userId),String(actionType||'change').slice(0,32),poolId?Number(poolId):null,mediaId?Number(mediaId):null,JSON.stringify(before||{}),JSON.stringify(after||{}),Boolean(reversible)]);
  return Number(rows[0]?.id||0);
}

async function createVirtualManagerMedia({userId,file,adminId,sha256}) {
  const meta={virtual:true,synthetic:true,uploaded_by_admin:Number(adminId),image_system:'1.12.42',visual_manager:true,visual_sha256:String(sha256||'')};
  if(imageUploadConfigured()){
    const uploaded=await uploadMediaBuffer(file.buffer,{mimeType:file.mimetype,originalName:file.originalname,userId,privateDelivery:true});
    const inserted=await pool.query(`
      INSERT INTO media(user_id,mime_type,original_name,size_bytes,data,provider,provider_id,secure_url,resource_type,delivery_type,width,height,duration_seconds,format,migrated_at,provider_status,provider_meta)
      VALUES($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),$14,$15::jsonb) RETURNING id
    `,[userId,file.mimetype,file.originalname,uploaded.sizeBytes||file.size,uploaded.provider,uploaded.providerId,uploaded.secureUrl,uploaded.resourceType,uploaded.deliveryType||'',uploaded.width,uploaded.height,uploaded.durationSeconds,uploaded.format,uploaded.providerStatus||'ready',JSON.stringify(meta)]);
    return {mediaId:Number(inserted.rows[0].id),sha256:String(sha256||'')};
  }
  const inserted=await pool.query(`
    INSERT INTO media(user_id,mime_type,original_name,size_bytes,data,provider,provider_status,provider_meta,resource_type)
    VALUES($1,$2,$3,$4,$5,'postgresql','ready',$6::jsonb,'image') RETURNING id
  `,[userId,file.mimetype,file.originalname,file.size,file.buffer,JSON.stringify(meta)]);
  return {mediaId:Number(inserted.rows[0].id),sha256:String(sha256||'')};
}

async function virtualHashDuplicate(userId,sha256,{excludePoolId=0}={}) {
  if(!sha256) return null;
  const {rows}=await pool.query(`
    SELECT vpm.id,vpm.media_id,vpm.label
      FROM virtual_profile_media vpm JOIN media m ON m.id=vpm.media_id
     WHERE vpm.user_id=$1 AND vpm.active=TRUE AND vpm.archived_at IS NULL
       AND vpm.id<>$2
       AND COALESCE(NULLIF(m.provider_meta->>'visual_sha256',''),NULLIF(m.provider_meta->>'mass_import_sha256',''),NULLIF(m.provider_meta->>'realistic_sha256',''),'')=$3
     ORDER BY vpm.id LIMIT 1
  `,[Number(userId),Number(excludePoolId||0),String(sha256)]);
  return rows[0]||null;
}

async function virtualVisualManagerPayload(userId,adminId) {
  const found=await pool.query(`
    SELECT u.id,u.username,u.name,u.avatar,u.cover,u.location,u.headline,vp.status
      FROM users u LEFT JOIN virtual_profiles vp ON vp.user_id=u.id
     WHERE u.id=$1 AND u.is_virtual=TRUE LIMIT 1
  `,[Number(userId)]);
  if(!found.rowCount) return null;
  const profile=found.rows[0];
  const rawItems=await listVirtualProfileMedia(pool,userId,{includeArchived:true});
  const hashes=[...new Set(rawItems.map(x=>String(x.sha256||'')).filter(Boolean))];
  const duplicateMap=new Map();
  if(hashes.length){
    const dups=await pool.query(`
      WITH active_media AS (
        SELECT vpm.id,vpm.user_id,vpm.media_id,u.username,
               COALESCE(NULLIF(m.provider_meta->>'visual_sha256',''),NULLIF(m.provider_meta->>'mass_import_sha256',''),NULLIF(m.provider_meta->>'realistic_sha256',''),'') AS sha256
          FROM virtual_profile_media vpm
          JOIN media m ON m.id=vpm.media_id
          JOIN users u ON u.id=vpm.user_id
         WHERE u.is_virtual=TRUE AND vpm.active=TRUE AND vpm.archived_at IS NULL
      )
      SELECT sha256,COUNT(*)::int AS copies,COUNT(DISTINCT user_id)::int AS profiles,
             jsonb_agg(jsonb_build_object('pool_id',id,'user_id',user_id,'username',username,'media_id',media_id) ORDER BY user_id,id) AS matches
        FROM active_media
       WHERE sha256=ANY($1::text[]) AND sha256<>''
       GROUP BY sha256 HAVING COUNT(*)>1
    `,[hashes]);
    for(const row of dups.rows) duplicateMap.set(String(row.sha256),{copies:Number(row.copies||0),profiles:Number(row.profiles||0),matches:Array.isArray(row.matches)?row.matches:[]});
  }
  const avatarId=mediaIdFromStoredUrl(profile.avatar),coverId=mediaIdFromStoredUrl(profile.cover);
  const items=rawItems.map(row=>{
    const dup=duplicateMap.get(String(row.sha256||''));
    return {...row,
      id:Number(row.id),media_id:Number(row.media_id),post_refs:Number(row.post_refs||0),story_refs:Number(row.story_refs||0),
      preview_url:adminMediaPreviewUrl(row.media_id,adminId),
      is_current_avatar:Number(row.media_id)===Number(avatarId),is_current_cover:Number(row.media_id)===Number(coverId),
      duplicate_count:dup?Math.max(0,Number(dup.copies)-1):0,duplicate_profiles:dup?Number(dup.profiles):0,duplicate_matches:dup?.matches||[]
    };
  });
  const {rows:actions}=await pool.query(`
    SELECT a.id,a.action_type,a.pool_id,a.media_id,a.reversible,a.status,a.created_at,a.reverted_at,
           COALESCE(ad.username,'') AS admin_username,COALESCE(rv.username,'') AS reverted_by_username
      FROM virtual_visual_actions a
      LEFT JOIN users ad ON ad.id=a.admin_id LEFT JOIN users rv ON rv.id=a.reverted_by
     WHERE a.user_id=$1 ORDER BY a.id DESC LIMIT 30
  `,[Number(userId)]);
  const latestApplied=(await pool.query(`
    SELECT a.id,a.action_type,a.pool_id,a.media_id,a.reversible,a.status,a.created_at,a.reverted_at,
           COALESCE(ad.username,'') AS admin_username
      FROM virtual_visual_actions a LEFT JOIN users ad ON ad.id=a.admin_id
     WHERE a.user_id=$1 AND a.status='applied' ORDER BY a.id DESC LIMIT 1
  `,[Number(userId)])).rows[0]||null;
  return {
    profile:{...profile,id:Number(profile.id)},items,actions,
    last_action:latestApplied,
    summary:{
      total:items.length,active:items.filter(x=>x.active&&!x.archived_at).length,archived:items.filter(x=>!x.active||x.archived_at).length,
      post_images:items.filter(x=>x.active&&!x.archived_at&&x.kind==='post').length,
      duplicate_images:items.filter(x=>x.active&&!x.archived_at&&Number(x.duplicate_count||0)>0).length,
      post_refs:items.reduce((n,x)=>n+Number(x.post_refs||0),0),story_refs:items.reduce((n,x)=>n+Number(x.story_refs||0),0)
    }
  };
}


// V1.12.42 · Centro de calidad global para los 100 perfiles virtuales.
// Escaneo de solo lectura: no modifica fotos ni referencias. El objetivo es
// localizar problemas antes de que afecten a Descubrir, perfiles, posts o Stories.
async function virtualQualityCenterReport() {
  const started=Date.now();
  const {rows:profiles}=await pool.query(`
    SELECT u.id,u.username,u.name,u.avatar,u.cover,u.location,u.social_hidden,
           vp.status,vp.auto_post_enabled,vp.auto_interact_enabled
      FROM users u
      JOIN virtual_profiles vp ON vp.user_id=u.id
     WHERE u.is_virtual=TRUE
     ORDER BY u.id
  `);

  const {rows:mediaRows}=await pool.query(`
    WITH post_refs AS (
      SELECT user_id,media_id,COUNT(*)::int AS refs
        FROM posts WHERE media_id IS NOT NULL GROUP BY user_id,media_id
    ), story_refs AS (
      SELECT user_id,media_id,COUNT(*)::int AS refs
        FROM stories WHERE media_id IS NOT NULL GROUP BY user_id,media_id
    )
    SELECT vpm.id AS pool_id,vpm.user_id,vpm.media_id,vpm.kind,vpm.active,vpm.archived_at,
           vpm.label,vpm.sort_order,m.provider,m.provider_status,m.width,m.height,m.size_bytes,
           COALESCE(NULLIF(m.provider_meta->>'visual_sha256',''),NULLIF(m.provider_meta->>'mass_import_sha256',''),NULLIF(m.provider_meta->>'realistic_sha256',''),'') AS sha256,
           COALESCE(pr.refs,0)::int AS post_refs,COALESCE(sr.refs,0)::int AS story_refs
      FROM virtual_profile_media vpm
      JOIN users u ON u.id=vpm.user_id AND u.is_virtual=TRUE
      JOIN media m ON m.id=vpm.media_id
      LEFT JOIN post_refs pr ON pr.user_id=vpm.user_id AND pr.media_id=vpm.media_id
      LEFT JOIN story_refs sr ON sr.user_id=vpm.user_id AND sr.media_id=vpm.media_id
     ORDER BY vpm.user_id,vpm.id
  `);

  const {rows:brokenPostRows}=await pool.query(`
    SELECT p.user_id,COUNT(*)::int AS broken
      FROM posts p JOIN users u ON u.id=p.user_id AND u.is_virtual=TRUE
      LEFT JOIN media m ON m.id=p.media_id
     WHERE p.media_id IS NOT NULL AND (m.id IS NULL OR COALESCE(m.provider_status,'ready')<>'ready')
     GROUP BY p.user_id
  `);
  const {rows:brokenStoryRows}=await pool.query(`
    SELECT s.user_id,COUNT(*)::int AS broken
      FROM stories s JOIN users u ON u.id=s.user_id AND u.is_virtual=TRUE
      LEFT JOIN media m ON m.id=s.media_id
     WHERE s.media_id IS NOT NULL AND (m.id IS NULL OR COALESCE(m.provider_status,'ready')<>'ready')
     GROUP BY s.user_id
  `);
  const {rows:actionRows}=await pool.query(`
    SELECT user_id,COUNT(*) FILTER (WHERE status='applied')::int AS applied_changes,
           MAX(created_at) FILTER (WHERE status='applied') AS last_change_at
      FROM virtual_visual_actions GROUP BY user_id
  `).catch(()=>({rows:[]}));

  const brokenPosts=new Map(brokenPostRows.map(r=>[Number(r.user_id),Number(r.broken||0)]));
  const brokenStories=new Map(brokenStoryRows.map(r=>[Number(r.user_id),Number(r.broken||0)]));
  const actions=new Map(actionRows.map(r=>[Number(r.user_id),{applied:Number(r.applied_changes||0),last:r.last_change_at||null}]));
  const byUser=new Map();
  for(const row of mediaRows){
    const uid=Number(row.user_id);
    if(!byUser.has(uid)) byUser.set(uid,[]);
    byUser.get(uid).push({...row,pool_id:Number(row.pool_id),user_id:uid,media_id:Number(row.media_id),width:Number(row.width||0),height:Number(row.height||0),post_refs:Number(row.post_refs||0),story_refs:Number(row.story_refs||0)});
  }

  const hashGroups=new Map();
  for(const row of mediaRows){
    if(!row.active||row.archived_at||!String(row.sha256||'')) continue;
    const key=String(row.sha256);
    if(!hashGroups.has(key)) hashGroups.set(key,[]);
    hashGroups.get(key).push({user_id:Number(row.user_id),pool_id:Number(row.pool_id),media_id:Number(row.media_id)});
  }
  const duplicateStats=new Map();
  let duplicateGroups=0,duplicateImages=0;
  for(const group of hashGroups.values()){
    if(group.length<2) continue;
    duplicateGroups+=1; duplicateImages+=group.length;
    const users=[...new Set(group.map(x=>x.user_id))];
    for(const uid of users){
      const own=group.filter(x=>x.user_id===uid).length;
      const cur=duplicateStats.get(uid)||{groups:0,images:0,cross_profile_groups:0,same_profile_groups:0};
      cur.groups+=1;cur.images+=own;
      if(users.length>1) cur.cross_profile_groups+=1;
      if(own>1) cur.same_profile_groups+=1;
      duplicateStats.set(uid,cur);
    }
  }

  const results=[];
  let activeImagesTotal=0,archivedRefsTotal=0,lowResolutionTotal=0,brokenRefsTotal=0;
  for(const profile of profiles){
    const uid=Number(profile.id),items=byUser.get(uid)||[];
    const active=items.filter(x=>Boolean(x.active)&&!x.archived_at);
    const archived=items.filter(x=>!x.active||x.archived_at);
    const posts=active.filter(x=>String(x.kind)==='post');
    const currentAvatarId=mediaIdFromStoredUrl(profile.avatar),currentCoverId=mediaIdFromStoredUrl(profile.cover);
    const avatarItem=currentAvatarId?items.find(x=>x.media_id===currentAvatarId):null;
    const coverItem=currentCoverId?items.find(x=>x.media_id===currentCoverId):null;
    const nonReady=active.filter(x=>String(x.provider_status||'ready')!=='ready');
    const archivedRefs=archived.reduce((n,x)=>n+x.post_refs+x.story_refs,0);
    const missingHash=active.filter(x=>!String(x.sha256||'')).length;
    const lowResolution=active.filter(x=>{
      const w=Number(x.width||0),h=Number(x.height||0),kind=String(x.kind||'post');
      if(!w||!h) return false;
      if(kind==='avatar') return w<400||h<400;
      if(kind==='cover') return w<800||h<280;
      return Math.min(w,h)<600;
    });
    const brokenPostsCount=brokenPosts.get(uid)||0,brokenStoriesCount=brokenStories.get(uid)||0;
    const dup=duplicateStats.get(uid)||{groups:0,images:0,cross_profile_groups:0,same_profile_groups:0};
    const issueList=[];
    const add=(code,severity,title,detail,count=1)=>issueList.push({code,severity,title,detail,count:Number(count||1)});

    if(!String(profile.avatar||'').trim()) add('avatar_missing','critical','Sin avatar','El perfil no tiene avatar configurado.');
    else if(currentAvatarId&&!avatarItem) add('avatar_outside_pool','critical','Avatar fuera de la biblioteca','El avatar apunta a un medio que no pertenece al pool visual del perfil.');
    else if(avatarItem&&(!avatarItem.active||avatarItem.archived_at)) add('avatar_archived','critical','Avatar retirado','El avatar actual está archivado o inactivo.');
    else if(avatarItem&&String(avatarItem.provider_status||'ready')!=='ready') add('avatar_not_ready','critical','Avatar no disponible',`Proveedor: ${avatarItem.provider_status||'desconocido'}.`);
    if(avatarItem&&String(avatarItem.kind||'')!=='avatar') add('avatar_role_mismatch','warning','Rol de avatar incorrecto',`La imagen usada como avatar está marcada como ${avatarItem.kind||'sin rol'} en la biblioteca.`);

    if(!String(profile.cover||'').trim()) add('cover_missing','critical','Sin portada','El perfil no tiene portada configurada.');
    else if(currentCoverId&&!coverItem) add('cover_outside_pool','critical','Portada fuera de la biblioteca','La portada apunta a un medio que no pertenece al pool visual del perfil.');
    else if(coverItem&&(!coverItem.active||coverItem.archived_at)) add('cover_archived','critical','Portada retirada','La portada actual está archivada o inactiva.');
    else if(coverItem&&String(coverItem.provider_status||'ready')!=='ready') add('cover_not_ready','critical','Portada no disponible',`Proveedor: ${coverItem.provider_status||'desconocido'}.`);
    if(coverItem&&String(coverItem.kind||'')!=='cover') add('cover_role_mismatch','warning','Rol de portada incorrecto',`La imagen usada como portada está marcada como ${coverItem.kind||'sin rol'} en la biblioteca.`);

    if(active.length<3) add('active_images_critical','critical','Muy pocas imágenes',`Solo hay ${active.length} imágenes activas; el mínimo operativo es 3.`,active.length);
    else if(active.length<6) add('active_images_low','warning','Pool visual incompleto',`Hay ${active.length} imágenes activas; se recomiendan al menos 6.`,active.length);
    if(posts.length<2) add('post_images_critical','critical','Sin variedad para publicaciones',`Solo hay ${posts.length} fotos de tipo post activas.`,posts.length);
    else if(posts.length<4) add('post_images_low','warning','Pocas fotos de publicación',`Hay ${posts.length} fotos de tipo post; se recomiendan 4 o más.`,posts.length);
    if(nonReady.length) add('media_not_ready','critical','Medios no disponibles',`${nonReady.length} imagen(es) activa(s) no están en estado ready.`,nonReady.length);
    if(brokenPostsCount+brokenStoriesCount) add('broken_historical_refs','critical','Referencias rotas',`${brokenPostsCount} posts y ${brokenStoriesCount} Stories apuntan a medios no disponibles.`,brokenPostsCount+brokenStoriesCount);
    if(dup.cross_profile_groups) add('duplicate_cross_profile','warning','Fotos repetidas entre perfiles',`${dup.cross_profile_groups} grupo(s) de duplicados exactos aparecen también en otros perfiles.`,dup.cross_profile_groups);
    if(dup.same_profile_groups) add('duplicate_same_profile','warning','Fotos repetidas en el mismo perfil',`${dup.same_profile_groups} grupo(s) duplicados dentro de este perfil.`,dup.same_profile_groups);
    if(lowResolution.length) add('low_resolution','warning','Resolución baja o anómala',`${lowResolution.length} imagen(es) están por debajo de los mínimos recomendados.`,lowResolution.length);
    if(archivedRefs) add('archived_referenced','warning','Archivadas todavía referenciadas',`${archivedRefs} referencia(s) histórica(s) siguen usando imágenes retiradas.`,archivedRefs);
    if(missingHash) add('hash_missing','notice','Sin huella de duplicados',`${missingHash} imagen(es) activas no tienen SHA-256 registrado y no pueden compararse con precisión.`,missingHash);
    if(Boolean(profile.auto_post_enabled)&&posts.length<4) add('auto_post_visual_risk','warning','Actividad automática con poca variedad','Los posts automáticos están activos pero el pool de publicación tiene poca variedad.');

    const critical=issueList.filter(x=>x.severity==='critical').length;
    const warnings=issueList.filter(x=>x.severity==='warning').length;
    const notices=issueList.filter(x=>x.severity==='notice').length;
    const status=critical?'critical':warnings?'warning':'ok';
    const score=Math.max(0,100-(critical*24)-(warnings*7)-(notices*2));
    const actionInfo=actions.get(uid)||{applied:0,last:null};
    activeImagesTotal+=active.length;archivedRefsTotal+=archivedRefs;lowResolutionTotal+=lowResolution.length;brokenRefsTotal+=brokenPostsCount+brokenStoriesCount;
    results.push({
      id:uid,username:profile.username,name:profile.name,avatar:profile.avatar,cover:profile.cover,location:profile.location,
      profile_status:profile.status,auto_post_enabled:Boolean(profile.auto_post_enabled),auto_interact_enabled:Boolean(profile.auto_interact_enabled),
      quality_status:status,quality_score:score,critical_issues:critical,warning_issues:warnings,notice_issues:notices,issues:issueList,
      active_images:active.length,archived_images:archived.length,post_images:posts.length,low_resolution_images:lowResolution.length,
      archived_refs:archivedRefs,broken_refs:brokenPostsCount+brokenStoriesCount,missing_hash_images:missingHash,
      duplicate_groups:Number(dup.groups||0),duplicate_images:Number(dup.images||0),visual_changes:Number(actionInfo.applied||0),last_visual_change_at:actionInfo.last||null
    });
  }

  results.sort((a,b)=>{
    const rank={critical:0,warning:1,ok:2};
    return (rank[a.quality_status]-rank[b.quality_status]) || (a.quality_score-b.quality_score) || a.username.localeCompare(b.username);
  });
  const criticalProfiles=results.filter(x=>x.quality_status==='critical').length;
  const warningProfiles=results.filter(x=>x.quality_status==='warning').length;
  const healthyProfiles=results.filter(x=>x.quality_status==='ok').length;
  return {
    generated_at:new Date().toISOString(),scan_ms:Date.now()-started,
    summary:{profiles:results.length,healthy_profiles:healthyProfiles,warning_profiles:warningProfiles,critical_profiles:criticalProfiles,
      active_images:activeImagesTotal,duplicate_groups:duplicateGroups,duplicate_images:duplicateImages,low_resolution_images:lowResolutionTotal,
      archived_refs:archivedRefsTotal,broken_refs:brokenRefsTotal},
    profiles:results
  };
}

async function restoreVirtualPoolSnapshot(client,snap={}) {
  if(!snap?.id) return 0;
  const q=await client.query(`
    UPDATE virtual_profile_media
       SET label=$3,kind=$4,tags=$5::jsonb,alt_text=$6,active=$7,featured=$8,sort_order=$9,times_used=$10,
           last_used_at=$11,archived_at=$12,updated_at=NOW()
     WHERE id=$1 AND user_id=$2
  `,[Number(snap.id),Number(snap.user_id),String(snap.label||''),safeVirtualImageKind(snap.kind||'post'),JSON.stringify(normalizeVirtualImageTags(snap.tags||[])),String(snap.alt_text||''),Boolean(snap.active),Boolean(snap.featured),Number(snap.sort_order||0),Number(snap.times_used||0),snap.last_used_at||null,snap.archived_at||null]);
  return q.rowCount||0;
}

app.get('/api/admin/virtual-community/quality', auth, adminOnly, asyncRoute(async (req,res) => {
  const report=await virtualQualityCenterReport();
  res.json(report);
}));

app.get('/api/admin/virtual-profiles/:userId/media', auth, adminOnly, asyncRoute(async (req,res) => {
  const userId=Number(req.params.userId);
  if(!Number.isSafeInteger(userId)||userId<=0) return res.status(400).json({error:'Perfil virtual inválido'});
  const payload=await virtualVisualManagerPayload(userId,req.user.id);
  if(!payload) return res.status(404).json({error:'Perfil virtual no encontrado'});
  res.json(payload);
}));

app.post('/api/admin/virtual-profiles/:userId/media', auth, adminOnly, upload.single('file'), asyncRoute(async (req,res) => {
  const userId=Number(req.params.userId);
  if(!Number.isSafeInteger(userId)||userId<=0) return res.status(400).json({error:'Perfil virtual inválido'});
  if(!req.file) return res.status(400).json({error:'Falta una imagen'});
  if(!String(req.file.mimetype||'').startsWith('image/')) return res.status(400).json({error:'Solo se admiten imágenes en el pool del perfil virtual'});
  if(Number(req.file.size||0)>MAX_IMAGE_UPLOAD_BYTES) return res.status(413).json({error:'La imagen supera el límite de 10 MB'});
  const target=await pool.query(`SELECT id,username,name,avatar,cover FROM users WHERE id=$1 AND is_virtual=TRUE`,[userId]);
  if(!target.rowCount) return res.status(404).json({error:'Perfil virtual no encontrado'});
  const sha256=crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const duplicate=await virtualHashDuplicate(userId,sha256);
  if(duplicate) return res.status(409).json({error:`Esta foto ya existe en el perfil (${duplicate.label||`imagen #${duplicate.id}`}).`,code:'VIRTUAL_VISUAL_DUPLICATE'});
  const kind=safeVirtualImageKind(req.body?.kind||((String(req.body?.use_as_avatar||'').toLowerCase()==='true')?'avatar':((String(req.body?.use_as_cover||'').toLowerCase()==='true')?'cover':'post')));
  const tags=normalizeVirtualImageTags(req.body?.tags||[]);
  const label=String(req.body?.label||req.file.originalname||'Foto').trim().slice(0,120);
  const altText=String(req.body?.alt_text||`${target.rows[0].name} · ${label}`).trim().slice(0,300);
  const featured=String(req.body?.featured||'').toLowerCase()==='true';
  let mediaId=0;
  try{
    mediaId=(await createVirtualManagerMedia({userId,file:req.file,adminId:req.user.id,sha256})).mediaId;
    const result=await withTransaction(async client=>{
      const currentUser=(await client.query(`SELECT id,avatar,cover FROM users WHERE id=$1 AND is_virtual=TRUE FOR UPDATE`,[userId])).rows[0];
      if(!currentUser) throw Object.assign(new Error('Perfil virtual no encontrado'),{status:404});
      let sortOrder=kind==='avatar'?0:kind==='cover'?1:100;
      if(kind==='post'){
        const seq=await client.query(`SELECT COALESCE(MAX(sort_order),0)::int AS max_order FROM virtual_profile_media WHERE user_id=$1 AND kind='post' AND active=TRUE AND archived_at IS NULL`,[userId]);
        sortOrder=Math.max(10,Number(seq.rows[0]?.max_order||0)+10);
      }
      const pooled=await client.query(`
        INSERT INTO virtual_profile_media(user_id,media_id,label,kind,tags,alt_text,active,featured,sort_order,updated_at)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,TRUE,$7,$8,NOW()) RETURNING *
      `,[userId,mediaId,label,kind,JSON.stringify(tags),altText,featured,sortOrder]);
      const useAvatar=kind==='avatar'||String(req.body?.use_as_avatar||'').toLowerCase()==='true';
      const useCover=kind==='cover'||String(req.body?.use_as_cover||'').toLowerCase()==='true';
      if(useAvatar) await client.query(`UPDATE users SET avatar=$2 WHERE id=$1`,[userId,`/media/${mediaId}`]);
      if(useCover) await client.query(`UPDATE users SET cover=$2 WHERE id=$1`,[userId,`/media/${mediaId}`]);
      const before={avatar:currentUser.avatar,cover:currentUser.cover};
      const after={pool:virtualPoolSnapshot(pooled.rows[0]),avatar:useAvatar?`/media/${mediaId}`:currentUser.avatar,cover:useCover?`/media/${mediaId}`:currentUser.cover};
      const actionId=await logVirtualVisualAction(client,{adminId:req.user.id,userId,actionType:'upload',poolId:pooled.rows[0].id,mediaId,before,after,reversible:true});
      return {poolItem:pooled.rows[0],actionId};
    });
    await pool.query(`INSERT INTO moderation_actions(admin_id,action,target_user_id,note) VALUES($1,'virtual_visual_upload',$2,$3)`,[req.user.id,userId,JSON.stringify({media_id:mediaId,pool_id:result.poolItem.id,kind,sha256}).slice(0,1000)]).catch(()=>{});
    io.to('admins').emit('virtual-community:update',{type:'visual-upload',user_id:userId});
    res.json({ok:true,media_id:mediaId,pool_item:result.poolItem,action_id:result.actionId});
  }catch(err){
    if(mediaId) await cleanupMediaIfUnused(mediaId).catch(()=>{});
    throw err;
  }
}));

app.post('/api/admin/virtual-profiles/:userId/media/reorder', auth, adminOnly, asyncRoute(async (req,res) => {
  const userId=Number(req.params.userId);
  const poolIds=Array.isArray(req.body?.pool_ids)?req.body.pool_ids.map(Number).filter(Number.isSafeInteger):[];
  if(!Number.isSafeInteger(userId)||userId<=0||!poolIds.length) return res.status(400).json({error:'Orden de imágenes no válido'});
  if(new Set(poolIds).size!==poolIds.length) return res.status(400).json({error:'El orden contiene imágenes repetidas'});
  const result=await withTransaction(async client=>{
    const rows=(await client.query(`SELECT * FROM virtual_profile_media WHERE user_id=$1 AND kind='post' AND active=TRUE AND archived_at IS NULL ORDER BY sort_order,id FOR UPDATE`,[userId])).rows;
    const currentIds=rows.map(x=>Number(x.id));
    if(currentIds.length!==poolIds.length||currentIds.some(id=>!poolIds.includes(id))) throw Object.assign(new Error('La secuencia cambió. Recarga el editor antes de reordenar.'),{status:409});
    const before={orders:rows.map(x=>({id:Number(x.id),sort_order:Number(x.sort_order||0)}))};
    for(let i=0;i<poolIds.length;i++) await client.query(`UPDATE virtual_profile_media SET sort_order=$3,updated_at=NOW() WHERE id=$1 AND user_id=$2`,[poolIds[i],userId,10+(i*10)]);
    const after={orders:poolIds.map((id,i)=>({id,sort_order:10+(i*10)}))};
    const actionId=await logVirtualVisualAction(client,{adminId:req.user.id,userId,actionType:'reorder_posts',before,after,reversible:true});
    return {actionId};
  });
  io.to('admins').emit('virtual-community:update',{type:'visual-reorder',user_id:userId});
  res.json({ok:true,action_id:result.actionId});
}));

app.post('/api/admin/virtual-profiles/:userId/media/:poolId/replace', auth, adminOnly, upload.single('file'), asyncRoute(async (req,res) => {
  const userId=Number(req.params.userId),poolId=Number(req.params.poolId);
  if(!Number.isSafeInteger(userId)||!Number.isSafeInteger(poolId)||userId<=0||poolId<=0) return res.status(400).json({error:'Imagen virtual inválida'});
  if(!req.file||!String(req.file.mimetype||'').startsWith('image/')) return res.status(400).json({error:'Selecciona una imagen válida'});
  if(Number(req.file.size||0)>MAX_IMAGE_UPLOAD_BYTES) return res.status(413).json({error:'La imagen supera el límite de 10 MB'});
  const sha256=crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const oldCheck=await pool.query(`
    SELECT vpm.*,m.provider_meta,u.name,u.username
      FROM virtual_profile_media vpm JOIN media m ON m.id=vpm.media_id JOIN users u ON u.id=vpm.user_id
     WHERE vpm.id=$1 AND vpm.user_id=$2 AND u.is_virtual=TRUE LIMIT 1
  `,[poolId,userId]);
  if(!oldCheck.rowCount) return res.status(404).json({error:'Imagen no encontrada'});
  const oldHash=String(oldCheck.rows[0].provider_meta?.visual_sha256||oldCheck.rows[0].provider_meta?.mass_import_sha256||oldCheck.rows[0].provider_meta?.realistic_sha256||'');
  if(oldHash&&oldHash===sha256) return res.status(409).json({error:'La nueva imagen es exactamente igual a la actual.',code:'VIRTUAL_VISUAL_SAME_IMAGE'});
  const duplicate=await virtualHashDuplicate(userId,sha256,{excludePoolId:poolId});
  if(duplicate) return res.status(409).json({error:`La nueva foto ya existe en este perfil (${duplicate.label||`imagen #${duplicate.id}`}).`,code:'VIRTUAL_VISUAL_DUPLICATE'});
  const relinkHistory=String(req.body?.relink_history??'true').toLowerCase()!=='false';
  const archiveOld=String(req.body?.archive_old??'true').toLowerCase()!=='false';
  let mediaId=0;
  try{
    mediaId=(await createVirtualManagerMedia({userId,file:req.file,adminId:req.user.id,sha256})).mediaId;
    const result=await withTransaction(async client=>{
      const old=(await client.query(`SELECT vpm.*,u.avatar,u.cover FROM virtual_profile_media vpm JOIN users u ON u.id=vpm.user_id WHERE vpm.id=$1 AND vpm.user_id=$2 AND u.is_virtual=TRUE FOR UPDATE`,[poolId,userId])).rows[0];
      if(!old) throw Object.assign(new Error('Imagen no encontrada'),{status:404});
      const posts=(await client.query(`SELECT id FROM posts WHERE user_id=$1 AND media_id=$2 ORDER BY id FOR UPDATE`,[userId,Number(old.media_id)])).rows.map(x=>Number(x.id));
      const stories=(await client.query(`SELECT id FROM stories WHERE user_id=$1 AND media_id=$2 ORDER BY id FOR UPDATE`,[userId,Number(old.media_id)])).rows.map(x=>Number(x.id));
      const before={pool:virtualPoolSnapshot(old),avatar:old.avatar,cover:old.cover,post_ids:posts,story_ids:stories};
      const label=String(req.body?.label||old.label||req.file.originalname||'Foto').trim().slice(0,120);
      const altText=String(req.body?.alt_text||old.alt_text||`${oldCheck.rows[0].name} · ${label}`).trim().slice(0,300);
      const inserted=await client.query(`
        INSERT INTO virtual_profile_media(user_id,media_id,label,kind,tags,alt_text,active,featured,sort_order,times_used,last_used_at,updated_at)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,TRUE,$7,$8,$9,$10,NOW()) RETURNING *
      `,[userId,mediaId,label,safeVirtualImageKind(old.kind),JSON.stringify(normalizeVirtualImageTags(old.tags||[])),altText,Boolean(old.featured),Number(old.sort_order||100),Number(old.times_used||0),old.last_used_at||null]);
      const newPool=inserted.rows[0];
      const oldUrl=`/media/${Number(old.media_id)}`,newUrl=`/media/${mediaId}`;
      let avatar=old.avatar,cover=old.cover;
      if(String(old.avatar||'')===oldUrl){avatar=newUrl;await client.query(`UPDATE users SET avatar=$2 WHERE id=$1`,[userId,newUrl]);}
      if(String(old.cover||'')===oldUrl){cover=newUrl;await client.query(`UPDATE users SET cover=$2 WHERE id=$1`,[userId,newUrl]);}
      let postRefs=0,storyRefs=0;
      if(relinkHistory&&posts.length){const q=await client.query(`UPDATE posts SET media_id=$2 WHERE user_id=$1 AND id=ANY($3::bigint[]) AND media_id=$4`,[userId,mediaId,posts,Number(old.media_id)]);postRefs=q.rowCount||0;}
      if(relinkHistory&&stories.length){const q=await client.query(`UPDATE stories SET media_id=$2 WHERE user_id=$1 AND id=ANY($3::bigint[]) AND media_id=$4`,[userId,mediaId,stories,Number(old.media_id)]);storyRefs=q.rowCount||0;}
      if(relinkHistory&&(posts.length||stories.length)){
        await client.query(`
          UPDATE virtual_profile_media_usage
             SET virtual_profile_media_id=$3
           WHERE user_id=$1 AND virtual_profile_media_id=$2
             AND ((post_id IS NOT NULL AND post_id=ANY($4::bigint[])) OR (story_id IS NOT NULL AND story_id=ANY($5::bigint[])))
        `,[userId,poolId,Number(newPool.id),posts,stories]);
      }
      if(archiveOld) await client.query(`UPDATE virtual_profile_media SET active=FALSE,archived_at=COALESCE(archived_at,NOW()),updated_at=NOW() WHERE id=$1 AND user_id=$2`,[poolId,userId]);
      const after={new_pool:virtualPoolSnapshot(newPool),new_pool_id:Number(newPool.id),new_media_id:mediaId,old_pool_id:poolId,old_media_id:Number(old.media_id),avatar,cover,relink_history:relinkHistory,post_refs:postRefs,story_refs:storyRefs,old_archived:archiveOld};
      const actionId=await logVirtualVisualAction(client,{adminId:req.user.id,userId,actionType:'replace',poolId,mediaId,before,after,reversible:true});
      return {actionId,newPoolId:Number(newPool.id),postRefs,storyRefs};
    });
    await pool.query(`INSERT INTO moderation_actions(admin_id,action,target_user_id,note) VALUES($1,'virtual_visual_replace',$2,$3)`,[req.user.id,userId,JSON.stringify({pool_id:poolId,new_media_id:mediaId,sha256,relink_history:relinkHistory,post_refs:result.postRefs,story_refs:result.storyRefs}).slice(0,1000)]).catch(()=>{});
    io.to('admins').emit('virtual-community:update',{type:'visual-replace',user_id:userId});
    res.json({ok:true,action_id:result.actionId,new_pool_id:result.newPoolId,media_id:mediaId,post_refs:result.postRefs,story_refs:result.storyRefs});
  }catch(err){
    if(mediaId) await cleanupMediaIfUnused(mediaId).catch(()=>{});
    throw err;
  }
}));

app.patch('/api/admin/virtual-profiles/:userId/media/:poolId', auth, adminOnly, asyncRoute(async (req,res) => {
  const userId=Number(req.params.userId),poolId=Number(req.params.poolId);
  if(!Number.isSafeInteger(userId)||!Number.isSafeInteger(poolId)||userId<=0||poolId<=0) return res.status(400).json({error:'Imagen virtual inválida'});
  const result=await withTransaction(async client=>{
    const current=await client.query(`SELECT * FROM virtual_profile_media WHERE id=$1 AND user_id=$2 FOR UPDATE`,[poolId,userId]);
    if(!current.rowCount) throw Object.assign(new Error('Imagen no encontrada'),{status:404});
    const row=current.rows[0],before=virtualPoolSnapshot(row);
    const kind=req.body?.kind===undefined?row.kind:safeVirtualImageKind(req.body.kind);
    const tags=req.body?.tags===undefined?(Array.isArray(row.tags)?row.tags:[]):normalizeVirtualImageTags(req.body.tags);
    const label=req.body?.label===undefined?row.label:String(req.body.label||'').trim().slice(0,120);
    const altText=req.body?.alt_text===undefined?row.alt_text:String(req.body.alt_text||'').trim().slice(0,300);
    const featured=req.body?.featured===undefined?Boolean(row.featured):Boolean(req.body.featured);
    const active=req.body?.active===undefined?Boolean(row.active):Boolean(req.body.active);
    const sortOrder=req.body?.sort_order===undefined?Number(row.sort_order||100):Math.max(0,Math.min(10000,Number(req.body.sort_order)||0));
    const {rows}=await client.query(`UPDATE virtual_profile_media SET label=$3,kind=$4,tags=$5::jsonb,alt_text=$6,featured=$7,active=$8,sort_order=$9,archived_at=CASE WHEN $8 THEN NULL ELSE COALESCE(archived_at,NOW()) END,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *`,[poolId,userId,label,kind,JSON.stringify(tags),altText,featured,active,sortOrder]);
    const after=virtualPoolSnapshot(rows[0]);
    const changed=JSON.stringify(before)!==JSON.stringify(after);
    const actionType=!before.active&&after.active?'restore':before.active&&!after.active?'archive':'edit_metadata';
    const actionId=changed?await logVirtualVisualAction(client,{adminId:req.user.id,userId,actionType,poolId,mediaId:Number(row.media_id),before:{pool:before},after:{pool:after},reversible:true}):0;
    return {item:rows[0],actionId};
  });
  res.json({ok:true,item:result.item,action_id:result.actionId});
}));

app.post('/api/admin/virtual-profiles/:userId/media/:poolId/use', auth, adminOnly, asyncRoute(async (req,res) => {
  const userId=Number(req.params.userId),poolId=Number(req.params.poolId);
  const role=String(req.body?.role||'').toLowerCase();
  if(!['avatar','cover'].includes(role)) return res.status(400).json({error:'Uso de imagen no válido'});
  const result=await withTransaction(async client=>{
    const found=await client.query(`SELECT vpm.*,u.avatar,u.cover FROM virtual_profile_media vpm JOIN users u ON u.id=vpm.user_id WHERE vpm.id=$1 AND vpm.user_id=$2 AND u.is_virtual=TRUE FOR UPDATE`,[poolId,userId]);
    if(!found.rowCount) throw Object.assign(new Error('Imagen no encontrada'),{status:404});
    const row=found.rows[0],mediaId=Number(row.media_id),before={pool:virtualPoolSnapshot(row),avatar:row.avatar,cover:row.cover};
    const updated=(await client.query(`UPDATE virtual_profile_media SET kind=$3,active=TRUE,archived_at=NULL,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *`,[poolId,userId,role])).rows[0];
    await client.query(`UPDATE users SET ${role}=$2 WHERE id=$1 AND is_virtual=TRUE`,[userId,`/media/${mediaId}`]);
    const after={pool:virtualPoolSnapshot(updated),avatar:role==='avatar'?`/media/${mediaId}`:row.avatar,cover:role==='cover'?`/media/${mediaId}`:row.cover};
    const actionId=await logVirtualVisualAction(client,{adminId:req.user.id,userId,actionType:role==='avatar'?'set_avatar':'set_cover',poolId,mediaId,before,after,reversible:true});
    return {mediaId,actionId};
  });
  io.to('admins').emit('virtual-community:update',{type:`visual-${role}`,user_id:userId});
  res.json({ok:true,role,media_id:result.mediaId,action_id:result.actionId});
}));

app.post('/api/admin/virtual-profiles/:userId/media/:poolId/archive', auth, adminOnly, asyncRoute(async (req,res) => {
  const userId=Number(req.params.userId),poolId=Number(req.params.poolId);
  const result=await withTransaction(async client=>{
    const found=await client.query(`SELECT vpm.*,u.avatar,u.cover FROM virtual_profile_media vpm JOIN users u ON u.id=vpm.user_id WHERE vpm.id=$1 AND vpm.user_id=$2 AND u.is_virtual=TRUE FOR UPDATE`,[poolId,userId]);
    if(!found.rowCount) throw Object.assign(new Error('Imagen no encontrada'),{status:404});
    const row=found.rows[0],localUrl=`/media/${row.media_id}`;
    if(row.avatar===localUrl||row.cover===localUrl) throw Object.assign(new Error('No puedes archivar el avatar o la portada actuales. Elige otra imagen primero.'),{status:409});
    const before=virtualPoolSnapshot(row);
    const updated=(await client.query(`UPDATE virtual_profile_media SET active=FALSE,archived_at=COALESCE(archived_at,NOW()),updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *`,[poolId,userId])).rows[0];
    const actionId=await logVirtualVisualAction(client,{adminId:req.user.id,userId,actionType:'archive',poolId,mediaId:Number(row.media_id),before:{pool:before},after:{pool:virtualPoolSnapshot(updated)},reversible:true});
    return {actionId};
  });
  res.json({ok:true,action_id:result.actionId});
}));

app.delete('/api/admin/virtual-profiles/:userId/media/:poolId', auth, adminOnly, asyncRoute(async (req,res) => {
  const userId=Number(req.params.userId),poolId=Number(req.params.poolId);
  const result=await withTransaction(async client=>{
    const found=await client.query(`SELECT vpm.*,u.avatar,u.cover FROM virtual_profile_media vpm JOIN users u ON u.id=vpm.user_id WHERE vpm.id=$1 AND vpm.user_id=$2 AND u.is_virtual=TRUE FOR UPDATE`,[poolId,userId]);
    if(!found.rowCount) throw Object.assign(new Error('Imagen no encontrada'),{status:404});
    const row=found.rows[0],mediaId=Number(row.media_id),localUrl=`/media/${mediaId}`;
    if(row.avatar===localUrl||row.cover===localUrl) throw Object.assign(new Error('No puedes borrar el avatar o la portada actuales. Elige otra imagen primero.'),{status:409});
    if(Boolean(row.active)&&!row.archived_at) throw Object.assign(new Error('Por seguridad, archiva primero la imagen antes de borrarla definitivamente.'),{status:409});
    await client.query(`DELETE FROM virtual_profile_media WHERE id=$1 AND user_id=$2`,[poolId,userId]);
    const actionId=await logVirtualVisualAction(client,{adminId:req.user.id,userId,actionType:'delete',poolId,mediaId,before:{pool:virtualPoolSnapshot(row)},after:{deleted:true},reversible:false});
    return {mediaId,actionId};
  });
  await cleanupMediaIfUnused(result.mediaId);
  res.json({ok:true,action_id:result.actionId});
}));

app.post('/api/admin/virtual-profiles/:userId/visual-actions/:actionId/rollback', auth, adminOnly, asyncRoute(async (req,res) => {
  const userId=Number(req.params.userId),actionId=Number(req.params.actionId);
  if(!Number.isSafeInteger(userId)||!Number.isSafeInteger(actionId)||userId<=0||actionId<=0) return res.status(400).json({error:'Cambio visual inválido'});
  const result=await withTransaction(async client=>{
    const latest=(await client.query(`SELECT * FROM virtual_visual_actions WHERE user_id=$1 AND status='applied' ORDER BY id DESC LIMIT 1 FOR UPDATE`,[userId])).rows[0];
    if(!latest) throw Object.assign(new Error('No hay cambios pendientes de deshacer.'),{status:409});
    if(Number(latest.id)!==actionId) throw Object.assign(new Error('Solo se puede deshacer el último cambio aplicado. Recarga el editor.'),{status:409});
    if(!latest.reversible) throw Object.assign(new Error('El último cambio no es reversible.'),{status:409});
    const before=latest.before_state||{},after=latest.after_state||{},type=String(latest.action_type||'');
    let restoredRefs=0;
    if(['edit_metadata','archive','restore'].includes(type)){
      await restoreVirtualPoolSnapshot(client,before.pool||{});
    }else if(type==='set_avatar'||type==='set_cover'){
      await restoreVirtualPoolSnapshot(client,before.pool||{});
      await client.query(`UPDATE users SET avatar=$2,cover=$3 WHERE id=$1 AND is_virtual=TRUE`,[userId,String(before.avatar||''),String(before.cover||'')]);
    }else if(type==='reorder_posts'){
      const orders=Array.isArray(before.orders)?before.orders:[];
      for(const item of orders) await client.query(`UPDATE virtual_profile_media SET sort_order=$3,updated_at=NOW() WHERE id=$1 AND user_id=$2`,[Number(item.id),userId,Number(item.sort_order||0)]);
    }else if(type==='replace'){
      await restoreVirtualPoolSnapshot(client,before.pool||{});
      await client.query(`UPDATE users SET avatar=$2,cover=$3 WHERE id=$1 AND is_virtual=TRUE`,[userId,String(before.avatar||''),String(before.cover||'')]);
      const oldMedia=Number(before.pool?.media_id||after.old_media_id||0),newMedia=Number(after.new_media_id||latest.media_id||0);
      const postIds=Array.isArray(before.post_ids)?before.post_ids.map(Number).filter(Boolean):[];
      const storyIds=Array.isArray(before.story_ids)?before.story_ids.map(Number).filter(Boolean):[];
      if(oldMedia&&newMedia&&postIds.length){const q=await client.query(`UPDATE posts SET media_id=$2 WHERE user_id=$1 AND id=ANY($3::bigint[]) AND media_id=$4`,[userId,oldMedia,postIds,newMedia]);restoredRefs+=q.rowCount||0;}
      if(oldMedia&&newMedia&&storyIds.length){const q=await client.query(`UPDATE stories SET media_id=$2 WHERE user_id=$1 AND id=ANY($3::bigint[]) AND media_id=$4`,[userId,oldMedia,storyIds,newMedia]);restoredRefs+=q.rowCount||0;}
      if(after.new_pool_id&&(postIds.length||storyIds.length)){
        await client.query(`
          UPDATE virtual_profile_media_usage
             SET virtual_profile_media_id=$3
           WHERE user_id=$1 AND virtual_profile_media_id=$2
             AND ((post_id IS NOT NULL AND post_id=ANY($4::bigint[])) OR (story_id IS NOT NULL AND story_id=ANY($5::bigint[])))
        `,[userId,Number(after.new_pool_id),Number(before.pool?.id||latest.pool_id||0),postIds,storyIds]);
      }
      if(after.new_pool_id) await client.query(`UPDATE virtual_profile_media SET active=FALSE,archived_at=COALESCE(archived_at,NOW()),updated_at=NOW() WHERE id=$1 AND user_id=$2`,[Number(after.new_pool_id),userId]);
    }else if(type==='upload'){
      await client.query(`UPDATE users SET avatar=$2,cover=$3 WHERE id=$1 AND is_virtual=TRUE`,[userId,String(before.avatar||''),String(before.cover||'')]);
      const newPoolId=Number(after.pool?.id||latest.pool_id||0);
      if(newPoolId) await client.query(`UPDATE virtual_profile_media SET active=FALSE,archived_at=COALESCE(archived_at,NOW()),updated_at=NOW() WHERE id=$1 AND user_id=$2`,[newPoolId,userId]);
    }else{
      throw Object.assign(new Error(`Este tipo de cambio no admite rollback (${type}).`),{status:409});
    }
    await client.query(`UPDATE virtual_visual_actions SET status='reverted',reverted_at=NOW(),reverted_by=$2 WHERE id=$1`,[actionId,req.user.id]);
    return {type,restoredRefs};
  });
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,target_user_id,note) VALUES($1,'virtual_visual_rollback',$2,$3)`,[req.user.id,userId,JSON.stringify({visual_action_id:actionId,action_type:result.type,restored_refs:result.restoredRefs}).slice(0,1000)]).catch(()=>{});
  io.to('admins').emit('virtual-community:update',{type:'visual-rollback',user_id:userId});
  res.json({ok:true,action_type:result.type,restored_refs:result.restoredRefs});
}));


app.get('/api/admin/virtual-conversations/:id/messages', auth, adminOnly, asyncRoute(async (req,res) => {
  const conversationId=Number(req.params.id);
  const conv=await pool.query(`SELECT c.id,c.user1_id,c.user2_id,CASE WHEN u1.is_virtual THEN u1.id ELSE u2.id END AS virtual_user_id,CASE WHEN u1.is_virtual THEN u2.id ELSE u1.id END AS real_user_id,CASE WHEN u1.is_virtual THEN u1.name ELSE u2.name END AS virtual_name,CASE WHEN u1.is_virtual THEN u1.username ELSE u2.username END AS virtual_username,CASE WHEN u1.is_virtual THEN u2.name ELSE u1.name END AS real_name,CASE WHEN u1.is_virtual THEN u2.username ELSE u1.username END AS real_username,CASE WHEN u1.is_virtual THEN vp.reply_enabled ELSE vp2.reply_enabled END AS reply_enabled FROM conversations c JOIN users u1 ON u1.id=c.user1_id JOIN users u2 ON u2.id=c.user2_id LEFT JOIN virtual_profiles vp ON vp.user_id=u1.id LEFT JOIN virtual_profiles vp2 ON vp2.user_id=u2.id WHERE c.id=$1 AND (u1.is_virtual=TRUE OR u2.is_virtual=TRUE) AND NOT(u1.is_virtual=TRUE AND u2.is_virtual=TRUE) LIMIT 1`,[conversationId]);
  if(!conv.rowCount) return res.status(404).json({error:'Conversación virtual no encontrada'});
  await pool.query(`UPDATE virtual_message_alerts SET seen_at=COALESCE(seen_at,NOW()) WHERE conversation_id=$1 AND replied_at IS NULL`,[conversationId]);
  const {rows}=await pool.query(`SELECT m.id,m.sender_id,m.text,m.media_id,m.media_type,m.created_at,u.username,u.name,u.avatar,COALESCE(u.is_virtual,FALSE) AS is_virtual,mm.provider AS media_provider,mm.provider_status AS media_provider_status FROM messages m JOIN users u ON u.id=m.sender_id LEFT JOIN media mm ON mm.id=m.media_id WHERE m.conversation_id=$1 ORDER BY m.created_at ASC,m.id ASC LIMIT 200`,[conversationId]);
  const data=conv.rows[0];
  res.json({conversation:data,messages:rows.map(r=>({...r,own:Number(r.sender_id)===Number(data.virtual_user_id),media_url:r.media_id&&!(String(r.media_provider||'')==='bunny_stream'&&String(r.media_provider_status||'')!=='ready')?protectedMediaUrl(r.media_id,req.user.id):''}))});
}));

app.post('/api/admin/virtual-conversations/:id/messages', auth, adminOnly, asyncRoute(async (req,res) => {
  const conversationId=Number(req.params.id);
  const text=String(req.body?.text||'').trim().slice(0,4000);
  if(!text) return res.status(400).json({error:'El mensaje está vacío'});
  const conv=await pool.query(`SELECT c.id,CASE WHEN u1.is_virtual THEN u1.id ELSE u2.id END AS virtual_user_id,CASE WHEN u1.is_virtual THEN u2.id ELSE u1.id END AS real_user_id,CASE WHEN u1.is_virtual THEN vp.reply_enabled ELSE vp2.reply_enabled END AS reply_enabled FROM conversations c JOIN users u1 ON u1.id=c.user1_id JOIN users u2 ON u2.id=c.user2_id LEFT JOIN virtual_profiles vp ON vp.user_id=u1.id LEFT JOIN virtual_profiles vp2 ON vp2.user_id=u2.id WHERE c.id=$1 AND (u1.is_virtual=TRUE OR u2.is_virtual=TRUE) AND NOT(u1.is_virtual=TRUE AND u2.is_virtual=TRUE) LIMIT 1`,[conversationId]);
  const item=conv.rows[0];
  if(!item) return res.status(404).json({error:'Conversación virtual no encontrada'});
  if(item.reply_enabled===false) return res.status(403).json({error:'Las respuestas están desactivadas para este perfil virtual'});
  const result=await withTransaction(async client=>{
    const inserted=await client.query(`INSERT INTO messages(conversation_id,sender_id,text,media_type) VALUES($1,$2,$3,'none') RETURNING id,created_at`,[conversationId,item.virtual_user_id,text]);
    await client.query(`UPDATE conversations SET updated_at=NOW() WHERE id=$1`,[conversationId]);
    await client.query(`UPDATE virtual_message_alerts SET seen_at=COALESCE(seen_at,NOW()),replied_at=NOW() WHERE conversation_id=$1 AND replied_at IS NULL`,[conversationId]);
    await client.query(`UPDATE users SET last_seen_at=NOW() WHERE id=$1`,[item.virtual_user_id]);
    return inserted.rows[0];
  });
  io.to(`user:${item.real_user_id}`).emit('message:new',{conversationId,messageId:Number(result.id),senderId:Number(item.virtual_user_id),text:text.slice(0,160),hasMedia:false,sharedPostId:null});
  const status=await virtualCommunityStatus(pool);
  io.to('admins').emit('virtual-inbox:resolved',{conversationId,unread:Number(status.inbox_unread||0)});
  res.json({ok:true,...result});
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
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE) AS members_total,
      (SELECT COUNT(*)::int FROM users WHERE is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE AND created_at>=NOW()-INTERVAL '7 days') AS members_7d,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND p.created_at>=NOW()-INTERVAL '7 days') AS posts_7d,
      (SELECT COUNT(DISTINCT p.user_id)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE) AS authors_total,
      (SELECT COUNT(*)::int FROM users u WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND u.account_status='active' AND COALESCE(u.social_hidden,FALSE)=FALSE AND COALESCE(NULLIF(TRIM(u.avatar),''),'')<>'' AND ((COALESCE(NULLIF(TRIM(u.bio),''),'')<>'') OR (COALESCE(NULLIF(TRIM(u.headline),''),'')<>'') OR (COALESCE(NULLIF(TRIM(u.interests),''),'')<>'')) AND EXISTS(SELECT 1 FROM posts p WHERE p.user_id=u.id) AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=u.id)) AS activated_members,
      (SELECT COUNT(DISTINCT ae.user_id)::int FROM app_events ae JOIN users u ON u.id=ae.user_id WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.social_hidden,FALSE)=FALSE AND ae.event_type='session_active' AND ae.created_at>=NOW()-INTERVAL '7 days') AS active_7d,
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


// --- V1.12.4: Growth Engine + atribución de procedencia -------------------
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
        COALESCE((SELECT SUM(teaser_views)::int FROM growth_campaign_daily WHERE campaign_id=$1),0) AS teaser_views,
        COALESCE((SELECT SUM(teaser_signup_clicks)::int FROM growth_campaign_daily WHERE campaign_id=$1),0) AS teaser_signup_clicks,
        (SELECT COUNT(*)::int FROM growth_campaign_attributions gca JOIN referral_attributions ra ON ra.invited_user_id=gca.user_id WHERE gca.campaign_id=$1 AND ra.gate_user_id IS NOT NULL) AS referred_signups,
        (SELECT COUNT(*)::int FROM friend_gate_sessions WHERE campaign_id=$1 AND completed_at IS NOT NULL) AS completed
    `,[row.id]);
    const {rows:sources}=await pool.query(`
      SELECT v.source,COUNT(*)::int AS visits,
        COALESCE((SELECT COUNT(*)::int FROM growth_campaign_attributions a WHERE a.campaign_id=$1 AND LOWER(COALESCE(NULLIF(a.source,''),'direct'))=LOWER(v.source)),0) AS registrations
      FROM growth_campaign_visits v WHERE v.campaign_id=$1
      GROUP BY v.source ORDER BY visits DESC,v.source ASC LIMIT 12
    `,[row.id]);
    const {rows:referrers}=await pool.query(`
      SELECT referrer_host,COUNT(*)::int AS visits
      FROM growth_campaign_visits
      WHERE campaign_id=$1 AND referrer_host<>''
      GROUP BY referrer_host ORDER BY visits DESC,referrer_host ASC LIMIT 8
    `,[row.id]);
    const {rows:devices}=await pool.query(`
      SELECT device_type,COUNT(*)::int AS visits
      FROM growth_campaign_visits WHERE campaign_id=$1
      GROUP BY device_type ORDER BY visits DESC
    `,[row.id]);
    const {rows:recentVisits}=await pool.query(`
      SELECT source,referrer_host,utm_source,utm_medium,utm_content,device_type,landing_path,visited_at
      FROM growth_campaign_visits WHERE campaign_id=$1
      ORDER BY visited_at DESC LIMIT 8
    `,[row.id]);
    const totalVisits=Number(mRows[0]?.visits || 0);
    const totalRegistrations=Number(mRows[0]?.registrations || 0);
    const detailedVisits=sources.reduce((sum,item)=>sum+Number(item.visits||0),0);
    const detailedRegistrations=sources.reduce((sum,item)=>sum+Number(item.registrations||0),0);
    if(totalVisits>detailedVisits || totalRegistrations>detailedRegistrations){
      sources.push({source:'histórico sin origen',visits:Math.max(0,totalVisits-detailedVisits),registrations:Math.max(0,totalRegistrations-detailedRegistrations),legacy:true});
    }
    campaigns.push({...row,link:growthCampaignLink(row),metrics:mRows[0] || {},sources,referrers,devices,recent_visits:recentVisits});
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
  res.json({campaigns,profiles,channels:['facebook','instagram','tiktok','whatsapp','google','email','other']});
}));

app.post('/api/admin/growth-campaigns', auth, adminOnly, asyncRoute(async (req,res) => {
  const name=String(req.body?.name || '').trim().slice(0,120);
  const channel=String(req.body?.channel || 'other').trim().toLowerCase();
  const username=String(req.body?.target_username || req.user.username || '').trim().replace(/^@/,'');
  const accessMessage=String(req.body?.access_message || '').trim().slice(0,220);
  const sourceTag=String(req.body?.source_tag || '').trim().slice(0,120);
  const publicTeaserEnabled=Boolean(req.body?.public_teaser_enabled);
  if(name.length<2) return res.status(400).json({error:'Escribe un nombre para la campaña'});
  if(!['facebook','instagram','tiktok','whatsapp','google','email','other'].includes(channel)) return res.status(400).json({error:'Canal no válido'});
  const targetResult=await pool.query(`SELECT id,username,name,invite_code,friend_gate_enabled,friend_gate_required_referrals FROM users WHERE LOWER(username)=LOWER($1) AND account_status='active' AND COALESCE(social_hidden,FALSE)=FALSE LIMIT 1`,[username]);
  const target=targetResult.rows[0];
  if(!target) return res.status(404).json({error:'Perfil destino no encontrado'});
  let slug=slugifyCampaign(`${name}-${channel}`);
  for(let i=0;i<6;i++){
    const exists=await pool.query(`SELECT 1 FROM growth_campaigns WHERE slug=$1 LIMIT 1`,[slug]);
    if(!exists.rowCount) break;
    slug=`${slugifyCampaign(`${name}-${channel}`).slice(0,43)}-${crypto.randomBytes(2).toString('hex')}`;
  }
  const {rows}=await pool.query(`INSERT INTO growth_campaigns(created_by,target_user_id,name,slug,channel,access_message,source_tag,public_teaser_enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[req.user.id,target.id,name,slug,channel,accessMessage,sourceTag,publicTeaserEnabled]);
  const row={...rows[0],target_username:target.username,target_name:target.name,target_invite_code:target.invite_code,target_gate_enabled:target.friend_gate_enabled,target_gate_required:target.friend_gate_required_referrals};
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,target_user_id,note) VALUES($1,'growth_campaign_create',$2,$3)`,[req.user.id,target.id,JSON.stringify({name,slug,channel,source_tag:sourceTag,has_access_message:Boolean(accessMessage),public_teaser_enabled:publicTeaserEnabled}).slice(0,1000)]);
  res.json({...row,link:growthCampaignLink(row)});
}));

app.patch('/api/admin/growth-campaigns/:id', auth, adminOnly, asyncRoute(async (req,res) => {
  const id=Number(req.params.id);
  if(!Number.isInteger(id)) return res.status(400).json({error:'Campaña inválida'});
  const currentResult=await pool.query(`SELECT * FROM growth_campaigns WHERE id=$1 LIMIT 1`,[id]);
  const current=currentResult.rows[0];
  if(!current) return res.status(404).json({error:'Campaña no encontrada'});
  const active=typeof req.body?.active==='boolean' ? Boolean(req.body.active) : Boolean(current.active);
  const accessMessage=req.body?.access_message===undefined ? String(current.access_message || '') : String(req.body.access_message || '').trim().slice(0,220);
  const sourceTag=req.body?.source_tag===undefined ? String(current.source_tag || '') : String(req.body.source_tag || '').trim().slice(0,120);
  const publicTeaserEnabled=typeof req.body?.public_teaser_enabled==='boolean' ? Boolean(req.body.public_teaser_enabled) : Boolean(current.public_teaser_enabled);
  const {rows}=await pool.query(`UPDATE growth_campaigns SET active=$2,access_message=$3,source_tag=$4,public_teaser_enabled=$5,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,active,accessMessage,sourceTag,publicTeaserEnabled]);
  const targetResult=await pool.query(`SELECT username,name,invite_code,friend_gate_enabled,friend_gate_required_referrals FROM users WHERE id=$1 LIMIT 1`,[rows[0].target_user_id]);
  const target=targetResult.rows[0] || {};
  const row={...rows[0],target_username:target.username,target_name:target.name,target_invite_code:target.invite_code,target_gate_enabled:target.friend_gate_enabled,target_gate_required:target.friend_gate_required_referrals};
  await pool.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'growth_campaign_update',$2)`,[req.user.id,JSON.stringify({id,active,source_tag:sourceTag,has_access_message:Boolean(accessMessage),public_teaser_enabled:publicTeaserEnabled}).slice(0,1000)]);
  res.json({...row,link:growthCampaignLink(row)});
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
  res.json({settings:settingsResult.rows[0] || {enabled:false},ads:rows.map(r=>({...r,image_display_url:adDisplayUrl(r,false),mobile_image_display_url:adDisplayUrl(r,true),targets:byAd.get(String(r.id))||[]}))});
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
  if(!imageUploadConfigured()) return res.status(503).json({error:'Configura Bunny Storage para subir imágenes. Cloudinary queda solo como compatibilidad de contenido antiguo.'});
  const uploaded=await uploadMediaBuffer(req.file.buffer,{mimeType:req.file.mimetype,originalName:req.file.originalname,userId:req.user.id});
  const previewUrl=uploaded.provider==='bunny_storage'
    ? remoteDeliveryUrl({provider:uploaded.provider,provider_id:uploaded.providerId,resource_type:'image',secure_url:uploaded.secureUrl},3600)
    : uploaded.secureUrl;
  res.json({url:uploaded.secureUrl,preview_url:previewUrl,provider:uploaded.provider,provider_id:uploaded.providerId,resource_type:uploaded.resourceType || 'image',width:uploaded.width,height:uploaded.height});
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
      COUNT(*) FILTER (WHERE provider='bunny_storage')::int AS bunny_storage,
      COUNT(*) FILTER (WHERE provider='bunny_stream')::int AS bunny_stream,
      COUNT(*) FILTER (WHERE provider='bunny_stream' AND provider_status<>'ready')::int AS bunny_processing,
      COUNT(*) FILTER (WHERE data IS NOT NULL)::int AS legacy_in_postgresql,
      COALESCE(SUM(octet_length(data)) FILTER (WHERE data IS NOT NULL),0)::bigint AS legacy_bytes
    FROM media
  `);
  res.json({ ...rows[0], ...mediaProviderSummary() });
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
     WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE
       AND ($1::text='' OR u.username ILIKE $2::text OR u.name ILIKE $2::text OR u.email ILIKE $2::text)
     ORDER BY u.created_at DESC
     LIMIT $3::int OFFSET $4::int
  `, params);
  const totalResult = await pool.query(`
    SELECT COUNT(*)::int AS total
      FROM users u
     WHERE u.is_demo=FALSE AND COALESCE(u.is_virtual,FALSE)=FALSE
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
       WHERE id=$1 AND is_demo=FALSE AND COALESCE(is_virtual,FALSE)=FALSE
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
       WHERE user_id=$1 AND provider IN ('cloudinary','bunny_storage','bunny_stream') AND provider_id<>''
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


async function updateBunnyStreamMediaStatus(providerId, statusCode=null, details=null) {
  if (!providerId) return;
  const code = Number(statusCode);
  const ready = code === 3 || code === 4 || Number(details?.encodeProgress || 0) >= 100;
  const failed = code === 5 || code === 8;
  const providerStatus = failed ? 'failed' : (ready ? 'ready' : 'processing');
  const meta = details ? {
    bunny_status: Number.isFinite(code) ? code : null,
    encode_progress: Number(details.encodeProgress || 0) || 0,
    available_resolutions: String(details.availableResolutions || ''),
    thumbnail: String(details.thumbnailFileName || ''),
    updated_at: new Date().toISOString()
  } : { bunny_status: Number.isFinite(code) ? code : null, updated_at:new Date().toISOString() };
  await pool.query(`
    UPDATE media
       SET provider_status=$2,
           provider_meta=COALESCE(provider_meta,'{}'::jsonb) || $3::jsonb,
           width=COALESCE(NULLIF($4,0),width),
           height=COALESCE(NULLIF($5,0),height),
           duration_seconds=COALESCE(NULLIF($6,0),duration_seconds),
           size_bytes=CASE WHEN $7::bigint>0 THEN LEAST($7::bigint,2147483647)::int ELSE size_bytes END
     WHERE provider='bunny_stream' AND provider_id=$1
  `,[String(providerId),providerStatus,JSON.stringify(meta),Number(details?.width||0),Number(details?.height||0),Number(details?.length||0),Number(details?.storageSize||0)]);
}

async function refreshBunnyStreamStatuses() {
  if (!bunnyStreamConfigured()) return;
  const { rows } = await pool.query(`
    SELECT provider_id FROM media
     WHERE provider='bunny_stream' AND provider_id<>'' AND provider_status IN ('processing','queued')
     ORDER BY id ASC LIMIT 20
  `);
  for (const row of rows) {
    try {
      const details = await getBunnyStreamVideo(row.provider_id);
      if (!details) continue;
      await updateBunnyStreamMediaStatus(row.provider_id, details.status, details);
    } catch (err) {
      console.warn(`Bunny Stream status ${row.provider_id}:`, err.message);
    }
  }
}

app.post('/api/bunny/stream/webhook', asyncRoute(async (req,res) => {
  const configuredSecret=String(process.env.BUNNY_STREAM_WEBHOOK_SECRET || '');
  const supplied=String(req.query.secret || '');
  if (!configuredSecret || !supplied) return res.status(404).end();
  const a=Buffer.from(configuredSecret), b=Buffer.from(supplied);
  if (a.length!==b.length || !crypto.timingSafeEqual(a,b)) return res.status(404).end();
  const libraryId=Number(req.body?.VideoLibraryId ?? req.body?.videoLibraryId);
  const guid=String(req.body?.VideoGuid ?? req.body?.videoGuid ?? '').trim();
  const status=Number(req.body?.Status ?? req.body?.status);
  if (!guid || !Number.isFinite(status)) return res.status(400).json({error:'Webhook Bunny inválido'});
  if (Number(process.env.BUNNY_STREAM_LIBRARY_ID || 0) && libraryId && libraryId!==Number(process.env.BUNNY_STREAM_LIBRARY_ID)) return res.status(404).end();
  await updateBunnyStreamMediaStatus(guid,status,null);
  res.json({ok:true});
}));

// V1.12.24 · Sitemap dinámico de perfiles que han activado la vista pública.
app.get('/sitemap-profiles.xml', asyncRoute(async (_req,res)=>{
  const {rows}=await pool.query(`
    SELECT u.username,u.created_at,MAX(p.created_at) FILTER (WHERE p.visibility='public') AS last_public_post
      FROM users u
      LEFT JOIN posts p ON p.user_id=u.id
     WHERE u.account_status='active'
       AND u.is_demo=FALSE
       AND COALESCE(u.social_hidden,FALSE)=FALSE
       AND COALESCE(u.account_private,FALSE)=FALSE
       AND COALESCE(u.public_profile_preview_enabled,FALSE)=TRUE
     GROUP BY u.id,u.username,u.created_at
     ORDER BY u.id ASC
     LIMIT 45000
  `);
  const urls=rows.map(row=>{
    const loc=`${APP_URL}/${encodeURIComponent(row.username)}`;
    const date=new Date(row.last_public_post || row.created_at || Date.now()).toISOString().slice(0,10);
    return `  <url><loc>${seoEscapeXml(loc)}</loc><lastmod>${date}</lastmod></url>`;
  }).join('\n');
  res.type('application/xml').set('Cache-Control','public, max-age=900, stale-while-revalidate=3600').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
}));

// Hub rastreable que crea enlaces internos a perfiles públicos.
app.get(['/perfiles','/perfiles/'], asyncRoute(async (_req,res)=>{
  const {rows}=await pool.query(`
    SELECT u.username,u.name,u.headline,u.bio,u.avatar,u.is_virtual,
           MAX(p.created_at) FILTER (WHERE p.visibility='public') AS last_public_post
      FROM users u
      LEFT JOIN posts p ON p.user_id=u.id
     WHERE u.account_status='active' AND u.is_demo=FALSE
       AND COALESCE(u.social_hidden,FALSE)=FALSE
       AND COALESCE(u.account_private,FALSE)=FALSE
       AND COALESCE(u.public_profile_preview_enabled,FALSE)=TRUE
     GROUP BY u.id,u.username,u.name,u.headline,u.bio,u.avatar,u.is_virtual
     ORDER BY last_public_post DESC NULLS LAST,u.id DESC
     LIMIT 120
  `);
  res.set('Cache-Control','public, max-age=300, stale-while-revalidate=900').send(seoProfilesHubHtml(rows));
}));

// HTML SEO real para /usuario. La SPA se carga después y conserva toda la interacción existente.
// Si el perfil no es público, devolvemos la app con noindex para evitar indexar datos privados o URLs sin contenido público.
app.get('/:username', asyncRoute(async (req,res,next)=>{
  const username=String(req.params.username || '').trim().replace(/^@/,'');
  const lower=username.toLowerCase();
  if(!/^[a-zA-Z0-9_.]{3,30}$/.test(username) || RESERVED_PROFILE_SLUGS.has(lower)) return next();
  const {rows}=await pool.query(`
    SELECT u.id,u.username,u.name,u.headline,u.bio,u.avatar,u.cover,u.invite_code,u.created_at,u.location,u.interests,u.is_virtual,
           vp.age AS virtual_age,u.account_private,u.public_profile_preview_enabled,
           (SELECT COUNT(*)::int FROM follows f WHERE f.followed_id=u.id) AS followers_count,
           (SELECT COUNT(*)::int FROM posts p2 WHERE p2.user_id=u.id AND p2.visibility='public') AS posts_count
      FROM users u
      LEFT JOIN virtual_profiles vp ON vp.user_id=u.id
     WHERE LOWER(u.username)=LOWER($1) AND u.account_status='active' AND u.is_demo=FALSE
       AND COALESCE(u.social_hidden,FALSE)=FALSE
     LIMIT 1
  `,[username]);
  const profile=rows[0];
  if(profile) await hydrateVirtualProfileDisplayCover(profile);
  const canIndex=Boolean(profile && !req.query?.campaign && !profile.account_private && profile.public_profile_preview_enabled);
  if(!canIndex){
    res.set('X-Robots-Tag','noindex, follow');
    res.set('Cache-Control','no-cache');
    return res.sendFile(path.join(publicDir,'index.html'));
  }
  const {rows:posts}=await pool.query(`
    SELECT p.id,p.text,p.created_at,p.repost_of_id,rp.text AS repost_text,
           CASE WHEN p.media_type='video' OR rp.media_type='video' THEN 'video'
                WHEN p.media_id IS NOT NULL OR NULLIF(TRIM(p.external_url),'') IS NOT NULL
                  OR rp.media_id IS NOT NULL OR NULLIF(TRIM(rp.external_url),'') IS NOT NULL
                  OR (p.media_type IS NOT NULL AND p.media_type<>'none')
                  OR (rp.media_type IS NOT NULL AND rp.media_type<>'none') THEN 'image'
                ELSE 'none' END AS seo_media_type,
           CASE WHEN p.media_id IS NOT NULL OR NULLIF(TRIM(p.external_url),'') IS NOT NULL
                  OR rp.media_id IS NOT NULL OR NULLIF(TRIM(rp.external_url),'') IS NOT NULL
                  OR (p.media_type IS NOT NULL AND p.media_type<>'none')
                  OR (rp.media_type IS NOT NULL AND rp.media_type<>'none') THEN TRUE ELSE FALSE END AS seo_has_media
      FROM posts p LEFT JOIN posts rp ON rp.id=p.repost_of_id AND rp.visibility='public'
     WHERE p.user_id=$1 AND p.visibility='public'
     ORDER BY p.id DESC LIMIT 12
  `,[profile.id]);
  res.set('Cache-Control','public, max-age=120, stale-while-revalidate=600').send(seoProfileServerHtml(profile,posts,profile));
}));

app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.use((err, req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') { const mass=String(req.originalUrl||'').includes('/virtual-community/mass-imports'); return res.status(413).json({ error: mass ? `El ZIP supera el límite máximo de ${MAX_VIRTUAL_MASS_ZIP_MB} MB.` : 'El archivo supera el límite máximo de 100 MB.', code:mass?'VIRTUAL_MASS_TOO_LARGE':'MEDIA_TOO_LARGE' }); }
  const status = err.status || 500;
  if (status >= 500) void operationalEvent({ userId:req.user?.id || null, eventType:'server_error', severity:'error', path:req.originalUrl || req.path || '', userAgent:req.get('user-agent') || '', metadata:{ message:String(err?.message || 'Error interno').slice(0,1000) } });
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message, code: status >= 500 ? 'SERVER_ERROR' : (err.code || '') });
});


async function hardenLegacyCloudinaryMedia() {
  if (!cloudinaryConfigured()) return;
  if (String(process.env.HARDEN_LEGACY_MEDIA_ON_START || 'false').toLowerCase() === 'false') return;
  const { rows } = await pool.query(`
    SELECT id,provider,provider_id,resource_type,delivery_type
    FROM media
    WHERE provider='cloudinary'
      AND provider_id<>''
      AND COALESCE(delivery_type,'upload') <> 'authenticated'
    ORDER BY id ASC
  `);
  if (!rows.length) return;
  console.log(`Protección multimedia V1.12.6: reforzando ${rows.length} recurso(s) heredado(s)...`);
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
  console.log(`Protección multimedia V1.12.6: ${ok} reforzado(s), ${failed} pendiente(s).`);
}

async function start() {
  await initDb();
  await recoverInterruptedMassImports(pool).then(n=>{if(n)console.log(`V1.12.42: ${n} importación(es) masiva(s) interrumpida(s) marcadas para reintento.`);}).catch(err=>console.error('Recuperación importador masivo:',err.message));
  await syncSystemAccounts();
  await repairLegacyVirtualCoverFrames().catch(err => console.error('V1.12.30 reparación de portadas virtuales:',err.message));
  await syncPilotVirtualImages(pool).catch(err => console.error('Virtual Profile Image System pilot:',err.message));
  await syncVirtualProfileBasePacks(pool,{includePilot:false}).catch(err => console.error('Virtual Profile Image Packs:',err.message));
  await pool.query(`DELETE FROM app_events WHERE created_at < NOW()-INTERVAL '90 days'`).catch(err => console.error('Limpieza app_events:',err.message));
  await pool.query(`DELETE FROM smart_email_log WHERE sent_at < NOW()-INTERVAL '120 days'`).catch(err => console.error('Limpieza smart_email_log:',err.message));
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Instant Admirers V1.12.42 en http://localhost:${PORT}`);
    void hardenLegacyCloudinaryMedia().catch(err => console.error('Protección multimedia heredada:', err.message));
    void refreshBunnyStreamStatuses().catch(err => console.error('Estado Bunny Stream:',err.message));
    const bunnyStatusTimer=setInterval(() => void refreshBunnyStreamStatuses().catch(err => console.error('Estado Bunny Stream:',err.message)),30000);
    bunnyStatusTimer.unref?.();
    // Comunidad virtual: actividad + interacción moderada, sin depender de cron externo.
    const runVirtualTick=()=>{
      void withTransaction(client=>runVirtualActivity(client,{force:false,limit:20})).catch(err=>console.error('Actividad virtual:',err.message));
      void withTransaction(client=>runVirtualInteractions(client,{force:false,limit:12,onNotification:dispatchVirtualSocialNotification})).catch(err=>console.error('Interacción virtual:',err.message));
    };
    setTimeout(runVirtualTick,15000).unref?.();
    const virtualActivityTimer=setInterval(runVirtualTick,30*60*1000);
    virtualActivityTimer.unref?.();

    // V1.12.38: resúmenes inteligentes y recuperación, en tandas pequeñas.
    const runSmartEmailTick=()=>void runSmartEmailCycle({limit:40}).then(result=>{
      if(result?.ok && (result.digests || result.recoveries)) console.log(`Emails inteligentes: ${result.digests} resumen(es), ${result.recoveries} recuperación(es)`);
    }).catch(err=>console.error('Emails inteligentes:',err.message));
    setTimeout(runSmartEmailTick,90*1000).unref?.();
    const smartEmailTimer=setInterval(runSmartEmailTick,30*60*1000);
    smartEmailTimer.unref?.();
  });
}

start().catch((err) => {
  console.error('No se pudo iniciar Instant Admirers:', err);
  process.exit(1);
});
