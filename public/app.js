// V1.12.14 · Full Image Viewer + Public Teaser Profile + Bunny Media + SEO + Growth Engine + Protección de contenido
const RESERVED_PROFILE_SLUGS = new Set([
  'api','media','assets','socket.io','legal','privacy','cookies','terms','community-guidelines','en','ciudades','guias',
  'favicon.ico','manifest.webmanifest','sw.js','offline.html','robots.txt','sitemap.xml','sitemap-core.xml','sitemap-landings.xml','login','register','logout','admin',
  'feed','reels','discover','search','messages','notifications','bookmarks','friends','settings','profile',
  'invite','invites','help','support','about'
]);


const landingGrowthCampaign = (() => {
  try {
    const raw=String(new URLSearchParams(location.search).get('campaign') || '').trim().toLowerCase();
    return /^[a-z0-9_-]{1,60}$/.test(raw) ? raw : '';
  } catch (_) { return ''; }
})();
let growthLandingTracked = false;

function currentGrowthCampaign() { return landingGrowthCampaign; }

function publicTeaserRequested() {
  try { return new URLSearchParams(location.search).get('preview') === '1'; }
  catch (_) { return false; }
}

function teaserCopy(es,en){ return window.IAI18N?.t?.(es,en) || es; }

function trackPublicTeaserEvent(eventName) {
  const campaign=currentGrowthCampaign();
  if(!campaign || !navigator.onLine) return;
  if(eventName==='view'){
    const key=`iaPublicTeaserView:${campaign}`;
    try { if(sessionStorage.getItem(key)) return; sessionStorage.setItem(key,'1'); } catch (_) {}
  }
  try {
    fetch('/api/growth/campaign/teaser-event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaign,event:eventName}),keepalive:true}).catch(()=>{});
  } catch (_) {}
}

function growthVisitContext() {
  try {
    const params=new URLSearchParams(location.search);
    let referrer='';
    try { referrer=document.referrer || ''; } catch (_) {}
    const width=Math.max(Number(window.innerWidth||0),Number(screen?.width||0));
    const deviceType=width && width<768 ? 'mobile' : (width && width<1100 ? 'tablet' : 'desktop');
    return {
      campaign:currentGrowthCampaign(),
      referrer,
      utm_source:String(params.get('utm_source')||'').slice(0,120),
      utm_medium:String(params.get('utm_medium')||'').slice(0,120),
      utm_campaign:String(params.get('utm_campaign')||'').slice(0,160),
      utm_content:String(params.get('utm_content')||'').slice(0,160),
      device_type:deviceType,
      landing_path:String(location.pathname||'/').slice(0,500)
    };
  } catch (_) { return {campaign:currentGrowthCampaign()}; }
}

function trackGrowthCampaignLanding() {
  const campaign=currentGrowthCampaign();
  if(!campaign || growthLandingTracked || !navigator.onLine) return;
  growthLandingTracked=true;
  try {
    fetch('/api/growth/campaign/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(growthVisitContext()),keepalive:true}).catch(()=>{});
  } catch (_) {}
}

function profileUsernameFromPath(pathname = location.pathname) {
  try {
    const parts = String(pathname || '/').split('/').filter(Boolean);
    if (parts.length !== 1) return '';
    const raw = decodeURIComponent(parts[0]).replace(/^@/, '').trim();
    if (!/^[a-zA-Z0-9_.]{3,30}$/.test(raw)) return '';
    if (RESERVED_PROFILE_SLUGS.has(raw.toLowerCase())) return '';
    return raw;
  } catch (_) { return ''; }
}

function profileUrl(username = '') {
  const clean = String(username).trim().replace(/^@/, '');
  return `${location.origin}/${encodeURIComponent(clean)}`;
}

function setProfileBrowserUrl(username, { replace = false } = {}) {
  const clean = String(username || '').trim().replace(/^@/, '');
  if (!clean) return;
  const next = `/${encodeURIComponent(clean)}`;
  if (location.pathname === next && !location.search) return;
  history[replace ? 'replaceState' : 'pushState']({ profile: clean }, '', next);
}

function setHomeBrowserUrl({ replace = false } = {}) {
  if (location.pathname === '/' && !location.search) return;
  history[replace ? 'replaceState' : 'pushState']({ view: 'feed' }, '', '/');
}

function rememberPendingProfile(username = '') {
  const clean = String(username || '').trim().replace(/^@/, '');
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(clean) || RESERVED_PROFILE_SLUGS.has(clean.toLowerCase())) return '';
  localStorage.setItem('pendingProfileUsername', clean);
  sessionStorage.setItem('pendingProfileUsername', clean);
  return clean;
}

function pendingProfileDestination() {
  return String(
    sessionStorage.getItem('pendingProfileUsername') ||
    localStorage.getItem('pendingProfileUsername') ||
    profileUsernameFromPath(location.pathname) ||
    ''
  ).trim();
}

function clearPendingProfileDestination() {
  localStorage.removeItem('pendingProfileUsername');
  sessionStorage.removeItem('pendingProfileUsername');
}

async function resolveDirectProfileUsername(username = '') {
  const clean = String(username || '').trim().replace(/^@/, '');
  if (!clean) return '';
  const data = await api('/api/public/profile/' + encodeURIComponent(clean), { timeout: 12000 });
  const canonical = String(data?.username || '').trim();
  if (canonical) rememberPendingProfile(canonical);
  return canonical;
}

function defaultProfileAccessMessage() {
  return window.IAI18N?.t?.(
    'Este perfil tiene acceso especial. Completa el reto para descubrir su contenido.',
    'This profile has special access. Complete the challenge to discover its content.'
  ) || 'Este perfil tiene acceso especial. Completa el reto para descubrir su contenido.';
}

async function loadPendingProfileAccessCard() {
  const username = pendingProfileDestination();
  const card = $('#directProfileAccessCard');
  if (!username || !card) return;
  try {
    const campaign=currentGrowthCampaign();
    const data = await api('/api/public/profile/' + encodeURIComponent(username) + (campaign ? '?campaign=' + encodeURIComponent(campaign) : ''), { timeout:12000 });
    const canonical = String(data?.username || username).trim();
    if (canonical) rememberPendingProfile(canonical);

    // V1.12.9 · Los enlaces válidos de Growth Engine presentan primero a la persona
    // que invita, tanto en Entrar como en Crear cuenta. El bloque vive fuera de
    // #authbox, así que no desaparece al cambiar de pestaña.
    if (data?.growth_campaign_preview && data?.profile_preview) {
      const preview=data.profile_preview || {};
      const displayName=String(preview.name || data.name || canonical).trim();
      const headline=String(preview.headline || '').trim();
      const bio=String(preview.bio || '').trim();
      const avatarUrl=String(preview.avatar || '').trim();
      const coverUrl=String(preview.cover || '').trim();
      const inviteDetected=Boolean(localStorage.getItem('pendingReferralCode'));
      const gateEnabled=Boolean(data?.friend_gate_enabled);
      const publicTeaserEnabled=Boolean(data?.public_teaser_enabled);
      const message=gateEnabled
        ? (String(data.access_message || data.friend_gate_message || '').trim() || defaultProfileAccessMessage())
        : '';

      card.className='profile-auth-preview-card';
      card.innerHTML=`
        <div class="profile-auth-preview-cover ${coverUrl ? 'has-cover' : ''} ${publicTeaserEnabled ? 'is-clickable' : ''}" ${publicTeaserEnabled ? `role="button" tabindex="0" aria-label="Ver perfil de ${escapeAttr(displayName)}" onclick="openPublicTeaserProfile('${escapeAttr(canonical)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openPublicTeaserProfile('${escapeAttr(canonical)}')}"` : ''}>
          ${coverUrl ? `<img src="${escapeAttr(coverUrl)}" alt="" decoding="async">` : ''}
          <div class="profile-auth-preview-shade"></div>
          <span class="profile-auth-preview-kicker">✦ Te han invitado a descubrir este perfil</span>
          ${publicTeaserEnabled ? '<span class="profile-auth-preview-open">Ver perfil →</span>' : ''}
        </div>
        <div class="profile-auth-preview-body">
          <div class="profile-auth-preview-avatar ${publicTeaserEnabled ? 'is-clickable' : ''}" ${publicTeaserEnabled ? `role="button" tabindex="0" aria-label="Ver perfil de ${escapeAttr(displayName)}" onclick="openPublicTeaserProfile('${escapeAttr(canonical)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openPublicTeaserProfile('${escapeAttr(canonical)}')}"` : ''}>
            ${avatarUrl ? `<img src="${escapeAttr(avatarUrl)}" alt="${escapeAttr(displayName)}" decoding="async">` : `<span>${escapeHtml(initials({name:displayName,username:canonical}))}</span>`}
          </div>
          <div class="profile-auth-preview-identity">
            <b>${escapeHtml(displayName)}</b>
            <small>@${escapeHtml(canonical)}</small>
          </div>
          ${headline ? `<p class="profile-auth-preview-headline user-content">${escapeHtml(headline)}</p>` : ''}
          ${bio ? `<p class="profile-auth-preview-bio user-content">${escapeHtml(bio)}</p>` : ''}
          ${gateEnabled ? `<div class="profile-auth-preview-access">
            <div class="profile-auth-preview-access-title"><span>🔒</span><b>Perfil exclusivo</b></div>
            <p class="profile-auth-message user-content">“${escapeHtml(message)}”</p>
          </div>` : ''}
          ${inviteDetected ? '<div class="profile-auth-invite">✓ Invitación detectada</div>' : ''}
        </div>`;
      return;
    }

    if (data?.friend_gate_enabled) {
      const message = String(data.access_message || data.friend_gate_message || '').trim() || defaultProfileAccessMessage();
      const inviteDetected = Boolean(localStorage.getItem('pendingReferralCode'));
      card.className = 'profile-auth-access-card';
      card.innerHTML = `
        <div class="profile-auth-access-head">
          <span class="profile-auth-lock">🔒</span>
          <span><small>Perfil exclusivo</small><b>@${escapeHtml(canonical)}</b></span>
        </div>
        <p class="profile-auth-message user-content">“${escapeHtml(message)}”</p>
        ${inviteDetected ? '<div class="profile-auth-invite">✓ Invitación detectada</div>' : ''}`;
      return;
    }
    card.className = 'invite-auth-note profile-direct-note';
    card.innerHTML = `<b>Perfil de @${escapeHtml(canonical)}</b><span>Inicia sesión o crea tu cuenta para entrar directamente en este perfil.</span>`;
  } catch (_) {
    // Conservamos el mensaje mínimo del primer render si la consulta pública falla.
  }
}

function renderPendingProfileError(username, error) {
  state.view = 'profile';
  state.profile = username;
  layout();
  const main = $('#main');
  if (!main) return;
  const notFound = Number(error?.status || 0) === 404;
  main.innerHTML = `<div class="card empty direct-profile-error"><div class="empty-icon">${notFound ? '⌕' : '!'}</div><h3>${notFound ? 'Este perfil no existe' : 'No se pudo abrir el perfil'}</h3><p>${notFound ? `No encontramos a @${escapeHtml(username)}. Comprueba que el nombre de usuario del enlace sea correcto.` : escapeHtml(error?.message || 'Inténtalo de nuevo.')}</p><div class="empty-actions"><button class="btn primary compact" onclick="retryPendingProfile('${escapeAttr(username)}')">Reintentar</button><button class="btn ghost compact" onclick="clearPendingProfileDestination();go('feed',{replace:true})">Ir a Inicio</button></div></div>`;
}

window.retryPendingProfile = async (username) => {
  rememberPendingProfile(username);
  try {
    const canonical = await resolveDirectProfileUsername(username);
    state.view = 'profile'; state.profile = canonical || username;
    layout();
    setProfileBrowserUrl(state.profile, { replace:true });
    await renderProfile(state.profile);
    clearPendingProfileDestination();
  } catch (e) {
    renderPendingProfileError(username, e);
  }
};

(() => {
  try {
    const params = new URLSearchParams(location.search);
    const ref = String(params.get('ref') || '').trim();
    const gate = String(params.get('gate') || '').trim();
    const pathProfile = profileUsernameFromPath(location.pathname);
    const legacyProfile = String(params.get('profile') || '').trim().replace(/^@/, '');
    const profile = pathProfile || legacyProfile;
    if (ref) localStorage.setItem('pendingReferralCode', ref);
    if (ref && gate) localStorage.setItem('pendingGateCode', gate);
    if (/^[a-zA-Z0-9_.]{3,30}$/.test(profile) && !RESERVED_PROFILE_SLUGS.has(profile.toLowerCase())) {
      rememberPendingProfile(profile);
      // Convierte enlaces antiguos ?profile=usuario al nuevo formato /usuario sin romper ref/invite.
      if (!pathProfile && legacyProfile && !params.get('action')) {
        params.delete('profile');
        const qs = params.toString();
        history.replaceState({ profile }, '', `/${encodeURIComponent(profile)}${qs ? '?' + qs : ''}`);
      }
    }
  } catch (_) {}
})();

const state = {
  token: localStorage.getItem('token') || '',
  me: null,
  view: 'feed',
  feedMode: localStorage.getItem('feedMode') || 'following',
  profile: null,
  profileData: null,
  search: '',
  busy: false,
  activeConversation: null,
  storyViewer: null,
  messagePoll: null,
  socket: null,
  replyTo: null,
  typingTimer: null,
  messageSending: false,
  chatAccess: null,
  requestCount: 0,
  sessionExpiring: false,
  pagination: {},
  infiniteObserver: null,
  mediaObserver: null,
  reelObserver: null,
  rightbarCache: null,
  launchStatus: { registration_mode:'open', invite_required:false, registration_paused:false, launch_phase:'prelaunch', cohort_target:100, banner_enabled:true, banner_text:'' },
  community: null,
  authMode: 'login'
};

function isSystemAccount() { return Boolean(state.me?.social_hidden); }

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// V1.5 · Instalación PWA
let deferredInstallPrompt = null;

function isStandaloneApp() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function updatePwaInstallUi() {
  const installed = isStandaloneApp();
  const available = !installed && (Boolean(deferredInstallPrompt) || isIosDevice());
  document.documentElement.classList.toggle('pwa-standalone', installed);
  document.body?.classList.toggle('pwa-install-available', available);
  document.querySelectorAll('[data-pwa-install-label]').forEach(el => {
    el.textContent = installed ? 'Instalada' : 'Instalar app';
    if ('disabled' in el) el.disabled = installed;
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updatePwaInstallUi();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updatePwaInstallUi();
  toast('Instant Admirers se ha instalado correctamente.');
  trackOperationalEvent('pwa_installed',{standalone:true});
});

window.installInstantAdmirers = async () => {
  if (isStandaloneApp()) { toast('Instant Admirers ya está instalada en este dispositivo.'); return; }
  if (deferredInstallPrompt) {
    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'accepted') toast('Instalando Instant Admirers…');
      updatePwaInstallUi();
      return;
    } catch (_) { updatePwaInstallUi(); }
  }
  if (isIosDevice()) {
    modal(`<div class="modal-head"><h3>Instalar Instant Admirers</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
      <div class="pwa-install-help"><div class="pwa-app-mark"><img src="/assets/brand/icon-192.png" alt=""></div><p>En iPhone o iPad puedes instalarla como una app.</p><ol><li>Pulsa <b>Compartir</b> en Safari.</li><li>Elige <b>Añadir a pantalla de inicio</b>.</li><li>Pulsa <b>Añadir</b>.</li></ol><small>Después se abrirá a pantalla completa desde su icono.</small></div>`);
    return;
  }
  modal(`<div class="modal-head"><h3>Instalar Instant Admirers</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="pwa-install-help"><div class="pwa-app-mark"><img src="/assets/brand/icon-192.png" alt=""></div><p>Tu navegador puede instalar Instant Admirers como aplicación.</p><p class="muted">Abre el menú del navegador y busca <b>Instalar aplicación</b> o <b>Añadir a pantalla de inicio</b>.</p></div>`);
};

function registerInstantAdmirersPwa() {
  updatePwaInstallUi();
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope:'/', updateViaCache:'none' });
      registration.update().catch(() => {});
      if (!window.__iaSwControllerListener) {
        window.__iaSwControllerListener = true;
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloading) return;
          reloading = true;
          location.reload();
        });
      }
    } catch (error) {
      console.warn('No se pudo registrar el service worker', error);
    }
  }, { once:true });
}

function renderOfflineLaunch() {
  $('#app').innerHTML = `<div class="offline-launch"><div class="offline-launch-card card">${brandLockup('big')}<div class="offline-launch-icon">⌁</div><h2>Estás sin conexión</h2><p>Instant Admirers está instalada y tu sesión se conserva. Conéctate a Internet para cargar perfiles, publicaciones y mensajes.</p><button class="btn primary" onclick="retryOfflineLaunch()">Reintentar</button><small>No hemos cerrado tu sesión.</small></div></div>`;
}
window.retryOfflineLaunch = () => {
  if (!navigator.onLine) return toast('Sigues sin conexión a Internet.', 'error');
  init();
};

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;
const MEDIA_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

function mediaValidationError(file) {
  if (!file) return '';
  const type = String(file.type || '');
  if (!type.startsWith('image/') && !type.startsWith('video/')) return 'Solo se permiten imágenes o vídeos.';
  const isVideo = type.startsWith('video/');
  const maxBytes = isVideo ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
  if (Number(file.size || 0) > maxBytes) {
    return isVideo ? 'El vídeo supera el límite de 100 MB.' : 'La imagen supera el límite de 10 MB.';
  }
  return '';
}

function validateMediaFile(file, input = null) {
  const error = mediaValidationError(file);
  if (!error) return true;
  toast(error, 'error');
  if (input) input.value = '';
  return false;
}

function prepareGalleryInput(inputId, allowVideo = true) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.removeAttribute('capture');
  input.accept = allowVideo ? 'image/*,video/*' : 'image/*';
}
window.prepareGalleryInput = prepareGalleryInput;

window.captureFromDevice = (inputId, kind = 'photo', facing = 'environment') => {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = '';
  input.accept = kind === 'video' ? 'video/*' : 'image/*';
  input.setAttribute('capture', facing === 'user' ? 'user' : 'environment');
  input.click();
};

async function uploadMediaFile(file) {
  const error = mediaValidationError(file);
  if (error) throw new Error(error);
  const fd = new FormData();
  fd.append('file', file);
  return api('/api/upload', { method:'POST', body:fd, timeout:MEDIA_UPLOAD_TIMEOUT_MS });
}

function setGlobalLoading(active) {
  state.requestCount = Math.max(0, state.requestCount + (active ? 1 : -1));
  let bar = $('#globalLoadingBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'globalLoadingBar';
    bar.className = 'global-loading-bar';
    bar.setAttribute('aria-hidden','true');
    document.body.appendChild(bar);
  }
  bar.classList.toggle('active', state.requestCount > 0);
}

function showNetworkState(online, temporary = false) {
  let box = $('#networkState');
  if (!box) {
    box = document.createElement('div');
    box.id = 'networkState';
    box.className = 'network-state';
    box.setAttribute('role','status');
    box.setAttribute('aria-live','polite');
    document.body.appendChild(box);
  }
  box.className = `network-state show ${online ? 'online' : 'offline'}`;
  box.textContent = online ? 'Conexión recuperada' : 'Sin conexión · algunas funciones no están disponibles';
  clearTimeout(showNetworkState.timer);
  if (online || temporary) showNetworkState.timer = setTimeout(() => box.classList.remove('show'), 2200);
}

function trackOperationalEvent(type, metadata = {}) {
  if (!state.token || !navigator.onLine) return;
  try {
    fetch('/api/telemetry/event', { method:'POST', headers:{'Authorization':'Bearer '+state.token,'Content-Type':'application/json'}, body:JSON.stringify({type,path:location.pathname,metadata}), keepalive:true }).catch(()=>{});
  } catch (_) {}
}

function trackSessionActivity() {
  if (!state.token || !navigator.onLine) return;
  const now=Date.now(), last=Number(sessionStorage.getItem('iaLastSessionPing') || 0);
  if (now-last < 20*60*1000) return;
  sessionStorage.setItem('iaLastSessionPing',String(now));
  try {
    fetch('/api/telemetry/session',{method:'POST',headers:{'Authorization':'Bearer '+state.token,'Content-Type':'application/json'},body:JSON.stringify({path:location.pathname}),keepalive:true}).catch(()=>{});
  } catch (_) {}
}

let lastClientErrorKey='';
function reportClientError(message, stack='') {
  if(!state.token) return;
  const key=String(message || '').slice(0,240);
  if(!key || key===lastClientErrorKey) return;
  lastClientErrorKey=key; setTimeout(()=>{lastClientErrorKey='';},10000);
  trackOperationalEvent('client_error',{message:key,stack:String(stack || '').slice(0,1800)});
}
window.addEventListener('error',event=>reportClientError(event?.message || 'Error JavaScript',event?.error?.stack || ''));
window.addEventListener('unhandledrejection',event=>{const reason=event?.reason;reportClientError(reason?.message || String(reason || 'Promesa rechazada'),reason?.stack || '');});

async function api(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(opts.timeout || 75000));
  const slowTimer = setTimeout(() => document.body.classList.add('slow-network'), 1800);
  setGlobalLoading(true);
  try {
    const r = await fetch(url, { ...opts, headers, signal: opts.signal || controller.signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 && state.token && !state.sessionExpiring) {
        state.sessionExpiring = true;
        setTimeout(() => {
          toast('Tu sesión ha caducado. Vuelve a entrar.', 'error');
          logout();
          state.sessionExpiring = false;
        }, 50);
      }
      const apiError = new Error(data.error || 'Ha ocurrido un error');
      apiError.code = data.code || '';
      apiError.status = r.status;
      throw apiError;
    }
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('La conexión está tardando demasiado. Inténtalo de nuevo.');
    if (!navigator.onLine) throw new Error('No tienes conexión a Internet.');
    if (err instanceof TypeError) throw new Error('No se pudo conectar con Instant Admirers. Inténtalo de nuevo.');
    throw err;
  } finally {
    clearTimeout(timeout);
    clearTimeout(slowTimer);
    document.body.classList.remove('slow-network');
    setGlobalLoading(false);
  }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
}

function escapeAttr(value = '') { return escapeHtml(value).replace(/`/g, '&#096;'); }


// --- V1.10.0: Publicidad ---------------------------------------------------
function adDevice() { return window.matchMedia('(max-width: 860px)').matches ? 'mobile' : 'desktop'; }

async function fetchAdSlot(placement, profile='') {
  if(!state.token) return null;
  const params=new URLSearchParams({placement,device:adDevice(),lang:window.IAI18N?.adLanguage?.() || 'es'});
  if(profile) params.set('profile',String(profile).replace(/^@/,''));
  try{
    const response=await fetch(`/api/ads/slot?${params.toString()}`,{headers:{Authorization:'Bearer '+state.token}});
    if(response.status===204) return null;
    if(!response.ok) return null;
    const data=await response.json().catch(()=>null);
    return data?.id ? data : null;
  }catch(_){return null;}
}

function trackAdEvent(id,type){
  if(!state.token || !Number(id) || !['impression','click'].includes(type)) return;
  try{fetch(`/api/ads/${Number(id)}/${type}`,{method:'POST',headers:{Authorization:'Bearer '+state.token,'Content-Type':'application/json'},body:'{}',keepalive:true}).catch(()=>{});}catch(_){}
}
window.trackAdClick=(id)=>trackAdEvent(id,'click');

let adImpressionObserver=null;
function observeAdImpression(element,id){
  if(!element||!Number(id))return;
  element.dataset.adImpressionId=String(id);
  if(!('IntersectionObserver' in window)){trackAdEvent(id,'impression');return;}
  if(!adImpressionObserver){
    adImpressionObserver=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting||entry.intersectionRatio<0.5)return;
        const target=entry.target,adId=Number(target.dataset.adImpressionId||0);
        if(adId&&!target.dataset.adImpressionSent){target.dataset.adImpressionSent='1';trackAdEvent(adId,'impression');}
        adImpressionObserver.unobserve(target);
      });
    },{threshold:[0.5]});
  }
  adImpressionObserver.observe(element);
}

function adVisibleCopyHtml(ad){
  const title=String(ad?.display_title||'').trim();
  const text=String(ad?.display_text||'').trim();
  const button=String(ad?.button_text||'').trim();
  if(!title&&!text&&!(button&&ad?.link_url)) return '';
  return `<div class="ad-visible-copy">${title?`<b class="ad-visible-title">${escapeHtml(title)}</b>`:''}${text?`<p class="ad-visible-text">${escapeHtml(text)}</p>`:''}${button&&ad?.link_url?`<span class="ad-visible-cta">${escapeHtml(button)}</span>`:''}</div>`;
}

function adImageHtml(ad){
  const image=`<img src="${escapeAttr(ad.image_url||'')}" alt="${escapeAttr(ad.alt_text||(window.IAI18N?.t?.('Publicidad','Advertising')||'Publicidad'))}" loading="lazy" decoding="async">`;
  const creative=`<span class="ad-disclosure">Publicidad</span><div class="ad-image-wrap">${image}</div>${adVisibleCopyHtml(ad)}`;
  if(ad.link_url) return `<a class="ad-image-link" href="${escapeAttr(ad.link_url)}" target="_blank" rel="sponsored noopener noreferrer" onclick="trackAdClick(${Number(ad.id)})">${creative}</a>`;
  return `<div class="ad-image-link no-link">${creative}</div>`;
}

function ensureAdsenseScript(src=''){
  const safeSrc=/^https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js(?:\?|$)/i.test(String(src||''))
    ? String(src)
    : 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
  let script=document.querySelector('script[data-ia-adsense]');
  if(script) return script;
  script=document.createElement('script');
  script.async=true;
  script.src=safeSrc;
  script.crossOrigin='anonymous';
  script.dataset.iaAdsense='1';
  document.head.appendChild(script);
  return script;
}

function mountGoogleAd(container,ad){
  const code=String(ad.google_code||'');
  const parsed=new DOMParser().parseFromString(code,'text/html');
  const sourceIns=parsed.querySelector('ins.adsbygoogle');
  if(!sourceIns){container.remove();return;}
  const allowedAttrs=['style','data-ad-client','data-ad-slot','data-ad-format','data-full-width-responsive','data-ad-layout','data-ad-layout-key','data-ad-channel'];
  const ins=document.createElement('ins');
  ins.className='adsbygoogle';
  for(const name of allowedAttrs){const value=sourceIns.getAttribute(name);if(value!==null)ins.setAttribute(name,value);}
  if(!ins.style.display) ins.style.display='block';
  container.innerHTML='<span class="ad-disclosure">Publicidad</span>';
  container.appendChild(ins);
  const sourceScript=[...parsed.querySelectorAll('script[src]')].find(el=>/googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/i.test(el.src||el.getAttribute('src')||''));
  const script=ensureAdsenseScript(sourceScript?.getAttribute('src')||'');
  let pushed=false;
  const push=()=>{if(pushed)return;pushed=true;try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch(_){}};
  if(script.dataset.iaLoaded==='1') setTimeout(push,0);
  else {
    script.addEventListener('load',()=>{script.dataset.iaLoaded='1';push();},{once:true});
    // Si Google ya lo había cargado antes de que añadiéramos el listener.
    setTimeout(()=>{if(window.adsbygoogle){script.dataset.iaLoaded='1';push();}},1200);
  }
}

function renderAdInto(container,ad,placement){
  if(!container || !ad?.id) return;
  container.className=`ad-slot ad-slot-${placement} ad-${ad.creative_type}`;
  container.dataset.adId=String(ad.id);
  if(ad.creative_type==='google') mountGoogleAd(container,ad);
  else container.innerHTML=adImageHtml(ad);
  observeAdImpression(container,ad.id);
}

async function mountFeedAd(){
  if(state.view!=='feed') return;
  const ad=await fetchAdSlot('feed');
  if(!ad || state.view!=='feed') return;
  const list=document.getElementById('feedPostList');
  const posts=list ? [...list.children].filter(el=>el.classList.contains('post')) : [];
  if(!list || !posts.length) return;
  const slot=document.createElement('div');
  const after=posts[Math.min(2,posts.length-1)];
  after.after(slot);
  renderAdInto(slot,ad,'feed');
}

async function mountProfileAd(username){
  if(state.view!=='profile') return;
  const canonical=String(username||'');
  const ad=await fetchAdSlot('profile',canonical);
  if(!ad || state.view!=='profile' || String(state.profile||'').toLowerCase()!==canonical.toLowerCase()) return;
  const profileCard=document.querySelector('#main .profile-card');
  if(!profileCard) return;
  const slot=document.createElement('div');
  profileCard.after(slot);
  renderAdInto(slot,ad,'profile');
}

async function mountRightbarAd(){
  if(adDevice()==='mobile') return;
  const box=document.getElementById('rightbar');
  if(!box) return;
  const profile=state.view==='profile' ? String(state.profile||'') : '';
  const ad=await fetchAdSlot('right_sidebar',profile);
  if(!ad || !box.isConnected) return;
  const slot=document.createElement('div');
  const trends=document.getElementById('rightbarTrends');
  if(trends) trends.before(slot); else box.appendChild(slot);
  renderAdInto(slot,ad,'right_sidebar');
}

function safeEncode(value = '') { return encodeURIComponent(String(value)).replace(/'/g, '%27'); }

function initials(u = {}) {
  return String(u.name || u.username || '?').trim().slice(0, 1).toUpperCase();
}

function avatar(u = {}, size = '') {
  const klass = size ? ` avatar ${size}` : 'avatar';
  return `<div class="${klass}">${u.avatar ? `<img src="${escapeAttr(u.avatar)}" loading="lazy" decoding="async" alt="">` : `<span>${escapeHtml(initials(u))}</span>`}</div>`;
}

function timeAgo(date) {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const sec = Math.max(0, Math.floor(diff / 1000));
  const lang=window.IAI18N?.getLanguage?.() || 'es';
  if (sec < 60) return lang==='en' ? 'now' : 'ahora';
  const min = Math.floor(sec / 60); if (min < 60) return lang==='en' ? `${min} min ago` : `${min} min`;
  const h = Math.floor(min / 60); if (h < 24) return lang==='en' ? `${h} h ago` : `${h} h`;
  const d = Math.floor(h / 24); if (d < 7) return lang==='en' ? `${d} d ago` : `${d} d`;
  return new Intl.DateTimeFormat(window.IAI18N?.locale?.() || 'es-ES', { day:'2-digit', month:'short' }).format(new Date(date));
}


function presenceText(u = {}) {
  const lang=window.IAI18N?.getLanguage?.() || 'es';
  if (u.online) return lang==='en' ? 'Online' : 'En línea';
  return u.last_seen_at ? `${lang==='en'?'Last seen':'Última vez'} ${timeAgo(u.last_seen_at)}` : (lang==='en'?'Offline':'Desconectado');
}

function presenceHtml(u = {}) {
  return `<span class="presence ${u.online ? 'online' : ''}" data-presence-user="${Number(u.id || u.other_id || 0)}"><i></i>${escapeHtml(presenceText(u))}</span>`;
}

function formatText(text = '') {
  let html = escapeHtml(text).replace(/\n/g, '<br>');
  html = html.replace(/(^|\s)(#[\p{L}\p{N}_]+)/gu, (_, lead, tag) => `${lead}<button class="inline-link" onclick="searchTag('${escapeAttr(tag)}')">${tag}</button>`);
  html = html.replace(/(^|\s)(@[a-zA-Z0-9_.]{3,30})/g, (_, lead, mention) => `${lead}<button class="inline-link mention-link" onclick="openProfile('${escapeAttr(mention.slice(1))}')">${mention}</button>`);
  return html;
}

function toast(message, kind = '') {
  let box = $('#toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast';
    box.setAttribute('role','status');
    box.setAttribute('aria-live','polite');
    document.body.appendChild(box);
  }
  box.className = `toast show ${kind}`;
  box.textContent = message;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove('show'), 2600);
}

function closeModal() { if (state.followListContext) state.followListContext = null; $('#modal-root').innerHTML = ''; }
window.closeModal = closeModal;

function modal(html) {
  $('#modal-root').innerHTML = `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;
}

function brandLockup(size = '') {
  return `<span class="brand-lockup ${size}"><img src="/assets/brand/instant-admirers-mark.svg" alt="" aria-hidden="true"><span>Instant <b>Admirers</b></span></span>`;
}

function legalLinks() {
  return `<div class="legal-mini">
    <a href="/legal/" target="_blank" rel="noopener">Aviso legal</a>
    <a href="/privacy/" target="_blank" rel="noopener">Privacidad</a>
    <a href="/cookies/" target="_blank" rel="noopener">Cookies</a>
    <a href="/terms/" target="_blank" rel="noopener">Términos</a>
    <a href="/community-guidelines/" target="_blank" rel="noopener">Normas</a>
  </div>`;
}

function authUsageNotice() {
  const lang=window.IAI18N?.getLanguage?.() || 'es';
  if (lang === 'en') {
    return `<div class="auth-consent-note" data-no-i18n>By logging in and using Instant Admirers, you agree to our <a href="/en/terms/" target="_blank" rel="noopener">Terms of Use</a> and <a href="/en/privacy/" target="_blank" rel="noopener">Privacy Policy</a>, and confirm that you are at least 18 years old.</div>`;
  }
  return `<div class="auth-consent-note" data-no-i18n>Al iniciar sesión y usar Instant Admirers, aceptas nuestros <a href="/terms/" target="_blank" rel="noopener">Términos de Uso</a> y <a href="/privacy/" target="_blank" rel="noopener">Política de Privacidad</a>, y confirmas que tienes al menos 18 años.</div>`;
}


function publicTeaserSignupUrl(username='') {
  const params=new URLSearchParams(location.search);
  params.delete('preview');
  params.set('auth','register');
  const clean=String(username||'').trim().replace(/^@/,'');
  return `/${encodeURIComponent(clean)}?${params.toString()}`;
}

function publicTeaserPostHtml(post,username) {
  const text=String(post?.text || '').trim();
  const repost=String(post?.repost_text || '').trim();
  const hasMedia=Boolean(post?.has_media);
  const mediaType=String(post?.media_type || 'none');
  const mediaLabel=mediaType==='video'
    ? teaserCopy('Vídeo bloqueado','Video locked')
    : teaserCopy('Foto bloqueada','Photo locked');
  const mediaIcon=mediaType==='video' ? '🎬' : '📷';
  return `<article class="card public-teaser-post">
    <div class="public-teaser-post-meta"><span>@${escapeHtml(username)}</span><small>${escapeHtml(timeAgo(post.created_at))}</small></div>
    ${post?.is_repost ? `<div class="public-teaser-repost-label">↗ ${teaserCopy('Publicación compartida','Shared post')}</div>` : ''}
    ${text ? `<p class="public-teaser-post-text user-content">${escapeHtml(text)}</p>` : ''}
    ${repost ? `<div class="public-teaser-repost-text user-content">${escapeHtml(repost)}</div>` : ''}
    ${hasMedia ? `<button class="public-teaser-media-lock" type="button" onclick="openTeaserSignup('${escapeAttr(username)}')">
      <span class="public-teaser-media-icon">${mediaIcon}</span>
      <span><b>${escapeHtml(mediaLabel)}</b><small>${teaserCopy('Crea una cuenta para ver el contenido','Create an account to view this content')}</small></span>
      <strong>${teaserCopy('Crear cuenta','Create account')} →</strong>
    </button>` : ''}
  </article>`;
}

async function renderPublicTeaserProfile(username,{append=false,before=null}={}) {
  const clean=String(username||'').trim().replace(/^@/,'');
  const campaign=currentGrowthCampaign();
  if(!clean || !campaign){ authScreen(); return; }
  if(!append){
    rememberPendingProfile(clean);
    $('#app').innerHTML=`<div class="auth-page public-teaser-page"><section class="public-teaser-header"><div class="brand-logo-wrap">${brandLockup('big')}</div></section><main class="public-teaser-shell"><div class="card loading-card">${teaserCopy('Cargando perfil…','Loading profile…')}</div></main></div>`;
  }
  try{
    const qs=new URLSearchParams({campaign,limit:'15'});
    if(before) qs.set('before',String(before));
    const data=await api(`/api/public/profile/${encodeURIComponent(clean)}/teaser?${qs.toString()}`,{timeout:15000});
    const profile=data.profile || {};
    const canonical=String(profile.username || clean).trim();
    rememberPendingProfile(canonical);
    if(append){
      const list=$('#publicTeaserPostList');
      if(list && Array.isArray(data.posts)) list.insertAdjacentHTML('beforeend',data.posts.map(p=>publicTeaserPostHtml(p,canonical)).join(''));
      const more=$('#publicTeaserMore');
      if(more){ more.outerHTML=data.has_more ? `<button id="publicTeaserMore" class="btn ghost public-teaser-more" onclick="loadMorePublicTeaserPosts('${escapeAttr(canonical)}',${Number(data.next_before||0)})">${teaserCopy('Ver más publicaciones','View more posts')}</button>` : ''; }
      return;
    }
    document.title=`${profile.name || canonical} (@${canonical}) · Instant Admirers`;
    const cover=String(profile.cover || '').trim(), avatarUrl=String(profile.avatar || '').trim();
    const posts=Array.isArray(data.posts)?data.posts:[];
    $('#app').innerHTML=`<div class="auth-page public-teaser-page">
      <section class="public-teaser-header"><div class="brand-logo-wrap">${brandLockup('big')}</div><button class="btn ghost compact" onclick="returnFromPublicTeaser('${escapeAttr(canonical)}')">← ${teaserCopy('Volver','Back')}</button></section>
      <main class="public-teaser-shell">
        <section class="card profile-card profile-card-v7 public-teaser-profile-card">
          <div class="profile-cover ${cover?'has-cover':''}">${cover?`<img src="${escapeAttr(cover)}" alt="" decoding="async">`:''}</div>
          <div class="profile-main-v7">
            <div class="profile-top"><div class="avatar xl">${avatarUrl?`<img src="${escapeAttr(avatarUrl)}" alt="${escapeAttr(profile.name||canonical)}" decoding="async">`:`<span>${escapeHtml(initials({name:profile.name,username:canonical}))}</span>`}</div><div class="profile-cta"><button class="btn primary compact" onclick="openTeaserSignup('${escapeAttr(canonical)}')">${teaserCopy('Crear cuenta','Create account')}</button></div></div>
            <h2>${escapeHtml(profile.name || canonical)}</h2><div class="handle">@${escapeHtml(canonical)}</div>
            ${profile.headline?`<div class="profile-headline user-content">${escapeHtml(profile.headline)}</div>`:''}
            ${profile.bio?`<p class="user-content">${escapeHtml(profile.bio)}</p>`:''}
          </div>
        </section>
        <section class="public-teaser-explainer"><span>🔒</span><div><b>${teaserCopy('Vista previa del perfil','Profile preview')}</b><p>${teaserCopy('Puedes leer sus publicaciones. Las fotos y vídeos se desbloquean al crear tu cuenta.','You can read their posts. Photos and videos unlock when you create your account.')}</p></div></section>
        <div class="profile-section-title">${teaserCopy('Publicaciones','Posts')}</div>
        <div class="post-list" id="publicTeaserPostList">${posts.length?posts.map(p=>publicTeaserPostHtml(p,canonical)).join(''):`<div class="card empty"><h3>${teaserCopy('Sin publicaciones todavía','No posts yet')}</h3></div>`}</div>
        ${data.has_more?`<button id="publicTeaserMore" class="btn ghost public-teaser-more" onclick="loadMorePublicTeaserPosts('${escapeAttr(canonical)}',${Number(data.next_before||0)})">${teaserCopy('Ver más publicaciones','View more posts')}</button>`:''}
        <section class="card public-teaser-final-cta"><b>${teaserCopy('¿Quieres ver las fotos y vídeos?','Want to see the photos and videos?')}</b><p>${teaserCopy('Crea tu cuenta desde esta invitación y entra directamente en este perfil.','Create your account from this invitation and go directly to this profile.')}</p><button class="btn primary large" onclick="openTeaserSignup('${escapeAttr(canonical)}')">${teaserCopy('Crear cuenta y ver contenido','Create account and view content')}</button></section>
      </main>
      <div class="public-teaser-sticky"><button class="btn primary" onclick="openTeaserSignup('${escapeAttr(canonical)}')">${teaserCopy('Crear cuenta para ver el contenido','Create account to view content')}</button></div>
    </div>`;
    window.IAI18N?.apply?.();
    trackPublicTeaserEvent('view');
  }catch(e){
    if(!append){
      try{ const params=new URLSearchParams(location.search); params.delete('preview'); history.replaceState({},'',`${location.pathname}${params.toString()?'?'+params.toString():''}`); }catch(_){}
      authScreen();
      setTimeout(()=>toast(e.message || teaserCopy('Vista previa no disponible','Preview unavailable'),'error'),80);
    }
  }
}

window.openPublicTeaserProfile=async(username)=>{
  const clean=rememberPendingProfile(username);
  if(!clean) return;
  const params=new URLSearchParams(location.search); params.set('preview','1'); params.delete('auth');
  history.pushState({publicTeaser:true,profile:clean},'',`/${encodeURIComponent(clean)}?${params.toString()}`);
  await renderPublicTeaserProfile(clean);
};
window.returnFromPublicTeaser=(username)=>{
  const clean=rememberPendingProfile(username);
  const params=new URLSearchParams(location.search); params.delete('preview'); params.delete('auth');
  history.replaceState({profile:clean},'',`/${encodeURIComponent(clean)}${params.toString()?'?'+params.toString():''}`);
  authScreen();
};
window.openTeaserSignup=(username)=>{
  const clean=rememberPendingProfile(username);
  trackPublicTeaserEvent('signup_click');
  history.pushState({profile:clean,auth:'register'},'',publicTeaserSignupUrl(clean));
  authScreen();
  showAuth('register');
  window.scrollTo({top:0,behavior:'smooth'});
};
window.loadMorePublicTeaserPosts=async(username,before)=>{
  const btn=$('#publicTeaserMore'); if(btn){btn.disabled=true;btn.textContent=teaserCopy('Cargando…','Loading…');}
  await renderPublicTeaserProfile(username,{append:true,before});
};

async function loadLaunchStatus() {
  try {
    const status=await api('/api/launch/status',{timeout:10000});
    state.launchStatus={...state.launchStatus,...status};
    if(!state.token && state.authMode==='register' && $('#authbox')) {
      const hasTyped=Boolean($('#regname')?.value || $('#reguser')?.value || $('#regemail')?.value || $('#regpass')?.value);
      if(!hasTyped) showAuth('register');
    }
  } catch (_) {}
}

function authScreen() {
  const directProfile = pendingProfileDestination();
  $('#app').innerHTML = `
    <div class="auth-page">
      <section class="auth-hero">
        <div class="brand-logo-wrap">${brandLockup('big')}</div>
        <div class="auth-mobile-kicker"><span></span> Tu comunidad, a tu manera</div>
        <h1><span>Encuentra tu gente.</span> <span class="hero-accent">Comparte tu mundo.</span></h1>
        <p><span class="auth-copy-desktop">Conecta con personas, comparte fotos y vídeos, descubre nuevas historias y crea una comunidad a tu manera.</span><span class="auth-copy-mobile">Conecta, publica y descubre nuevas historias.</span></p>
        <div class="hero-pills"><span>📸 Fotos</span><span>🎬 Vídeos</span><span>💬 Conversaciones</span><span>✨ Comunidad</span></div>
      </section>
      <section class="auth-card-wrap">
        <section class="auth-card card">
          ${directProfile ? `<div id="directProfileAccessCard" class="invite-auth-note profile-direct-note"><b>Perfil de @${escapeHtml(directProfile)}</b><span>Inicia sesión o crea tu cuenta para entrar directamente en este perfil.</span></div>` : ''}
          <div class="tabs">
            <button id="loginTab" class="tab active" onclick="showAuth('login')">Entrar</button>
            <button id="registerTab" class="tab" onclick="showAuth('register')">Crear cuenta</button>
          </div>
          <div id="authbox"></div>
        </section>
        ${legalLinks()}
        <button class="btn ghost compact pwa-install-entry" type="button" onclick="installInstantAdmirers()"><span>⬇</span><span data-pwa-install-label>Instalar app</span></button>
        <div class="auth-mobile-footer-note">18+ · Comunidad privada · Instant Admirers</div>
      </section>
    </div>`;
  let requestedAuth='login';
  try {
    const authParam=String(new URLSearchParams(location.search).get('auth') || '').toLowerCase();
    if (authParam === 'register' || location.pathname === '/register') requestedAuth='register';
  } catch (_) {}
  showAuth(requestedAuth);
  loadLaunchStatus();
  if (directProfile) void loadPendingProfileAccessCard();
  const authNotice=sessionStorage.getItem('authNotice'); if(authNotice){sessionStorage.removeItem('authNotice');setTimeout(()=>toast(authNotice),80);}
}

window.showAuth = (mode) => {
  state.authMode=mode;
  $('#loginTab')?.classList.toggle('active', mode === 'login');
  $('#registerTab')?.classList.toggle('active', mode === 'register');
  const launchMode=state.launchStatus?.registration_mode || 'open';
  const hasInvite=Boolean(localStorage.getItem('pendingReferralCode'));
  if(mode==='register' && launchMode==='paused'){
    $('#authbox').innerHTML=`<div class="auth-form launch-auth-gate"><div class="invite-auth-note"><b>⏸ Altas pausadas temporalmente</b><span>Estamos incorporando usuarios por fases para cuidar el rendimiento y la comunidad. Si ya tienes cuenta, puedes entrar con normalidad.</span></div><button class="btn ghost large" onclick="showAuth('login')">Ya tengo cuenta</button></div>`;
    return;
  }
  if(mode==='register' && launchMode==='invite_only' && !hasInvite){
    $('#authbox').innerHTML=`<div class="auth-form launch-auth-gate"><div class="invite-auth-note"><b>✦ Acceso por invitación</b><span>Instant Admirers está en lanzamiento controlado. Para crear una cuenta necesitas abrir un enlace de invitación de un miembro.</span></div><button class="btn ghost large" onclick="showAuth('login')">Ya tengo cuenta</button></div>`;
    return;
  }
  const directProfile = pendingProfileDestination();
  const launchInviteNote = mode==='register' && launchMode==='invite_only' && !directProfile ? `<div class="invite-auth-note launch-invite-ok"><b>✓ Invitación detectada</b><span>Puedes crear tu cuenta dentro de esta fase de lanzamiento.</span></div>` : '';
  $('#authbox').innerHTML = mode === 'login' ? `
    <div class="auth-form">
      <label>Email o usuario</label><input id="loginid" autocomplete="username" placeholder="tuusuario">
      <label>Contraseña</label><input id="loginpass" type="password" autocomplete="current-password" placeholder="••••••••" onkeydown="if(event.key==='Enter')login()">
      <button id="loginSubmit" class="btn primary large" onclick="login()">Entrar</button>
      <button class="auth-text-link" onclick="openForgotPassword()">¿Has olvidado tu contraseña?</button>
      ${authUsageNotice()}
    </div>` : `
    <div class="auth-form">
      ${launchInviteNote}
      ${!directProfile && localStorage.getItem('pendingReferralCode') ? '<div class="invite-auth-note"><b>💬 Has llegado con una invitación</b><span>Crea tu perfil en Instant Admirers desde aquí.</span></div>' : ''}
      <label>Nombre</label><input id="regname" placeholder="Tu nombre">
      <label>Usuario</label><input id="reguser" autocomplete="username" placeholder="tuusuario">
      <label>Email</label><input id="regemail" type="email" autocomplete="email" placeholder="tu@email.com">
      <label>Contraseña</label><input id="regpass" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres" onkeydown="if(event.key==='Enter')register()">
      <label class="legal-check"><input id="reglegal" type="checkbox"><span>Confirmo que tengo <b>18 años o más</b> y acepto los <a href="/terms/" target="_blank" rel="noopener">Términos de Uso</a> y las <a href="/community-guidelines/" target="_blank" rel="noopener">Normas de la Comunidad</a>. He leído la <a href="/privacy/" target="_blank" rel="noopener">Política de Privacidad</a>.</span></label>
      <button id="registerSubmit" class="btn primary large" onclick="register()">Crear mi cuenta</button>
    </div>`;
};

window.login = async () => {
  const btn = $('#loginSubmit');
  if (btn?.disabled) return;
  let directProfile = pendingProfileDestination();
  if (directProfile) rememberPendingProfile(directProfile);
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando…'; }
    // Valida el destino antes del login. Así no tratamos cualquier /texto como un perfil real.
    if (directProfile) {
      try { directProfile = await resolveDirectProfileUsername(directProfile); }
      catch (profileError) {
        // Permitimos iniciar sesión, pero conservamos el destino para mostrar un error claro después.
        profileError.pendingProfile = directProfile;
      }
    }
    const d = await api('/api/auth/login', { method:'POST', body: JSON.stringify({ emailOrUsername: $('#loginid').value, password: $('#loginpass').value }) });
    state.token = d.token; localStorage.setItem('token', d.token); await init({ preferredProfile: directProfile || pendingProfileDestination() });
  } catch (e) {
    if (e.code === 'EMAIL_NOT_VERIFIED') openVerifyEmailPrompt($('#loginid')?.value || '');
    else toast(e.message, 'error');
  }
  finally { if (btn?.isConnected) { btn.disabled = false; btn.textContent = 'Entrar'; } }
};

window.register = async () => {
  const btn = $('#registerSubmit');
  if (btn?.disabled) return;
  if (!$('#reglegal')?.checked) return toast('Debes confirmar que tienes 18 años y aceptar los Términos de Uso','error');
  let directProfile = pendingProfileDestination();
  if (directProfile) rememberPendingProfile(directProfile);
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Creando cuenta…'; }
    if (directProfile) { try { directProfile = await resolveDirectProfileUsername(directProfile); } catch (_) {} }
    const d = await api('/api/auth/register', { method:'POST', body: JSON.stringify({ name: $('#regname').value, username: $('#reguser').value, email: $('#regemail').value, password: $('#regpass').value, age_confirmed:true, terms_accepted:true, terms_version:'2026-09-20', referral_code:localStorage.getItem('pendingReferralCode') || '', gate_code:localStorage.getItem('pendingGateCode') || '', campaign_code:currentGrowthCampaign(), campaign_context:growthVisitContext(), language:(window.IAI18N?.getLanguage?.() || 'es') }) });
    localStorage.removeItem('pendingReferralCode'); localStorage.removeItem('pendingGateCode');
    if (d.verification_required) {
      modal(`<div class="modal-head"><h3>Confirma tu email</h3><button class="icon-btn" onclick="closeModal()">×</button></div><div class="account-form"><div class="security-callout"><b>Cuenta creada</b><p>Te hemos enviado un enlace de verificación. Ábrelo antes de iniciar sesión.</p></div><button class="btn primary" onclick="closeModal();showAuth('login')">Volver a entrar</button></div>`);
      return;
    }
    state.token = d.token; localStorage.setItem('token', d.token); await init({ preferredProfile: directProfile });
  } catch (e) { toast(e.message, 'error'); }
  finally { if (btn?.isConnected) { btn.disabled = false; btn.textContent = 'Crear mi cuenta'; } }
};


window.openForgotPassword = () => {
  modal(`<div class="modal-head"><h3>Recuperar contraseña</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="account-form">
      <p class="muted">Escribe el email de tu cuenta. Si existe, recibirás un enlace que caduca en 30 minutos.</p>
      <label>Email<input id="forgotEmail" type="email" autocomplete="email" placeholder="tu@email.com"></label>
      <button id="forgotSubmit" class="btn primary" onclick="requestPasswordReset()">Enviar enlace</button>
    </div>`);
};

window.requestPasswordReset = async () => {
  const btn=$('#forgotSubmit'); if(btn?.disabled) return;
  try{
    if(btn){btn.disabled=true;btn.textContent='Enviando…';}
    const email=($('#forgotEmail')?.value || '').trim();
    if(!email){ throw new Error('Escribe el email de tu cuenta.'); }
    const d=await api('/api/auth/forgot-password',{method:'POST',timeout:20000,body:JSON.stringify({email})});
    closeModal(); toast(d.message || 'Revisa tu correo');
  }catch(e){
    if(e?.code==='EMAIL_NOT_CONFIGURED') toast('La recuperación por correo aún no está configurada. Configura Resend en Render.', 'error');
    else if(e?.code==='EMAIL_SEND_FAILED') toast('No se pudo enviar el correo. Revisa Resend en Render.', 'error');
    else toast(e.message,'error');
  }
  finally{if(btn){btn.disabled=false;btn.textContent='Enviar enlace';}}
};

window.openVerifyEmailPrompt = (email='') => {
  modal(`<div class="modal-head"><h3>Verifica tu email</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="account-form"><p class="muted">Necesitas confirmar tu dirección antes de entrar.</p>
      <label>Email<input id="verifyEmailInput" type="email" autocomplete="email" value="${escapeAttr(email)}"></label>
      <button id="verifyEmailSubmit" class="btn primary" onclick="requestVerificationEmail()">Reenviar verificación</button>
    </div>`);
};

window.requestVerificationEmail = async () => {
  const btn=$('#verifyEmailSubmit'); if(btn?.disabled) return;
  try{
    if(btn){btn.disabled=true;btn.textContent='Enviando…';}
    const d=await api('/api/auth/verify-email/request',{method:'POST',body:JSON.stringify({email:$('#verifyEmailInput')?.value || ''})});
    closeModal(); toast(d.message || 'Revisa tu correo');
  }catch(e){toast(e.message,'error');}
  finally{if(btn?.isConnected){btn.disabled=false;btn.textContent='Reenviar verificación';}}
};

function renderPasswordResetLink(token) {
  authScreen();
  modal(`<div class="modal-head"><h3>Nueva contraseña</h3></div><div class="account-form">
    <p class="muted">Crea una contraseña nueva de al menos 8 caracteres.</p>
    <label>Nueva contraseña<input id="resetPassword1" type="password" autocomplete="new-password"></label>
    <label>Repite la contraseña<input id="resetPassword2" type="password" autocomplete="new-password"></label>
    <button id="resetPasswordSubmit" class="btn primary" onclick="completePasswordReset('${escapeAttr(token)}')">Guardar nueva contraseña</button>
  </div>`);
}

window.completePasswordReset = async (token) => {
  const a=$('#resetPassword1')?.value || '', b=$('#resetPassword2')?.value || '';
  if(a.length<8) return toast('La contraseña debe tener al menos 8 caracteres','error');
  if(a!==b) return toast('Las contraseñas no coinciden','error');
  const btn=$('#resetPasswordSubmit');
  try{
    if(btn){btn.disabled=true;btn.textContent='Guardando…';}
    await api('/api/auth/reset-password',{method:'POST',body:JSON.stringify({token,password:a})});
    state.token='';localStorage.removeItem('token');history.replaceState({},'',location.pathname); closeModal(); showAuth('login'); toast('Contraseña actualizada. Ya puedes entrar.');
  }catch(e){toast(e.message,'error');}
  finally{if(btn?.isConnected){btn.disabled=false;btn.textContent='Guardar nueva contraseña';}}
};

async function handleAuthLink() {
  const params=new URLSearchParams(location.search);
  const action=params.get('action'), token=params.get('token');
  if(!action || !token) return false;
  if(action==='reset-password') { renderPasswordResetLink(token); return true; }
  const endpoint=action==='verify-email'?'/api/auth/verify-email/confirm':action==='change-email'?'/api/auth/change-email/confirm':'';
  if(!endpoint) return false;
  authScreen();
  try{
    await api(endpoint,{method:'POST',body:JSON.stringify({token})});
    history.replaceState({},'',location.pathname);
    sessionStorage.setItem('authNotice', action==='verify-email'?'Email verificado correctamente.':'Email actualizado correctamente.');
    location.replace('/');
  }catch(e){
    history.replaceState({},'',location.pathname); toast(e.message,'error');
  }
  return true;
}

function navButton(view, icon, label) {
  const active = state.view === view ? 'active' : '';
  let count = 0;
  if (view === 'notifications') count = Number(state.me?.unread_notifications || 0);
  if (view === 'messages') count = Number(state.me?.unread_messages || 0);
  const badge = count > 0 ? `<span class="nav-badge">${Math.min(99, count)}</span>` : '';
  return `<button class="nav-item ${active}" data-nav-view="${view}" onclick="go('${view}')"><span class="nav-icon">${icon}</span><span>${label}</span>${badge}</button>`;
}

function launchBannerHtml() {
  const l=state.launchStatus || {};
  if(!l.banner_enabled || l.launch_phase==='public') return '';
  const phase=l.launch_phase==='pilot'?'Lanzamiento inicial':'Preparando lanzamiento';
  const text=String(l.banner_text || (l.launch_phase==='pilot'?'Estás entre los primeros miembros de Instant Admirers.':'Estamos abriendo Instant Admirers por fases.'));
  return `<div class="launch-public-banner phase-${escapeAttr(l.launch_phase || 'prelaunch')}"><b>✦ ${escapeHtml(phase)}</b><span>${escapeHtml(text)}</span></div>`;
}

function layout() {
  $('#app').innerHTML = `
    <header class="topbar">
      <button class="brand-button" onclick="go('feed')">${brandLockup('top')}</button>
      <div class="top-actions">
        <button class="top-icon" onclick="go('search')" aria-label="Buscar">⌕</button>
        ${isSystemAccount()?`<button id="topActivityButton" class="top-icon" onclick="go('admin')" aria-label="Administración">⚙</button>`:`<button id="topActivityButton" class="top-icon badge-wrap" onclick="go('notifications')" aria-label="Actividad">♡${Number(state.me?.unread_notifications || 0) ? `<span class="nav-badge">${Math.min(99,state.me.unread_notifications)}</span>` : ''}</button>`}
        <button class="top-avatar" onclick="${isSystemAccount()?"go('admin')":`openProfile('${escapeAttr(state.me.username)}')`}">${avatar(state.me, 'small')}</button>
      </div>
    </header>
    ${launchBannerHtml()}
    <div class="shell">
      <aside class="left-col">
        <div class="left-sticky">
          <button class="brand-button desktop-brand" onclick="go('feed')">${brandLockup('side')}</button>
          <nav class="nav" id="desktopNav">
            ${navButton('feed','⌂','Inicio')}
            ${navButton('reels','▶','Reels')}
            ${navButton('discover','✦','Descubrir')}
            ${navButton('search','⌕','Buscar')}
            ${!isSystemAccount()?navButton('messages','✉','Mensajes'):''}
            ${!isSystemAccount()?navButton('notifications','♡','Actividad'):''}
            ${!isSystemAccount()?navButton('bookmarks','▱','Guardados'):''}
            ${state.me?.is_admin ? navButton('admin','⚙','Administración') : ''}
            ${!isSystemAccount()?`<button class="nav-item ${state.view === 'profile' ? 'active' : ''}" onclick="openProfile('${escapeAttr(state.me.username)}')"><span class="nav-icon">◎</span><span>Perfil</span></button>`:''}
          </nav>
          ${!isSystemAccount()?`<button class="btn primary compose-side" onclick="focusComposer()">Publicar</button>`:''}
          <button class="account-mini" onclick="${isSystemAccount()?"openAccountSettings()":`openProfile('${escapeAttr(state.me.username)}')`}">${avatar(state.me, 'small')}<span><b>${escapeHtml(state.me.name)}</b><small>${isSystemAccount()?'Cuenta técnica':`@${escapeHtml(state.me.username)}`}</small></span></button>
          ${legalLinks()}
        </div>
      </aside>
      <main id="main" class="main-col"></main>
      <aside class="right-col"><div id="rightbar" class="right-sticky"></div></aside>
    </div>
    <nav class="mobile-dock" id="mobileDock">
      ${navButton('feed','⌂','Inicio')}
      ${navButton('reels','▶','Reels')}
      ${navButton('discover','✦','Descubrir')}
      ${isSystemAccount()?navButton('search','⌕','Buscar'):navButton('messages','✉','Mensajes')}
      ${isSystemAccount()?navButton('admin','⚙','Admin'):`<button class="nav-item ${state.view === 'profile' ? 'active' : ''}" onclick="openProfile('${escapeAttr(state.me.username)}')"><span class="nav-icon">◎</span><span>Perfil</span></button>`}
    </nav>`;
  loadRightbar();
}

window.logout = () => {
  if (state.messagePoll) { clearInterval(state.messagePoll); state.messagePoll = null; }
  if (state.socket) { state.socket.disconnect(); state.socket = null; }
  try { fetch('/api/auth/logout',{method:'POST',keepalive:true}).catch(()=>{}); } catch (_) {}
  localStorage.removeItem('token'); state.token = ''; state.me = null; state.view = 'feed'; authScreen();
};

window.go = async (view, opts = {}) => {
  if (state.messagePoll) { clearInterval(state.messagePoll); state.messagePoll = null; }
  resetViewObservers();
  if (isSystemAccount() && ['profile','friends','messages','notifications','bookmarks'].includes(view)) view='admin';
  state.view = view;
  if (view !== 'profile') {
    document.title = window.IAI18N?.t?.('Instant Admirers — Conecta. Comparte. Descubre.','Instant Admirers — Connect. Share. Discover.') || 'Instant Admirers — Conecta. Comparte. Descubre.';
    const canonical = document.querySelector('link[rel="canonical"]'); if (canonical) canonical.href = location.origin + '/';
    state.profile = null;
    if (opts.history !== false) setHomeBrowserUrl({ replace:Boolean(opts.replace) });
  }
  if (view !== 'messages') { state.activeConversation = null; state.replyTo = null; }
  layout();
  await renderView();
};

window.focusComposer = async () => {
  if (state.view !== 'feed') await go('feed');
  setTimeout(() => openComposerModal(), 50);
};

function skeletonView() {
  return `<div class="skeleton-page" aria-label="Cargando">
    <div class="skeleton skeleton-line title"></div>
    <div class="skeleton-card card"><div class="skeleton-row"><div class="skeleton skeleton-avatar"></div><div class="skeleton-grow"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div></div><div class="skeleton skeleton-block"></div></div>
    <div class="skeleton-card card"><div class="skeleton-row"><div class="skeleton skeleton-avatar"></div><div class="skeleton-grow"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div></div><div class="skeleton skeleton-block small"></div></div>
  </div>`;
}

async function renderView() {
  const main = $('#main');
  if (!main) return;
  main.innerHTML = skeletonView();
  try {
    if (state.view === 'feed') return renderFeed();
    if (state.view === 'reels') return renderReels();
    if (state.view === 'discover') return renderDiscover();
    if (state.view === 'search') return renderSearch();
    if (state.view === 'messages') return renderMessages();
    if (state.view === 'notifications') return renderNotifications();
    if (state.view === 'bookmarks') return renderBookmarks();
    if (state.view === 'friends') return renderFriends();
    if (state.view === 'admin') return renderAdmin();
    if (state.view === 'profile') return renderProfile(state.profile || state.me.username);
  } catch (e) {
    main.innerHTML = `<div class="card empty"><div class="empty-icon">!</div><h3>No se pudo cargar</h3><p>${escapeHtml(e.message)}</p><button class="btn primary compact" onclick="renderView()">Reintentar</button></div>`;
  }
}
window.renderView = renderView;

function pageHeader(title, subtitle = '') {
  return `<div class="page-head"><div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div></div>`;
}

function normalizePagePayload(data) {
  if (Array.isArray(data)) return { items:data, has_more:false, next_cursor:null, next_offset:null };
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    has_more: Boolean(data?.has_more),
    next_cursor: data?.next_cursor ?? null,
    next_offset: data?.next_offset ?? null
  };
}

function pagerHtml(key, hasMore) {
  if (!hasMore) return '';
  return `<div class="infinite-pager" id="pager-${escapeAttr(key)}" data-pager="${escapeAttr(key)}" aria-live="polite"><span class="pager-spinner"></span><small>Cargando más…</small><button class="btn ghost compact pager-fallback" onclick="loadMorePage('${escapeAttr(key)}')">Cargar más</button></div>`;
}

function updatePager(key) {
  const page = state.pagination[key];
  const el = document.getElementById(`pager-${key}`);
  if (!el) return;
  if (!page?.hasMore) { el.remove(); return; }
  el.classList.toggle('loading', Boolean(page.loading));
  const small = el.querySelector('small');
  if (small) small.textContent = page.loading ? 'Cargando más…' : 'Desliza para ver más';
}

function installInfinitePager(key, page, loader, meta = {}) {
  state.pagination[key] = {
    hasMore:Boolean(page.has_more),
    nextCursor:page.next_cursor ?? null,
    nextOffset:page.next_offset ?? null,
    loading:false,
    loader,
    meta
  };
  if (state.infiniteObserver) { state.infiniteObserver.disconnect(); state.infiniteObserver = null; }
  const target = document.getElementById(`pager-${key}`);
  if (!target || !page.has_more) return;
  if (!('IntersectionObserver' in window)) { target.classList.add('manual'); return; }
  state.infiniteObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) loadMorePage(key);
  }, { rootMargin:'700px 0px 700px 0px', threshold:0.01 });
  state.infiniteObserver.observe(target);
}

window.loadMorePage = async (key) => {
  const page = state.pagination[key];
  if (!page || !page.hasMore || page.loading || typeof page.loader !== 'function') return;
  page.loading = true;
  updatePager(key);
  try { await page.loader(page); }
  catch (e) { toast(e.message, 'error'); }
  finally { page.loading = false; updatePager(key); }
};

function pageUrl(base, page, limit = 15) {
  const url = new URL(base, location.origin);
  url.searchParams.set('limit', String(limit));
  if (page?.nextCursor) url.searchParams.set('cursor', String(page.nextCursor));
  else if (page?.nextOffset !== null && page?.nextOffset !== undefined) url.searchParams.set('offset', String(page.nextOffset));
  return url.pathname + url.search;
}

function appendPostItems(containerId, items) {
  const box = document.getElementById(containerId);
  if (!box || !items.length) return;
  box.insertAdjacentHTML('beforeend', items.map(postHtml).join(''));
  setupLazyMedia(box);
}

function setupLazyMedia(root = document) {
  setupBunnyStreams(root);
  const videos = [...root.querySelectorAll('video[data-lazy-video="1"]')].filter(v => !v.dataset.lazyObserved);
  if (!videos.length) return;
  if (!('IntersectionObserver' in window)) {
    videos.forEach(v => { v.preload = 'metadata'; v.dataset.lazyObserved = '1'; });
    return;
  }
  if (!state.mediaObserver) {
    state.mediaObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      const video = entry.target;
      if (entry.isIntersecting) {
        if (video.dataset.metadataLoaded !== '1') {
          video.preload = 'metadata';
          video.dataset.metadataLoaded = '1';
          try { video.load(); } catch (_) {}
        }
      } else if (!video.paused) {
        video.pause();
      }
    }), { rootMargin:'500px 0px 500px 0px', threshold:0.01 });
  }
  videos.forEach(video => {
    video.dataset.lazyObserved = '1';
    state.mediaObserver.observe(video);
  });
}

function resetLazyMediaObserver() {
  if (state.mediaObserver) { state.mediaObserver.disconnect(); state.mediaObserver = null; }
}

function resetViewObservers() {
  if (state.infiniteObserver) { state.infiniteObserver.disconnect(); state.infiniteObserver = null; }
  if (state.reelObserver) { state.reelObserver.disconnect(); state.reelObserver = null; }
  if (adImpressionObserver) { adImpressionObserver.disconnect(); adImpressionObserver = null; }
  resetLazyMediaObserver();
}


function composer() {
  if (isSystemAccount()) return '';
  return `<section class="card composer-compact" id="composer">
    ${avatar(state.me)}
    <button class="composer-trigger" onclick="openComposerModal()">¿Qué quieres compartir?</button>
    <button class="composer-media-shortcut" onclick="openComposerModal(true)" title="Añadir foto o vídeo" aria-label="Añadir foto o vídeo">▧</button>
  </section>`;
}

window.openComposerModal = (pickMedia = false, prefill = '') => {
  modal(`<div class="modal-head composer-modal-head"><h3>Crear publicación</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="composer-modal">
      <div class="composer-author">${avatar(state.me)}<div><b>${escapeHtml(state.me.name)}</b><small>@${escapeHtml(state.me.username)}</small></div></div>
      <textarea id="posttext" rows="6" maxlength="5000" placeholder="¿Qué quieres compartir con la comunidad?"></textarea>
      <div class="composer-hint">Puedes usar <b>@usuario</b> para mencionar y <b>#tema</b> para crear una tendencia.</div>
      <div id="mediaPreview"></div>
      <div class="composer-modal-tools">
        <label id="modalMediaPicker" class="media-picker modal-media-picker" tabindex="0" onclick="prepareGalleryInput('media',true)">▧ Galería<input type="file" id="media" accept="image/*,video/*" onchange="previewMedia(this)"></label>
        <div class="mobile-capture-actions composer-capture-actions" aria-label="Cámara del móvil">
          <button type="button" class="capture-btn" onclick="captureFromDevice('media','photo','environment')">📷 Foto</button>
          <button type="button" class="capture-btn" onclick="captureFromDevice('media','video','environment')">🎥 Vídeo</button>
        </div>
        <select id="visibility" title="Visibilidad"><option value="public">🌍 Público</option><option value="followers">👥 Seguidores</option></select>
      </div>
      <small class="composer-hint">Fotos hasta 10 MB · Vídeos hasta 100 MB.</small>
      <button class="btn primary large composer-publish" id="publishBtn" onclick="createPost()">Publicar</button>
    </div>`);
  setTimeout(() => {
    const postText=$('#posttext');
    if (postText && prefill) { postText.value=String(prefill).slice(0,5000); postText.setSelectionRange(postText.value.length,postText.value.length); }
    if (!pickMedia) {
      postText?.focus();
      return;
    }
    const picker = $('#modalMediaPicker');
    picker?.classList.add('media-picker-attention');
    picker?.focus();
    setTimeout(() => picker?.classList.remove('media-picker-attention'), 1500);
  }, 70);
};

window.previewMedia = (input) => {
  const file = input.files?.[0];
  const box = $('#mediaPreview');
  if (!file || !box) return box && (box.innerHTML = '');
  if (!validateMediaFile(file, input)) {
    box.innerHTML = '';
    return;
  }
  const url = URL.createObjectURL(file);
  box.innerHTML = file.type.startsWith('video/')
    ? `<div class="preview-wrap"><video src="${url}" controls></video><button onclick="clearMedia()">×</button></div>`
    : `<div class="preview-wrap"><img src="${url}" alt=""><button onclick="clearMedia()">×</button></div>`;
};
window.clearMedia = () => { const input = $('#media'); if (input) input.value = ''; const p = $('#mediaPreview'); if (p) p.innerHTML = ''; };

window.createPost = async () => {
  if (state.busy) return;
  const file = $('#media')?.files?.[0];
  if (file && !validateMediaFile(file, $('#media'))) {
    const preview = $('#mediaPreview'); if (preview) preview.innerHTML = '';
    return;
  }
  const btn = $('#publishBtn');
  try {
    state.busy = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = file?.type?.startsWith('video/') ? 'Subiendo vídeo…' : 'Publicando…';
    }
    let media_id = null, media_type = 'none';
    if (file) {
      const up = await uploadMediaFile(file);
      media_id = up.media_id;
      media_type = up.mime.startsWith('video/') ? 'video' : 'image';
      if (btn?.isConnected) btn.textContent = 'Publicando…';
    }
    await api('/api/posts', { method:'POST', body:JSON.stringify({ text: $('#posttext')?.value || '', media_id, media_type, visibility: $('#visibility')?.value || 'public' }) });
    toast('Publicado');
    closeModal();
    await refreshMe(); await renderFeed();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    state.busy = false;
    if (btn?.isConnected) {
      btn.disabled = false;
      btn.textContent = 'Publicar';
    }
  }
};


function mediaProtectionAttrs(item, {video=false} = {}) {
  if (!item?.media_protected) return '';
  return video
    ? ' data-protected-media="1" controlsList="nodownload noremoteplayback" disablePictureInPicture oncontextmenu="return false"'
    : ' data-protected-media="1" draggable="false" oncontextmenu="return false"';
}

function mediaVideoSourceAttrs(item) {
  const url=String(item?.media_url || '');
  if (!url) return '';
  if (item?.media_streaming) return ` data-bunny-stream="1" data-stream-src="${escapeAttr(url)}"`;
  return ` src="${escapeAttr(url)}"`;
}

function hlsStartupBandwidthEstimate() {
  const connection=navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.saveData) return 650000;

  const effectiveType=String(connection?.effectiveType || '').toLowerCase();
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return 650000;
  if (effectiveType === '3g') return 1400000;

  const downlink=Number(connection?.downlink || 0);
  if (Number.isFinite(downlink) && downlink > 0) {
    // Usamos solo una parte prudente del ancho de banda anunciado por el navegador.
    return Math.round(Math.max(1200000, Math.min(6500000, downlink * 1000000 * 0.68)));
  }

  // En navegadores que no exponen Network Information (p. ej. Safari), evitamos
  // el antiguo arranque ultraconservador de 500 kbps sin forzar 1080p.
  return window.matchMedia?.('(min-width: 760px)')?.matches ? 3800000 : 2800000;
}

function setupBunnyStreamVideo(video) {
  if (!video || video.dataset.bunnyStream !== '1' || video.dataset.streamAttached === '1') return;
  const source=String(video.dataset.streamSrc || '');
  if (!source) return;
  video.dataset.streamAttached='1';
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari/iOS usan HLS nativo y gestionan la calidad adaptativa directamente.
    video.src=source;
    return;
  }
  if (window.Hls?.isSupported?.()) {
    const startupEstimate=hlsStartupBandwidthEstimate();
    const hls=new window.Hls({
      enableWorker:true,
      lowLatencyMode:false,
      maxBufferLength:30,
      maxMaxBufferLength:60,
      capLevelToPlayerSize:true,
      startLevel:-1,
      testBandwidth:false,
      abrEwmaDefaultEstimate:startupEstimate,
      abrEwmaDefaultEstimateMax:6500000,
      abrBandWidthFactor:0.90,
      abrBandWidthUpFactor:0.80
    });
    hls.loadSource(source);
    hls.attachMedia(video);
    video._iaHls=hls;
    hls.on(window.Hls.Events.ERROR, (_event,data) => {
      if (!data?.fatal) return;
      if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
        try { hls.startLoad(); } catch (_) {}
      } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
        try { hls.recoverMediaError(); } catch (_) {}
      } else {
        try { hls.destroy(); } catch (_) {}
        video.dataset.streamAttached='error';
      }
    });
    return;
  }
  video.dataset.streamAttached='unsupported';
}

function setupBunnyStreams(root=document) {
  root.querySelectorAll?.('video[data-bunny-stream="1"]').forEach(setupBunnyStreamVideo);
}

function mediaWatermarkHtml(item) {
  if (!item?.watermarked) return '';
  const username=state.me?.username ? `@${state.me.username}` : 'Instant Admirers';
  const label=`${username} · instantadmirers.com`;
  return `<span class="media-watermark watermark-a" aria-hidden="true">${escapeHtml(label)}</span><span class="media-watermark watermark-b" aria-hidden="true">${escapeHtml(label)}</span>`;
}


// V1.12.14 · Visor de imagen completa para publicaciones y contenido compartido.
function imageViewerAttrs(item) {
  const protectedFlag=item?.media_protected ? '1' : '0';
  const watermarkedFlag=item?.watermarked ? '1' : '0';
  return ` data-image-viewer="1" data-viewer-protected="${protectedFlag}" data-viewer-watermarked="${watermarkedFlag}" role="button" tabindex="0" aria-label="Ver imagen completa" title="Ver imagen completa" onclick="openImageViewerFromElement(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openImageViewerFromElement(this)}"`;
}

function imageViewerFrameAttrs(item) {
  if (!item?.media_url || item?.media_type === 'video') return '';
  const protectedFlag=item?.media_protected ? '1' : '0';
  const watermarkedFlag=item?.watermarked ? '1' : '0';
  return ` data-image-viewer-frame="1" data-viewer-protected="${protectedFlag}" data-viewer-watermarked="${watermarkedFlag}" role="button" tabindex="0" aria-label="Ver imagen completa" title="Ver imagen completa" onclick="openImageViewerFromFrame(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openImageViewerFromFrame(this)}"`;
}

function showFullImageViewer(img, source={}) {
  if (!img) return;
  const src=String(img.currentSrc || img.src || '').trim();
  if (!src) return;
  const protectedMedia=String(source.protected ?? img.dataset.viewerProtected ?? '') === '1' || Boolean(img.closest?.('[data-protected-media-frame="1"]'));
  const watermarked=String(source.watermarked ?? img.dataset.viewerWatermarked ?? '') === '1' || Boolean(img.closest?.('.protected-media-frame')?.querySelector?.('.media-watermark'));
  const alt=String(img.alt || 'Imagen de publicación');
  const protectionAttrs=protectedMedia ? ' data-protected-media-frame="1" oncontextmenu="return false" ondragstart="return false"' : '';
  const imageProtectionAttrs=protectedMedia ? ' data-protected-media="1" draggable="false" oncontextmenu="return false"' : '';
  const watermarks=watermarked ? mediaWatermarkHtml({watermarked:true}) : '';
  $('#modal-root').innerHTML = `<div class="image-viewer-backdrop" onclick="if(event.target===this)closeModal()">
    <div class="image-viewer-dialog" role="dialog" aria-modal="true" aria-label="Imagen completa">
      <div class="image-viewer-head"><b>Imagen completa</b><button class="image-viewer-close" type="button" aria-label="Cerrar" onclick="closeModal()">×</button></div>
      <div class="image-viewer-stage ${protectedMedia || watermarked ? 'protected-media-frame' : ''}"${protectionAttrs}>
        <img class="image-viewer-image" src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${imageProtectionAttrs}>
        ${watermarks}
      </div>
      <div class="image-viewer-hint">Pulsa fuera de la imagen o Esc para cerrar</div>
    </div>
  </div>`;
}

window.openImageViewerFromElement = img => showFullImageViewer(img);
window.openImageViewerFromFrame = frame => {
  const img=frame?.querySelector?.('img');
  if (!img) return;
  showFullImageViewer(img,{protected:frame.dataset.viewerProtected,watermarked:frame.dataset.viewerWatermarked});
};

function protectedMediaFrame(item, mediaHtml, className='') {
  if (!mediaHtml && item?.media_processing) return `<div class="media-processing"><span>◌</span><b>${escapeHtml(window.IAI18N?.t?.('Procesando vídeo…','Processing video…') || 'Procesando vídeo…')}</b><small>${escapeHtml(window.IAI18N?.t?.('Estará disponible en unos momentos.','It will be available in a few moments.') || 'Estará disponible en unos momentos.')}</small></div>`;
  if (!mediaHtml) return '';
  if (!item?.media_protected && !item?.watermarked) return mediaHtml;
  const imageFrameAttrs=imageViewerFrameAttrs(item);
  return `<div class="protected-media-frame ${escapeAttr(className)}" data-protected-media-frame="1" oncontextmenu="return false" ondragstart="return false"${imageFrameAttrs}>${mediaHtml}${mediaWatermarkHtml(item)}</div>`;
}

function repostEmbed(r) {
  if (!r) return '';
  if (r.unavailable) return `<div class="repost-embed unavailable">Esta publicación ya no está disponible.</div>`;
  const rawMedia = r.media_url ? (r.media_type === 'video'
    ? `<video class="repost-media"${mediaVideoSourceAttrs(r)} controls playsinline preload="none" data-lazy-video="1"${mediaProtectionAttrs(r,{video:true})}></video>`
    : `<img class="repost-media" src="${escapeAttr(r.media_url)}" loading="lazy" decoding="async" alt=""${mediaProtectionAttrs(r)}${imageViewerAttrs(r)}>` ) : '';
  const media = protectedMediaFrame(r,rawMedia,'repost-protected-media');
  return `<div class="repost-embed">
    <button class="repost-author" onclick="openProfile('${escapeAttr(r.username)}')">${avatar(r,'small')}<span><b>${escapeHtml(r.name)}</b><small>@${escapeHtml(r.username)} · ${timeAgo(r.created_at)}</small></span></button>
    ${r.text ? `<div class="repost-text">${formatText(r.text)}</div>` : ''}
    ${media}
  </div>`;
}

function postHtml(p) {
  const rawMedia = p.media_url ? (p.media_type === 'video'
    ? `<video class="post-media"${mediaVideoSourceAttrs(p)} controls playsinline preload="none" data-lazy-video="1"${mediaProtectionAttrs(p,{video:true})}></video>`
    : `<img class="post-media" src="${escapeAttr(p.media_url)}" loading="lazy" decoding="async" alt="Publicación de ${escapeAttr(p.username)}"${mediaProtectionAttrs(p)}${imageViewerAttrs(p)}>` ) : '';
  const media = protectedMediaFrame(p,rawMedia,'post-protected-media');
  const privacy = p.visibility === 'followers' ? ' · 👥' : '';
  const edited = p.edited_at ? ' · editado' : '';
  const encodedText = safeEncode(p.text || '');
  return `<article class="card post ${p.repost_of_id ? 'is-repost' : ''}" data-post="${p.id}">
    ${p.recommendation_reason ? `<div class="recommendation-label">✦ ${escapeHtml(p.recommendation_reason)}</div>` : ''}
    ${p.repost_of_id ? `<div class="repost-label">↻ ${escapeHtml(p.name)} republicó una publicación</div>` : ''}
    <div class="post-head">
      <button class="person-link" onclick="openProfile('${escapeAttr(p.username)}')">${avatar(p)}<span><b>${escapeHtml(p.name)}</b><small>@${escapeHtml(p.username)} · ${timeAgo(p.created_at)}${edited}${privacy}</small></span></button>
      ${p.own ? `<button class="icon-btn" title="Opciones" onclick="openPostMenu(${p.id},'${encodedText}','${escapeAttr(p.visibility || 'public')}')">•••</button>` : `<button class="icon-btn" title="Opciones" onclick="openOtherPostMenu(${p.id},${Number(p.user_id)},'${escapeAttr(p.username)}')">•••</button>`}
    </div>
    ${p.text ? `<div class="post-text">${formatText(p.text)}</div>` : ''}
    ${media}
    ${p.repost_of_id ? repostEmbed(p.repost) : ''}
    <div class="post-actions">
      <button class="action ${p.liked ? 'liked' : ''}" onclick="likePost(${p.id})"><span>${p.liked ? '♥' : '♡'}</span><b>${p.likes_count}</b></button>
      <button class="action" onclick="openComments(${p.id})"><span>◌</span><b>${p.comments_count}</b></button>
      <button class="action" onclick="sharePost(${p.id})" title="Compartir"><span>↗</span></button>
      <button class="action push ${p.saved ? 'saved' : ''}" onclick="savePost(${p.id})"><span>${p.saved ? '▰' : '▱'}</span></button>
    </div>
  </article>`;
}

window.openPostMenu = (id, encodedText, visibility) => {
  modal(`<div class="modal-head"><h3>Publicación</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="post-menu">
      <button onclick="editPostModal(${id},'${encodedText}','${escapeAttr(visibility)}')"><span>✎</span><div><b>Editar publicación</b><small>Cambiar texto o privacidad</small></div></button>
      <button class="danger-option" onclick="closeModal();deletePost(${id})"><span>⌫</span><div><b>Eliminar publicación</b><small>Se eliminará definitivamente</small></div></button>
    </div>`);
};


window.openOtherPostMenu = (postId, userId, username) => {
  modal(`<div class="modal-head"><h3>Opciones</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="post-menu">
      <button onclick="closeModal();openProfile('${escapeAttr(username)}')"><span>◎</span><div><b>Ver perfil</b><small>@${escapeHtml(username)}</small></div></button>
      <button onclick="closeModal();toggleMute(${userId},'${escapeAttr(username)}')"><span>◌</span><div><b>Silenciar</b><small>Dejar de ver su contenido en tus feeds</small></div></button>
      <button onclick="reportModal({postId:${postId},userId:${userId},username:'${escapeAttr(username)}'})"><span>!</span><div><b>Denunciar publicación</b><small>Enviar a revisión por las normas de la comunidad</small></div></button>
      <button class="danger-option" onclick="closeModal();toggleBlock(${userId},'${escapeAttr(username)}')"><span>⊘</span><div><b>Bloquear a @${escapeHtml(username)}</b><small>Dejaréis de poder interactuar entre vosotros</small></div></button>
    </div>`);
};

window.editPostModal = (id, encodedText, visibility) => {
  const text = decodeURIComponent(encodedText || '');
  modal(`<div class="modal-head"><h3>Editar publicación</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="edit-post-modal">
      <textarea id="editPostText" rows="7" maxlength="5000">${escapeHtml(text)}</textarea>
      <div class="edit-post-tools"><span>Privacidad</span><select id="editPostVisibility"><option value="public" ${visibility==='public'?'selected':''}>🌍 Público</option><option value="followers" ${visibility==='followers'?'selected':''}>👥 Seguidores</option></select></div>
      <button class="btn primary" onclick="savePostEdit(${id})">Guardar cambios</button>
    </div>`);
};

window.savePostEdit = async (id) => {
  try {
    await api(`/api/posts/${id}`, { method:'PATCH', body:JSON.stringify({ text:$('#editPostText').value, visibility:$('#editPostVisibility').value }) });
    closeModal(); toast('Publicación actualizada'); await renderView();
  } catch(e) { toast(e.message,'error'); }
};

function feedTabs() {
  return `<div class="feed-tabs" role="tablist" aria-label="Tipo de feed">
    <button class="${state.feedMode === 'following' ? 'active' : ''}" onclick="setFeedMode('following')">Siguiendo</button>
    <button class="${state.feedMode === 'for-you' ? 'active' : ''}" onclick="setFeedMode('for-you')">✦ Para ti</button>
  </div>`;
}

window.setFeedMode = async (mode) => {
  if (!['following','for-you'].includes(mode)) return;
  state.feedMode = mode;
  localStorage.setItem('feedMode', mode);
  if (state.view !== 'feed') return go('feed');
  await renderFeed();
};

function personalizeHint() {
  if (state.feedMode !== 'for-you' || String(state.me?.interests || '').trim()) return '';
  return `<div class="personalize-hint"><span>✦</span><div><b>Haz “Para ti” más tuyo</b><small>Añade tus intereses al perfil y las recomendaciones mejorarán.</small></div><button class="text-btn" onclick="editProfile()">Añadir</button></div>`;
}

function activationChecklistHtml(data) {
  if(!data || data.completed) return '';
  const steps=[
    {done:data.has_avatar,label:'Añade una foto',action:"editProfile()"},
    {done:data.has_profile,label:'Completa tu perfil',action:"editProfile()"},
    {done:data.has_post,label:'Haz tu primera publicación',action:"openComposerModal()"},
    {done:data.follows_someone,label:'Sigue a alguien',action:"go('discover')"}
  ];
  return `<section class="card activation-checklist"><div class="activation-head"><div><small>PRIMEROS PASOS</small><h3>Prepara tu cuenta</h3><p>${Number(data.steps || 0)} de ${Number(data.total || 4)} completados</p></div><span>${Number(data.steps || 0)}/${Number(data.total || 4)}</span></div><div class="activation-progress"><i style="width:${Math.round((Number(data.steps||0)/Math.max(1,Number(data.total||4)))*100)}%"></i></div><div class="activation-steps">${steps.map(step=>`<button class="${step.done?'done':''}" onclick="${step.action}"><i>${step.done?'✓':'○'}</i><span>${step.label}</span></button>`).join('')}</div></section>`;
}



function communityPulseHtml(community){
  if(!community || !['pilot','public'].includes(community.phase)) return '';
  const m=community.metrics||{};
  const founder=community.viewer?.founding_member ? `<span class="founding-member-chip">✦ Miembro fundador #${Number(community.viewer.cohort_rank||0)}</span>` : '';
  return `<div class="community-pulse">${founder}<span><b>${Number(m.members_total||0)}</b> miembros reales</span><span><b>${Number(m.posts_7d||0)}</b> posts esta semana</span><span><b>${Number(m.active_7d||0)}</b> activos 7 d</span></div>`;
}


async function renderFeed() {
  resetLazyMediaObserver();
  const mode = state.feedMode;
  const endpoint = mode === 'for-you' ? '/api/for-you' : '/api/feed';
  const firstUrl = `${endpoint}?limit=15${mode === 'for-you' ? '&offset=0' : ''}`;
  const [rawPage, stories, activation, community] = await Promise.all([api(firstUrl), api('/api/stories'), api('/api/onboarding/checklist').catch(()=>null), api('/api/community/bootstrap').catch(()=>null)]);
  state.community=community || state.community;
  const page = normalizePagePayload(rawPage);
  const rows = page.items;
  const empty = mode === 'for-you'
    ? `<div class="card empty feed-empty"><div class="empty-icon">✦</div><h3>Estamos preparando tu Para ti</h3><p>Interactúa con publicaciones, sigue perfiles o añade intereses para afinarlo.</p><div class="empty-actions"><button class="btn primary compact" onclick="go('discover')">Descubrir</button><button class="btn ghost compact" onclick="editProfile()">Mis intereses</button></div></div>`
    : `<div class="card empty feed-empty"><div class="empty-icon">⌂</div><h3>Tu feed está empezando</h3><p>${isSystemAccount()?'No hay publicaciones visibles en este momento.':'Sigue personas desde Descubrir o crea tu primera publicación.'}</p><div class="empty-actions"><button class="btn primary compact" onclick="go('discover')">Descubrir</button>${isSystemAccount()?'':`<button class="btn ghost compact" onclick="openComposerModal()">Publicar</button>`}</div></div>`;
  $('#main').innerHTML = `<div class="feed-start">${isSystemAccount()?'':activationChecklistHtml(activation)}${communityPulseHtml(community)}${storyStrip(stories)}${composer()}${feedTabs()}${personalizeHint()}</div><div class="post-list" id="feedPostList">${rows.length ? rows.map(postHtml).join('') : empty}</div>${pagerHtml('feed', page.has_more)}`;
  setupLazyMedia($('#main'));
  void mountFeedAd();
  installInfinitePager('feed', page, async pager => {
    if (state.view !== 'feed' || state.feedMode !== mode) return;
    const nextRaw = await api(pageUrl(endpoint, pager, 15));
    const next = normalizePagePayload(nextRaw);
    appendPostItems('feedPostList', next.items);
    pager.hasMore = next.has_more;
    pager.nextCursor = next.next_cursor;
    pager.nextOffset = next.next_offset;
  }, { mode });
}



function followButtonHtml(u, klass = 'btn primary compact') {
  if (isSystemAccount()) return '';
  if (u.following) return `<button class="btn ghost compact follow-btn" onclick="toggleFollow(${u.id},'${escapeAttr(u.username)}')">Siguiendo</button>`;
  if (u.follow_requested) return `<button class="btn ghost compact follow-btn requested" onclick="toggleFollow(${u.id},'${escapeAttr(u.username)}')">Solicitud enviada</button>`;
  const label = u.account_private ? 'Solicitar seguir' : 'Seguir';
  return `<button class="${klass} follow-btn" onclick="toggleFollow(${u.id},'${escapeAttr(u.username)}')">${u.account_private ? '🔒 ' : ''}${label}</button>`;
}

function suggestionCard(u) {
  return `<article class="suggestion-card">
    <button class="suggestion-person" onclick="openProfile('${escapeAttr(u.username)}')">${avatar(u,'large')}<b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.username)}</small></button>
    ${u.headline ? `<p>${escapeHtml(u.headline).slice(0,90)}</p>` : ''}
    <div class="suggestion-reason">✦ ${escapeHtml(u.recommendation_reason || 'Sugerido para ti')}</div>
    ${followButtonHtml(u)}
  </article>`;
}


function newcomerCard(u){
  return `<article class="suggestion-card newcomer-card"><span class="newcomer-badge">NUEVO</span><button class="suggestion-person" onclick="openProfile('${escapeAttr(u.username)}')">${avatar(u,'large')}<b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.username)}</small></button>${u.headline?`<p>${escapeHtml(u.headline).slice(0,90)}</p>`:''}<div class="suggestion-reason">✦ Recién llegado</div>${followButtonHtml(u)}</article>`;
}

async function renderDiscover() {
  resetLazyMediaObserver();
  const [rawPage,trends,suggestions,community] = await Promise.all([api('/api/discover?limit=15&offset=0'),api('/api/trending'),api('/api/suggestions?limit=8'),api('/api/community/bootstrap').catch(()=>null)]);
  state.community=community || state.community;
  const page = normalizePagePayload(rawPage);
  const rows = page.items;
  const trendStrip = trends.length ? `<div class="trend-strip">${trends.slice(0,8).map(t=>`<button onclick="searchTag('${escapeAttr(t.tag)}')"><b>${escapeHtml(t.tag)}</b><small>${t.count} posts · ${t.authors} personas</small></button>`).join('')}</div>` : '';
  const newcomers = community?.settings?.newcomer_spotlight_enabled && community?.newcomers?.length ? `<section class="discover-people newcomer-spotlight"><div class="section-heading"><div><h3>Recién llegados</h3><p>Da la bienvenida a personas que acaban de unirse.</p></div></div><div class="suggestion-scroll">${community.newcomers.map(newcomerCard).join('')}</div></section>` : '';
  const people = suggestions.length ? `<section class="discover-people"><div class="section-heading"><div><h3>Personas para ti</h3><p>Perfiles recomendados según tu actividad e intereses.</p></div></div><div class="suggestion-scroll">${suggestions.map(suggestionCard).join('')}</div></section>` : '';
  $('#main').innerHTML = `${pageHeader('Descubrir','Encuentra personas, temas y contenido nuevo')}${communityPulseHtml(community)}${newcomers}${people}${trendStrip}<div class="section-heading post-discover-heading"><div><h3>Popular ahora</h3><p>Publicaciones públicas con más conversación reciente.</p></div></div><div class="post-list" id="discoverPostList">${rows.length ? rows.map(postHtml).join('') : `<div class="card empty"><div class="empty-icon">✦</div><h3>Aún no hay contenido público</h3><p>Cuando la comunidad publique contenido público, aparecerá aquí.</p><button class="btn primary compact" onclick="openComposerModal()">Publicar primero</button></div>`}</div>${pagerHtml('discover', page.has_more)}`;
  setupLazyMedia($('#main'));
  installInfinitePager('discover', page, async pager => {
    if (state.view !== 'discover') return;
    const next = normalizePagePayload(await api(pageUrl('/api/discover', pager, 15)));
    appendPostItems('discoverPostList', next.items);
    pager.hasMore = next.has_more;
    pager.nextCursor = next.next_cursor;
    pager.nextOffset = next.next_offset;
  });
}



async function renderBookmarks() {
  resetLazyMediaObserver();
  const page = normalizePagePayload(await api('/api/bookmarks?limit=15&offset=0'));
  const rows = page.items;
  $('#main').innerHTML = `${pageHeader('Guardados','Solo tú puedes ver lo que guardas')}<div class="post-list" id="bookmarkPostList">${rows.length ? rows.map(postHtml).join('') : `<div class="card empty"><div class="empty-icon">▱</div><h3>No has guardado nada todavía</h3><p>Usa el icono de marcador de cualquier publicación.</p></div>`}</div>${pagerHtml('bookmarks', page.has_more)}`;
  setupLazyMedia($('#main'));
  installInfinitePager('bookmarks', page, async pager => {
    if (state.view !== 'bookmarks') return;
    const next = normalizePagePayload(await api(pageUrl('/api/bookmarks', pager, 15)));
    appendPostItems('bookmarkPostList', next.items);
    pager.hasMore = next.has_more;
    pager.nextCursor = next.next_cursor;
    pager.nextOffset = next.next_offset;
  });
}



window.likePost = async (id) => {
  const buttons = [...document.querySelectorAll(`[data-post="${Number(id)}"] .post-actions .action`)].filter((_,i)=>i===0);
  if (buttons.some(b => b.disabled)) return;
  buttons.forEach(b => b.disabled = true);
  try {
    const d = await api(`/api/posts/${id}/like`, { method:'POST' });
    buttons.forEach(btn => {
      btn.classList.toggle('liked', Boolean(d.liked));
      const icon=btn.querySelector('span'); if(icon) icon.textContent=d.liked?'♥':'♡';
      const count=btn.querySelector('b'); if(count) count.textContent=String(d.count ?? 0);
    });
  } catch (e) { toast(e.message, 'error'); }
  finally { buttons.forEach(b => b.disabled = false); }
};

window.savePost = async (id) => {
  const article = document.querySelector(`[data-post="${Number(id)}"]`);
  const btn = article?.querySelector('.post-actions .action.push');
  if (btn?.disabled) return;
  if (btn) btn.disabled = true;
  try {
    const d = await api(`/api/posts/${id}/bookmark`, { method:'POST' });
    if (btn) { btn.classList.toggle('saved', Boolean(d.saved)); const icon=btn.querySelector('span'); if(icon) icon.textContent=d.saved?'▰':'▱'; }
    toast(d.saved ? 'Guardado' : 'Eliminado de guardados');
    if (!d.saved && state.view === 'bookmarks' && article) {
      article.remove();
      if (!document.querySelector('.post-list .post')) $('#main').innerHTML = `${pageHeader('Guardados','Solo tú puedes ver lo que guardas')}<div class="post-list"><div class="card empty"><div class="empty-icon">▱</div><h3>No has guardado nada todavía</h3><p>Usa el icono de marcador de cualquier publicación.</p></div></div>`;
    }
  } catch (e) { toast(e.message, 'error'); }
  finally { if (btn?.isConnected) btn.disabled = false; }
};

window.deletePost = async (id) => {
  if (!confirm('¿Eliminar esta publicación?')) return;
  try { await api(`/api/posts/${id}`, { method:'DELETE' }); toast('Publicación eliminada'); await refreshMe(false); await renderView(); }
  catch (e) { toast(e.message, 'error'); }
};

window.openComments = async (postId) => {
  try {
    const rows = await api(`/api/posts/${postId}/comments`);
    modal(`<div class="modal-head"><h3>Comentarios</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
      <div class="comments" id="commentList">${rows.length ? rows.map(commentHtml).join('') : `<div class="empty compact-empty">Sé la primera persona en comentar.</div>`}</div>
      <div class="comment-compose"><input id="commentText" maxlength="1000" placeholder="Escribe un comentario…" onkeydown="if(event.key==='Enter')sendComment(${postId})"><button id="commentSendBtn" class="btn primary compact" onclick="sendComment(${postId})">Enviar</button></div>`);
    setTimeout(() => $('#commentText')?.focus(), 50);
  } catch (e) { toast(e.message, 'error'); }
};

function commentHtml(c) {
  return `<div class="comment">${avatar(c, 'small')}<div class="comment-bubble"><div><button class="inline-person" onclick="closeModal();openProfile('${escapeAttr(c.username)}')"><b>${escapeHtml(c.name)}</b> <span>@${escapeHtml(c.username)}</span></button></div><p>${formatText(c.text)}</p><small>${timeAgo(c.created_at)}</small></div>${c.own ? `<button class="icon-btn tiny-btn" onclick="deleteComment(${c.id},${c.post_id})">×</button>` : ''}</div>`;
}

window.sendComment = async (postId) => {
  const input = $('#commentText'); const btn=$('#commentSendBtn'); const text = input?.value.trim(); if (!text || btn?.disabled) return;
  try {
    if(btn){btn.disabled=true;btn.textContent='Enviando…';} if(input) input.disabled=true;
    await api(`/api/posts/${postId}/comments`, { method:'POST', body:JSON.stringify({ text }) });
    await openComments(postId); await refreshMe(false);
  } catch (e) { toast(e.message, 'error'); }
  finally { if(btn?.isConnected){btn.disabled=false;btn.textContent='Enviar';} if(input?.isConnected) input.disabled=false; }
};
window.deleteComment = async (id, postId) => {
  try { await api(`/api/comments/${id}`, { method:'DELETE' }); await openComments(postId); }
  catch (e) { toast(e.message, 'error'); }
};

async function renderSearch() {
  $('#main').innerHTML = `${pageHeader('Buscar','Encuentra personas, publicaciones y hashtags')}
    <div class="card search-card"><div class="search-box"><span>⌕</span><input id="searchInput" value="${escapeAttr(state.search)}" placeholder="Buscar en Instant Admirers" onkeydown="if(event.key==='Enter')runSearch()"><button class="btn primary compact" onclick="runSearch()">Buscar</button></div></div>
    <div id="searchResults">${state.search ? 'Buscando…' : `<div class="card empty"><div class="empty-icon">⌕</div><h3>Busca algo</h3><p>Prueba con un nombre, @usuario, palabra o #hashtag.</p></div>`}</div>`;
  if (state.search) await runSearch(false);
}

window.runSearch = async (updateState = true) => {
  const q = ($('#searchInput')?.value || state.search).trim();
  if (updateState) state.search = q;
  if (!q) return renderSearch();
  try {
    const d = await api('/api/search?q=' + encodeURIComponent(q));
    const users = d.users.length ? `<div class="card result-section"><h3>Personas</h3>${d.users.map(userRow).join('')}</div>` : '';
    const posts = d.posts.length ? `<div class="result-section"><h3 class="section-title">Publicaciones</h3>${d.posts.map(postHtml).join('')}</div>` : '';
    $('#searchResults').innerHTML = users + posts || `<div class="card empty"><h3>Sin resultados</h3><p>No encontramos nada para “${escapeHtml(q)}”.</p></div>`;
    setupLazyMedia($('#searchResults'));
  } catch (e) { toast(e.message, 'error'); }
};

window.searchTag = async (tag) => { state.search = tag; await go('search'); };

function userRow(u) {
  const summary = u.headline || u.bio || '';
  return `<div class="user-row"><button class="person-link" onclick="openProfile('${escapeAttr(u.username)}')">${avatar(u)}<span><b>${escapeHtml(u.name)}${u.account_private ? ' <i class="private-mini">🔒</i>' : ''}</b><small>@${escapeHtml(u.username)}</small>${summary ? `<em>${escapeHtml(summary).slice(0,90)}</em>` : ''}</span></button>${followButtonHtml(u)}</div>`;
}

window.openProfile = async (username, opts = {}) => { if (isSystemAccount() && String(username||'').toLowerCase()===String(state.me?.username||'').toLowerCase()) return go('admin',opts); if (state.messagePoll) { clearInterval(state.messagePoll); state.messagePoll = null; } resetViewObservers(); state.view = 'profile'; state.profile = username; if (opts.history !== false) setProfileBrowserUrl(username, { replace:Boolean(opts.replace) }); layout(); await renderProfile(username); };

async function renderProfile(username) {
  resetLazyMediaObserver();
  const campaign=currentGrowthCampaign();
  const u = await api('/api/users/' + encodeURIComponent(username) + (campaign ? '?campaign=' + encodeURIComponent(campaign) : ''));
  state.profileData = u;
  document.title = `${u.name || u.username} (@${u.username}) · Instant Admirers`;
  const canonical = document.querySelector('link[rel="canonical"]'); if (canonical) canonical.href = profileUrl(u.username);
  const profileLocked = Boolean(u.profile_locked);
  let postPage = { items:[], has_more:false, next_cursor:null, next_offset:null };
  if (!u.blocked_by_me && !profileLocked) postPage = normalizePagePayload(await api('/api/users/' + encodeURIComponent(username) + '/posts?limit=15'));
  const posts = postPage.items;
  const website = u.website ? `<a class="profile-link" href="${escapeAttr(normalizeUrl(u.website))}" target="_blank" rel="noopener">↗ ${escapeHtml(u.website)}</a>` : '';
  const interests = String(u.interests || '').split(',').map(x=>x.trim()).filter(Boolean).slice(0,10);
  const privateLocked = !profileLocked && u.account_private && !u.own && !u.following;
  let actions = '';
  if (u.own) {
    actions = `<div class="profile-desktop-actions"><button class="btn ghost compact" onclick="sharePublicProfile('${escapeAttr(u.username)}')">Compartir perfil</button><button class="btn ghost compact" onclick="go('friends')">Personas</button><button class="btn ghost compact" onclick="openFriendGateSettings()">🔐 Condición</button><button class="btn ghost compact" onclick="openPrivacySettings()">Privacidad</button><button class="btn ghost compact" onclick="openAccountSettings()">Ajustes</button>${state.me?.is_admin ? `<button class="btn ghost compact" onclick="go('admin')">Administración</button>` : ''}<button class="btn ghost compact" onclick="editProfile()">Editar perfil</button></div><div class="profile-mobile-actions"><button class="btn ghost compact profile-edit-mobile" onclick="editProfile()">Editar perfil</button><button class="icon-btn profile-own-more" title="Más opciones" aria-label="Más opciones de perfil" onclick="openOwnProfileMenu()">•••</button></div>`;
  } else if (u.blocked_by_me) {
    actions = `<button class="btn primary compact" onclick="toggleBlock(${u.id},'${escapeAttr(u.username)}')">Desbloquear</button>`;
  } else {
    actions = isSystemAccount() ? '' : `${u.can_message?`<button class="btn ghost compact" onclick="startMessage(${u.id})">Mensaje</button>`:''}${friendButton(u)}${followButtonHtml(u)}<button class="icon-btn profile-more" title="Más opciones" onclick="openProfileMenu(${u.id},'${escapeAttr(u.username)}',${u.muted?'true':'false'})">•••</button>`;
  }
  $('#main').innerHTML = `<section class="card profile-card profile-card-v7">
    <div class="profile-cover ${u.cover ? 'has-cover' : ''}">${u.cover ? `<img src="${escapeAttr(u.cover)}" decoding="async" alt="">` : ''}</div>
    <div class="profile-main-v7">
      <div class="profile-top">${avatar(u, 'xl')}<div class="profile-cta">${actions}</div></div>
      <h2>${escapeHtml(u.name)}${u.account_private ? ' <span class="private-badge" title="Cuenta privada">🔒</span>' : ''}</h2><div class="handle">@${escapeHtml(u.username)}</div>
      ${u.headline ? `<div class="profile-headline">${escapeHtml(u.headline)}</div>` : ''}
      ${!u.blocked_by_me ? `<div class="profile-presence">${presenceHtml(u)}</div>` : ''}
      ${u.blocked_by_me ? `<div class="privacy-notice blocked-notice"><b>Has bloqueado a esta persona</b><span>No podéis ver vuestro contenido ni interactuar mientras esté bloqueada.</span></div>` : ''}
      ${u.bio && !u.blocked_by_me ? `<p class="profile-bio">${formatText(u.bio)}</p>` : ''}
      ${!u.blocked_by_me ? `<div class="profile-meta">${u.location ? `<span>⌖ ${escapeHtml(u.location)}</span>` : ''}${website}</div>` : ''}
      ${interests.length && !u.blocked_by_me ? `<div class="interest-chips">${interests.map(x=>`<button onclick="searchTag('#${escapeAttr(x.replace(/^#/,'').replace(/\s+/g,'_'))}')">${escapeHtml(x)}</button>`).join('')}</div>` : ''}
      ${profileLocked
        ? `<div class="profile-stats locked-profile-stats"><span>🔐 Perfil con acceso especial</span></div>`
        : `<div class="profile-stats"><span><b>${u.posts_count}</b> publicaciones</span><button type="button" onclick="openFollowList('${escapeAttr(u.username)}','followers')" title="Ver seguidores"><b>${u.followers_count}</b> seguidores</button><button type="button" onclick="openFollowList('${escapeAttr(u.username)}','following')" title="Ver a quién sigue"><b>${u.following_count}</b> siguiendo</button>${u.own ? `<button onclick="go('friends')"><b>${u.friends_count || 0}</b> amigos</button>` : `<span><b>${u.friends_count || 0}</b> amigos</span>`}</div>`}
    </div>
  </section>
  ${friendGateBanner(u)}
  ${privateLocked ? `<div class="card private-profile-lock"><div>🔒</div><h3>Esta cuenta es privada</h3><p>Envía una solicitud para ver sus publicaciones y Stories.</p>${u.follow_requested ? '<span>Solicitud de seguimiento enviada</span>' : followButtonHtml(u)}</div>` : ''}
  ${!u.blocked_by_me && !privateLocked && !profileLocked ? `<div class="profile-section-title">Publicaciones</div><div class="post-list" id="profilePostList">${posts.length ? posts.map(postHtml).join('') : `<div class="card empty profile-empty"><div class="empty-icon">▧</div><h3>Sin publicaciones todavía</h3><p>${u.own ? 'Tu primera publicación aparecerá aquí.' : 'Cuando publique algo, aparecerá aquí.'}</p>${u.own ? '<button class="btn primary compact" onclick="openComposerModal()">Crear publicación</button>' : ''}</div>`}</div>${pagerHtml('profile', postPage.has_more)}` : ''}`;
  setupLazyMedia($('#main'));
  void mountProfileAd(u.username);
  if (!u.blocked_by_me && !privateLocked && !profileLocked) {
    const canonicalUsername = u.username;
    installInfinitePager('profile', postPage, async pager => {
      if (state.view !== 'profile' || String(state.profile || '').toLowerCase() !== String(canonicalUsername).toLowerCase()) return;
      const next = normalizePagePayload(await api(pageUrl('/api/users/' + encodeURIComponent(canonicalUsername) + '/posts', pager, 15)));
      appendPostItems('profilePostList', next.items);
      pager.hasMore = next.has_more;
      pager.nextCursor = next.next_cursor;
      pager.nextOffset = next.next_offset;
    }, { username:canonicalUsername });
  }
}

window.openProfileMenu = (userId, username, muted = false) => {
  modal(`<div class="modal-head"><h3>@${escapeHtml(username)}</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="post-menu">
      <button onclick="closeModal();sharePublicProfile('${escapeAttr(username)}')"><span>↗</span><div><b>Compartir perfil</b><small>${escapeHtml(profileUrl(username))}</small></div></button>
      <button onclick="closeModal();toggleMute(${userId},'${escapeAttr(username)}')"><span>◌</span><div><b>${muted ? 'Dejar de silenciar' : 'Silenciar'}</b><small>${muted ? 'Volver a mostrar su contenido' : 'Ocultar sus posts y Stories de tus feeds'}</small></div></button>
      <button onclick="reportModal({userId:${userId},username:'${escapeAttr(username)}'})"><span>!</span><div><b>Denunciar perfil</b><small>Enviar este perfil a revisión</small></div></button>
      <button class="danger-option" onclick="closeModal();toggleBlock(${userId},'${escapeAttr(username)}')"><span>⊘</span><div><b>Bloquear</b><small>Impide seguimiento, amistad y mensajes</small></div></button>
    </div>`);
};


function friendButton(u) {
  if (isSystemAccount() || !u || u.own) return '';
  if (u.friendship_status === 'friends') return `<button class="btn ghost compact friendship-btn" onclick="removeFriend(${u.id},'${escapeAttr(u.username)}')">✓ Amigos</button>`;
  if (u.friendship_status === 'sent') return `<button class="btn ghost compact friendship-btn" onclick="sendFriendRequest(${u.id},'${escapeAttr(u.username)}')">Solicitud enviada</button>`;
  if (u.friendship_status === 'received') return `<button class="btn primary compact friendship-btn" onclick="acceptFriendRequest(${Number(u.friend_request_id)},'${escapeAttr(u.username)}')">Aceptar amistad</button>`;
  if (u.friend_gate?.enabled && !u.friend_gate.unlocked) {
    const progress=Math.max(0,Number(u.friend_gate.progress||0)), required=Math.max(1,Number(u.friend_gate.required||5));
    return `<button class="btn ghost compact friendship-btn gate-btn" onclick="openFriendGateChallenge()">🔒 Acceso ${Math.min(progress,required)}/${required}</button>`;
  }
  if (u.friend_gate?.enabled && u.friend_gate.unlocked) return `<button class="btn primary compact friendship-btn" onclick="sendFriendRequest(${u.id},'${escapeAttr(u.username)}')">✓ Acceso conseguido</button>`;
  return `<button class="btn ghost compact friendship-btn" onclick="sendFriendRequest(${u.id},'${escapeAttr(u.username)}')">＋ Amigo</button>`;
}

function friendGateBanner(u) {
  const g=u?.friend_gate;
  if(!g?.enabled || u.own || u.friendship_status==='friends') return '';
  const progress=Number(g.progress||0), required=Math.max(1,Number(g.required||1));
  const remaining=Math.max(0,required-progress);
  const pct=Math.min(100,Math.round((progress/required)*100));
  if(g.unlocked) return `<section class="card access-gate-card access-gate-unlocked">
    <div class="access-gate-icon">✓</div>
    <div class="access-gate-copy"><span class="access-gate-kicker">Perfil exclusivo</span><h3>Perfil desbloqueado</h3><p>Has completado el reto. Ya puedes ver todo el contenido de @${escapeHtml(u.username)}.</p></div>
    <button class="btn primary compact" onclick="renderProfile('${escapeAttr(u.username)}')">Ver perfil</button>
  </section>`;
  const detail=g.require_post
    ? `${required} personas nuevas deben crear su cuenta desde tu enlace y publicar al menos 1 post.`
    : `${required} personas nuevas deben crear su cuenta desde tu enlace.`;
  const headline=progress>0 ? `🔥 Ya tienes ${progress}. Te ${remaining===1?'queda':'quedan'} ${remaining}` : `Estás a ${required} invitaciones de entrar`;
  const accessMessage=String(g.access_message || '').trim() || defaultProfileAccessMessage();
  const ownerMessageLabel=window.IAI18N?.t?.('Mensaje de','Message from') || 'Mensaje de';
  return `<section class="card access-gate-card growth-access-gate">
    <div class="access-gate-top">
      <div class="access-gate-icon">🔐</div>
      <div class="access-gate-copy">
        <span class="access-gate-kicker">Perfil exclusivo</span>
        <h3>${headline}</h3>
        <p>${detail}</p>
      </div>
      <div class="access-gate-count"><strong>${progress}</strong><span>/${required}</span></div>
    </div>
    <div class="access-gate-owner-message"><small>${escapeHtml(ownerMessageLabel)} @${escapeHtml(u.username)}</small><p class="user-content">“${escapeHtml(accessMessage)}”</p></div>
    <div class="access-gate-progress-wrap">
      <div class="gate-progress access-gate-progress"><span style="width:${pct}%"></span></div>
      <small>${pct}% completado</small>
    </div>
    <div class="access-gate-bottom">
      <div class="access-gate-note"><span>✓</span><span>Tu cuenta funciona con normalidad mientras completas el reto.</span></div>
      <div class="access-gate-actions">
        <button class="btn primary compact" onclick="openFriendGateChallenge()">Desbloquear perfil</button>
        <button class="btn ghost compact access-gate-skip" onclick="go('feed')">Ahora no</button>
      </div>
    </div>
  </section>`;
}


function normalizeUrl(url) { return /^https?:\/\//i.test(url) ? url : `https://${url}`; }

window.toggleFollow = async (id, username = '') => {
  try {
    const d = await api(`/api/users/${id}/follow`, { method:'POST' });
    if (d.status === 'requested') toast('Solicitud de seguimiento enviada');
    else if (d.status === 'following') toast('Ahora sigues a esta persona');
    else toast('Ya no la sigues');
    await refreshMe(false);
    state.rightbarCache = null;
    const followCtx = state.followListContext ? { ...state.followListContext } : null;
    if (state.view === 'profile' && state.profile) await renderProfile(state.profile); else await renderView();
    if (followCtx) await openFollowList(followCtx.username, followCtx.type);
  } catch (e) { toast(e.message, 'error'); }
};




// V1.9.2 · Seguidores / Siguiendo
state.followListContext = null;

function followListRow(u, ownerUsername, type) {
  const isMe = Number(u.id) === Number(state.me?.id);
  const action = isMe ? '' : followButtonHtml(u, 'btn primary compact');
  return `<div class="follow-list-row" data-follow-user="${Number(u.id)}">
    <button class="person-link" onclick="closeModal();openProfile('${escapeAttr(u.username)}')">${avatar(u,'small')}<span><b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.username)}</small>${u.headline?`<em>${escapeHtml(u.headline).slice(0,70)}</em>`:''}</span></button>
    ${action}
  </div>`;
}

window.openFollowList = async (username, type='following', append=false) => {
  type = type === 'followers' ? 'followers' : 'following';
  const current = state.followListContext;
  const offset = append && current && current.username === username && current.type === type ? Number(current.next_offset || 0) : 0;
  try {
    const data = await api(`/api/users/${encodeURIComponent(username)}/${type}?limit=30&offset=${offset}`);
    let items = data.items || [];
    if (append && current && current.username === username && current.type === type) items = [...(current.items || []), ...items];
    state.followListContext = { username:data.username || username, type, items, total:Number(data.total || items.length), has_more:Boolean(data.has_more), next_offset:data.next_offset };
    const c = state.followListContext;
    const title = type === 'followers' ? 'Seguidores' : 'Siguiendo';
    modal(`<div class="modal-head"><div><h3>${title}</h3><small>@${escapeHtml(c.username)} · ${c.total}</small></div><button class="icon-btn" onclick="closeFollowList()">×</button></div>
      <div class="follow-list-tabs"><button class="${type==='followers'?'active':''}" onclick="openFollowList('${escapeAttr(c.username)}','followers')">Seguidores</button><button class="${type==='following'?'active':''}" onclick="openFollowList('${escapeAttr(c.username)}','following')">Siguiendo</button></div>
      <div class="follow-list">${items.length ? items.map(u=>followListRow(u,c.username,type)).join('') : `<div class="empty compact-empty">${type==='following'?'Todavía no sigue a nadie.':'Todavía no tiene seguidores.'}</div>`}</div>
      ${c.has_more ? `<button class="btn ghost follow-list-more" onclick="openFollowList('${escapeAttr(c.username)}','${type}',true)">Cargar más</button>` : ''}`);
  } catch(e) { toast(e.message,'error'); }
};

window.closeFollowList = () => { state.followListContext = null; closeModal(); };

window.openPrivacySettings = async () => {
  try {
    const [settings,requests,blocked,muted] = await Promise.all([api('/api/privacy'),api('/api/follow-requests'),api('/api/blocked'),api('/api/muted')]);
    modal(`<div class="modal-head"><h3>Privacidad y control</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
      <div class="privacy-settings">
        <section class="privacy-section"><div><b>Cuenta privada</b><small>Solo los seguidores que apruebes podrán ver tus publicaciones y Stories.</small></div><label class="switch"><input id="privacyPrivate" type="checkbox" ${settings.account_private?'checked':''}><span></span></label></section>
        <label class="privacy-field"><span><b>Quién puede enviarte mensajes</b><small>Controla quién puede iniciar o continuar una conversación contigo.</small></span><select id="privacyMessages"><option value="everyone" ${settings.message_policy==='everyone'?'selected':''}>Todo el mundo</option><option value="followers" ${settings.message_policy==='followers'?'selected':''}>Personas que me siguen</option><option value="friends" ${settings.message_policy==='friends'?'selected':''}>Solo amigos</option><option value="nobody" ${settings.message_policy==='nobody'?'selected':''}>Nadie</option></select></label>
        <label class="privacy-field"><span><b>Marca de agua en mi contenido</b><small>La entrega protegida siempre está activa. Elige cuándo añadir además la identificación del espectador sobre fotos y vídeos.</small></span><select id="privacyWatermark"><option value="exclusive" ${settings.content_watermark_mode==='exclusive'?'selected':''}>Solo en perfil exclusivo</option><option value="all" ${settings.content_watermark_mode==='all'?'selected':''}>En todo mi contenido</option><option value="off" ${settings.content_watermark_mode==='off'?'selected':''}>Sin marca visible</option></select></label>
        <div class="security-callout"><b>Protección de contenido activa</b><p>Las publicaciones, Stories, Reels y archivos enviados por mensaje se sirven mediante enlaces temporales vinculados a la sesión. Las fotos no se pueden arrastrar y los reproductores ocultan la descarga directa.</p></div>
        <button class="btn primary" onclick="savePrivacySettings()">Guardar privacidad</button>
        <section class="privacy-list"><div class="section-row"><h3>Solicitudes para seguirte</h3><span>${requests.length}</span></div>${requests.length?requests.map(followRequestRow).join(''):'<p class="muted">No tienes solicitudes pendientes.</p>'}</section>
        <section class="privacy-list"><div class="section-row"><h3>Perfiles bloqueados</h3><span>${blocked.length}</span></div>${blocked.length?blocked.map(u=>privacyPersonRow(u,'block')).join(''):'<p class="muted">No has bloqueado a nadie.</p>'}</section>
        <section class="privacy-list"><div class="section-row"><h3>Perfiles silenciados</h3><span>${muted.length}</span></div>${muted.length?muted.map(u=>privacyPersonRow(u,'mute')).join(''):'<p class="muted">No has silenciado a nadie.</p>'}</section>
      </div>`);
  } catch(e){ toast(e.message,'error'); }
};

function followRequestRow(r){
  return `<div class="privacy-person">${avatar(r,'small')}<span><b>${escapeHtml(r.name)}</b><small>@${escapeHtml(r.username)}</small></span><div><button class="btn primary compact" onclick="acceptFollowRequest(${r.id})">Aceptar</button><button class="btn ghost compact" onclick="declineFollowRequest(${r.id})">Eliminar</button></div></div>`;
}
function privacyPersonRow(u,type){
  const action = type==='block' ? `toggleBlock(${u.id},'${escapeAttr(u.username)}',true)` : `toggleMute(${u.id},'${escapeAttr(u.username)}',true)`;
  return `<div class="privacy-person">${avatar(u,'small')}<button class="privacy-person-name" onclick="closeModal();openProfile('${escapeAttr(u.username)}')"><b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.username)}</small></button><button class="btn ghost compact" onclick="${action}">${type==='block'?'Desbloquear':'Mostrar'}</button></div>`;
}
window.savePrivacySettings = async () => {
  try { await api('/api/privacy',{method:'PATCH',body:JSON.stringify({account_private:$('#privacyPrivate').checked,message_policy:$('#privacyMessages').value,content_watermark_mode:$('#privacyWatermark')?.value || 'exclusive'})}); await refreshMe(false); toast('Privacidad actualizada'); await openPrivacySettings(); }
  catch(e){toast(e.message,'error');}
};
window.acceptFollowRequest = async id => { try{await api(`/api/follow-requests/${id}/accept`,{method:'POST'});await refreshMe(false);toast('Solicitud aceptada');await openPrivacySettings();}catch(e){toast(e.message,'error');} };
window.declineFollowRequest = async id => { try{await api(`/api/follow-requests/${id}/decline`,{method:'POST'});await refreshMe(false);toast('Solicitud eliminada');await openPrivacySettings();}catch(e){toast(e.message,'error');} };
window.toggleMute = async (userId,username='',fromSettings=false) => { try{const d=await api(`/api/users/${userId}/mute`,{method:'POST'});toast(d.muted?'Perfil silenciado':'Perfil visible de nuevo');if(fromSettings)return openPrivacySettings();if(state.view==='profile'&&username)return renderProfile(username);await renderView();}catch(e){toast(e.message,'error');} };
window.toggleBlock = async (userId,username='',fromSettings=false) => {
  if(!fromSettings && !confirm('¿Cambiar el bloqueo de esta persona? Al bloquearla se eliminarán seguimientos, solicitudes y amistad entre ambos.')) return;
  try{const d=await api(`/api/users/${userId}/block`,{method:'POST'});await refreshMe(false);toast(d.blocked?'Usuario bloqueado':'Usuario desbloqueado');if(fromSettings)return openPrivacySettings();if(state.view==='profile'&&username)return renderProfile(username);await go('discover');}catch(e){toast(e.message,'error');}
};
window.reportModal = ({postId=null,userId=null,username=''}) => {
  modal(`<div class="modal-head"><h3>Denunciar${username?' @'+escapeHtml(username):''}</h3><button class="icon-btn" onclick="closeModal()">×</button></div><div class="report-form"><p>La denuncia quedará registrada para revisión.</p><label>Motivo<select id="reportReason"><option value="spam">Spam</option><option value="harassment">Acoso</option><option value="impersonation">Suplantación</option><option value="nudity">Desnudos o contenido sexual</option><option value="violence">Violencia</option><option value="hate">Odio</option><option value="scam">Estafa</option><option value="other">Otro</option></select></label><label>Detalles opcionales<textarea id="reportDetails" rows="4" maxlength="1000" placeholder="Cuéntanos qué ocurre…"></textarea></label><button class="btn primary" onclick="submitReport(${postId||'null'},${userId||'null'})">Enviar denuncia</button></div>`);
};
window.submitReport = async (postId,userId) => { try{await api('/api/reports',{method:'POST',body:JSON.stringify({post_id:postId,target_user_id:userId,reason:$('#reportReason').value,details:$('#reportDetails').value})});closeModal();toast('Denuncia enviada para revisión');}catch(e){toast(e.message,'error');} };

window.sendFriendRequest = async (userId, username = '') => {
  try {
    const d = await api(`/api/friends/request/${userId}`, { method:'POST' });
    toast(d.status === 'sent' ? 'Solicitud enviada' : d.status === 'none' ? 'Solicitud cancelada' : d.status === 'friends' ? 'Ya sois amigos' : 'Tienes una solicitud pendiente de esa persona');
    await refreshMe(false);
    if (state.view === 'profile' && username) await renderProfile(username); else await renderView();
  } catch (e) { if(e.code==='FRIEND_GATE_LOCKED') return openFriendGateChallenge(); toast(e.message,'error'); }
};

window.acceptFriendRequest = async (requestId, username = '') => {
  try {
    await api(`/api/friends/requests/${requestId}/accept`, { method:'POST' });
    toast('Ahora sois amigos');
    await refreshMe(false);
    if (state.view === 'profile' && username) await renderProfile(username); else await renderFriends();
  } catch (e) { toast(e.message,'error'); }
};

window.declineFriendRequest = async (requestId) => {
  try { await api(`/api/friends/requests/${requestId}/decline`, { method:'POST' }); toast('Solicitud eliminada'); await refreshMe(false); await renderFriends(); }
  catch (e) { toast(e.message,'error'); }
};

window.removeFriend = async (userId, username = '') => {
  if (!confirm('¿Eliminar esta amistad?')) return;
  try { await api(`/api/friends/${userId}`, { method:'DELETE' }); toast('Amistad eliminada'); await refreshMe(false); if(state.view==='profile'&&username) await renderProfile(username); else await renderFriends(); }
  catch (e) { toast(e.message,'error'); }
};

async function renderFriends() {
  const username = state.me?.username || '';
  const [friends, requests, followingData, followersData] = await Promise.all([
    api('/api/friends'),
    api('/api/friends/requests'),
    api(`/api/users/${encodeURIComponent(username)}/following?limit=100&offset=0`),
    api(`/api/users/${encodeURIComponent(username)}/followers?limit=100&offset=0`)
  ]);
  const incoming = requests.incoming || [], outgoing = requests.outgoing || [];
  const following = followingData.items || [], followers = followersData.items || [];
  $('#main').innerHTML = `${pageHeader('Personas','Seguidores, personas que sigues, amistades y solicitudes')}
    <section class="card connections-explainer"><div><b>Seguir y ser amigos son cosas distintas</b><small>Al seguir a alguien verás mejor su contenido. La amistad se crea aparte mediante una solicitud.</small></div></section>
    <section class="card invite-friends-strip"><div><b>Haz crecer tu círculo</b><small>Invita a tus amigos a Instant Admirers con tu enlace personal.</small></div><button class="btn primary compact whatsapp-btn" onclick="openInviteFriends()">Invitar por WhatsApp</button></section>
    <section class="card friends-section connections-section"><div class="section-row"><h3>Siguiendo</h3><span>${Number(followingData.total || following.length)}</span></div>${following.length ? following.map(connectionFollowingRow).join('') : `<div class="empty compact-empty"><p>Aún no sigues a nadie.</p><button class="btn primary compact" onclick="go('discover')">Descubrir personas</button></div>`}${followingData.has_more ? `<button class="btn ghost compact connections-more" onclick="openFollowList('${escapeAttr(username)}','following')">Ver todos</button>` : ''}</section>
    <section class="card friends-section connections-section"><div class="section-row"><h3>Te siguen</h3><span>${Number(followersData.total || followers.length)}</span></div>${followers.length ? followers.map(connectionFollowerRow).join('') : `<div class="empty compact-empty"><p>Todavía no tienes seguidores.</p></div>`}${followersData.has_more ? `<button class="btn ghost compact connections-more" onclick="openFollowList('${escapeAttr(username)}','followers')">Ver todos</button>` : ''}</section>
    ${incoming.length ? `<section class="card friends-section"><div class="section-row"><h3>Solicitudes de amistad</h3><span>${incoming.length}</span></div>${incoming.map(friendRequestRow).join('')}</section>` : ''}
    ${outgoing.length ? `<section class="card friends-section"><div class="section-row"><h3>Solicitudes enviadas</h3><span>${outgoing.length}</span></div>${outgoing.map(outgoingFriendRow).join('')}</section>` : ''}
    <section class="card friends-section"><div class="section-row"><h3>Tus amigos</h3><span>${friends.length}</span></div>${friends.length ? friends.map(friendRow).join('') : `<div class="empty compact-empty"><p>Aún no has añadido amigos.</p><small>Seguir a una persona no la convierte automáticamente en amiga.</small></div>`}</section>`;
}

function connectionFollowingRow(u) {
  return `<div class="friend-row connection-row"><button class="person-link" onclick="openProfile('${escapeAttr(u.username)}')">${avatar(u,'small')}<span><b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.username)}</small>${u.headline?`<em>${escapeHtml(u.headline).slice(0,70)}</em>`:''}</span></button><div class="friend-actions"><button class="btn ghost compact follow-btn" onclick="toggleFollow(${u.id},'${escapeAttr(u.username)}')">Siguiendo</button></div></div>`;
}

function connectionFollowerRow(u) {
  const action = Number(u.id) === Number(state.me?.id) ? '' : followButtonHtml(u,'btn primary compact');
  return `<div class="friend-row connection-row"><button class="person-link" onclick="openProfile('${escapeAttr(u.username)}')">${avatar(u,'small')}<span><b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.username)}</small>${u.headline?`<em>${escapeHtml(u.headline).slice(0,70)}</em>`:''}</span></button><div class="friend-actions">${action}</div></div>`;
}

function friendRequestRow(r) {
  return `<div class="friend-row"><button class="person-link" onclick="openProfile('${escapeAttr(r.username)}')">${avatar(r,'small')}<span><b>${escapeHtml(r.name)}</b><small>@${escapeHtml(r.username)}</small>${presenceHtml({id:r.user_id,online:r.online,last_seen_at:r.last_seen_at})}</span></button><div class="friend-actions"><button class="btn primary compact" onclick="acceptFriendRequest(${r.id},'${escapeAttr(r.username)}')">Aceptar</button><button class="btn ghost compact" onclick="declineFriendRequest(${r.id})">Ahora no</button></div></div>`;
}

function outgoingFriendRow(r) {
  return `<div class="friend-row"><button class="person-link" onclick="openProfile('${escapeAttr(r.username)}')">${avatar(r,'small')}<span><b>${escapeHtml(r.name)}</b><small>@${escapeHtml(r.username)}</small></span></button><button class="btn ghost compact" onclick="declineFriendRequest(${r.id})">Cancelar</button></div>`;
}

function friendRow(u) {
  return `<div class="friend-row"><button class="person-link" onclick="openProfile('${escapeAttr(u.username)}')">${avatar(u,'small')}<span><b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.username)}</small>${presenceHtml(u)}</span></button><div class="friend-actions"><button class="btn ghost compact" onclick="startMessage(${u.id})">Mensaje</button><button class="icon-btn danger-hover" onclick="removeFriend(${u.id})" title="Eliminar amistad">•••</button></div></div>`;
}

window.openOwnProfileMenu = () => {
  modal(`<div class="modal-head"><h3>Tu perfil</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="post-menu own-profile-menu">
      <button onclick="closeModal();sharePublicProfile('${escapeAttr(state.me?.username || '')}')"><span>↗</span><div><b>Compartir mi perfil</b><small>instantadmirers.com/${escapeHtml(state.me?.username || '')}</small></div></button>
      <button onclick="closeModal();go('friends')"><span>👥</span><div><b>Personas</b><small>Consulta a quién sigues, seguidores, amistades y solicitudes</small></div></button>
      <button onclick="closeModal();openInviteFriends()"><span>💬</span><div><b>Invitar amigos</b><small>Comparte tu enlace por WhatsApp y sigue tus referidos</small></div></button>
      <button onclick="closeModal();openFriendGateSettings()"><span>🔐</span><div><b>Acceso a mi perfil</b><small>Pide invitaciones antes de que puedan ver tu perfil</small></div></button>
      <button onclick="closeModal();openPrivacySettings()"><span>🔒</span><div><b>Privacidad</b><small>Cuenta privada, mensajes, bloqueos y silencios</small></div></button>
      <button onclick="closeModal();openAccountSettings()"><span>⚙</span><div><b>Ajustes</b><small>Contraseña, legal y cuenta</small></div></button>
      ${state.me?.is_admin ? `<button onclick="closeModal();go('admin')"><span>🛡</span><div><b>Administración</b><small>Moderación y denuncias</small></div></button>` : ''}
      <button class="danger-option" onclick="closeModal();logout()"><span>↪</span><div><b>Cerrar sesión</b><small>Salir de Instant Admirers en este dispositivo</small></div></button>
    </div>`);
};

window.openInviteFriends = async () => {
  try {
    const d=await api('/api/invites/me');
    const recent=d.recent||[];
    const normalLink=d.normal_link || d.link;
    const profileBlock=d.profile_link
      ? `<section class="invite-mode-card profile-mode">
          <div class="invite-mode-icon">🔐</div>
          <div><h4>Invitación a tu perfil</h4><p>La persona entra directamente a <b>@${escapeHtml(d.username)}</b>. Para verlo tendrá que conseguir ${Number(d.friend_gate?.required||5)} altas nuevas${d.friend_gate?.require_post?' que publiquen al menos 1 post':''}. Mientras tanto podrá usar su propia cuenta normalmente.</p></div>
          <div class="invite-link"><input readonly value="${escapeAttr(d.profile_link)}"><button class="btn ghost compact" onclick="copyInviteLink('${escapeAttr(d.profile_link)}')">Copiar</button></div>
          <button class="btn primary whatsapp-btn" onclick="shareProfileInviteWhatsApp('${escapeAttr(d.profile_link)}','${escapeAttr(d.username)}',${Number(d.friend_gate?.required||5)})">Invitar a mi perfil por WhatsApp</button>
        </section>`
      : `<section class="invite-mode-card profile-mode disabled-mode"><div class="invite-mode-icon">🔐</div><div><h4>Invitación a tu perfil</h4><p>Activa primero <b>Acceso a mi perfil</b> para generar un enlace que lleve directamente a tu página y muestre el reto de invitaciones.</p></div><button class="btn ghost" onclick="closeModal();openFriendGateSettings()">Configurar acceso</button></section>`;
    modal(`<div class="modal-head"><h3>Invitar amigos</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
      <div class="invite-center">
        <div class="invite-hero"><span>💬</span><div><b>Dos formas de invitar</b><p>Elige entre traer a alguien a Instant Admirers o enviarlo directamente a tu perfil.</p></div></div>
        <section class="invite-mode-card normal-mode">
          <div class="invite-mode-icon">✨</div>
          <div><h4>Invitación normal</h4><p>Abre la página principal. Tu amigo crea su cuenta y empieza a usar Instant Admirers.</p></div>
          <div class="invite-link"><input id="personalInviteLink" readonly value="${escapeAttr(normalLink)}"><button class="btn ghost compact" onclick="copyInviteLink('${escapeAttr(normalLink)}')">Copiar</button></div>
          <button class="btn primary whatsapp-btn" onclick="shareNormalInviteWhatsApp('${escapeAttr(normalLink)}')">Compartir por WhatsApp</button>
        </section>
        ${profileBlock}
        <div class="referral-stats"><div><b>${Number(d.registered||0)}</b><span>registrados</span></div><div><b>${Number(d.qualified||0)}</b><span>ya publicaron</span></div></div>
        ${d.friend_gate?.enabled ? `<section class="growth-mini-funnel"><small>TU EMBUDO DE ACCESO</small><div><span><b>${Number(d.growth?.challenge_starts||0)}</b> retos iniciados</span><span><b>${Number(d.growth?.share_actions||0)}</b> comparticiones</span><span><b>${Number(d.growth?.referred_signups||0)}</b> altas para el reto</span><span><b>${Number(d.growth?.completed||0)}</b> desbloqueos</span></div></section>` : ''}
        ${recent.length?`<section class="invite-list"><h4>Tus últimas invitaciones</h4>${recent.map(r=>`<div class="invite-person">${avatar(r,'small')}<span><b>${escapeHtml(r.name)}</b><small>@${escapeHtml(r.username)}${r.gate_username?' · ayudó a desbloquear @'+escapeHtml(r.gate_username):''}</small></span><i class="${r.qualified_at?'done':''}">${r.qualified_at?'✓ Publicó':'Registrado'}</i></div>`).join('')}</section>`:''}
      </div>`);
  } catch(e){toast(e.message,'error');}
};

window.copyInviteLink = async link => { try{await navigator.clipboard.writeText(link);toast('Enlace copiado');}catch(_){prompt('Copia este enlace:',link);} };
window.sharePublicProfile = async (username) => {
  const url = profileUrl(username);
  const title = `@${username} en Instant Admirers`;
  const text = `Mira el perfil de @${username} en Instant Admirers`;
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return; }
  } catch (err) { if (err?.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('Enlace del perfil copiado'); }
  catch (_) { prompt('Copia este enlace:', url); }
};
window.shareNormalInviteWhatsApp = link => {
  const text=`¡Únete a Instant Admirers! Crea tu perfil y nos vemos dentro: ${link}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener');
};

window.shareProfileInviteWhatsApp = (link,username,required=5) => {
  const text=`Te invito a mi perfil de Instant Admirers (@${username}). Crea tu cuenta y entra directamente. Para desbloquear mi perfil tendrás que invitar a ${required} personas. Puedes usar tu cuenta normalmente mientras lo consigues: ${link}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener');
};

function trackGateShare(target='',method='share',campaign='') {
  if(!state.token || !target) return;
  try {
    fetch(`/api/growth/gate/${encodeURIComponent(target)}/share`,{method:'POST',headers:{'Authorization':'Bearer '+state.token,'Content-Type':'application/json'},body:JSON.stringify({method,campaign:campaign || currentGrowthCampaign()}),keepalive:true}).catch(()=>{});
  } catch (_) {}
}

window.shareChallengeInviteWhatsApp = (link,target='',requirePost=true,campaign='') => {
  trackGateShare(target,'whatsapp',campaign);
  const text=`¿Me ayudas a desbloquear el perfil de @${target} en Instant Admirers? Crea tu perfil con este enlace${requirePost?' y publica al menos 1 post':''}. A mí me contará para conseguir el acceso: ${link}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener');
};

window.shareChallengeInviteNative = async (link,target='',requirePost=true,campaign='') => {
  const text=`¿Me ayudas a desbloquear el perfil de @${target} en Instant Admirers?${requirePost?' Crea tu cuenta y publica al menos 1 post.':''}`;
  try {
    if(navigator.share){
      await navigator.share({title:`Desbloquear @${target} · Instant Admirers`,text,url:link});
      trackGateShare(target,'native',campaign);
      return;
    }
  } catch(err){ if(err?.name==='AbortError') return; }
  await copyChallengeInvite(link,target,campaign);
};

window.copyChallengeInvite = async (link,target='',campaign='') => {
  try { await navigator.clipboard.writeText(link); trackGateShare(target,'copy',campaign); toast('Enlace copiado'); }
  catch (_) { prompt('Copia este enlace:',link); trackGateShare(target,'copy',campaign); }
};

window.openFriendGateChallenge = async () => {
  const u=state.profileData;
  const g=u?.friend_gate;
  if(!u || !g?.enabled) return toast('Este reto ya no está disponible','error');
  try {
    const me=await api('/api/invites/me');
    const campaign=String(me?.attributed_campaign?.slug || currentGrowthCampaign() || '');
    const params=new URLSearchParams({ref:String(me.code||''),gate:String(g.gate_code||'')});
    if(campaign) params.set('campaign',campaign);
    const link=`${location.origin}/?${params.toString()}`;
    const progress=Number(g.progress||0),required=Math.max(1,Number(g.required||1));
    const remaining=Math.max(0,required-progress);
    const pct=Math.min(100,Math.round((progress/required)*100));
    const headline=progress>0 ? `🔥 ¡Ya tienes ${progress}!` : `Desbloquea @${escapeHtml(u.username)}`;
    modal(`<div class="modal-head"><h3>Perfil exclusivo</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
      <div class="friend-challenge growth-challenge">
        <div class="challenge-lock">🔐</div>
        <h3>${g.unlocked?'Acceso conseguido':headline}</h3>
        <p>${g.unlocked?`Ya puedes entrar en el perfil completo.`:`Te ${remaining===1?'queda':'quedan'} <b>${remaining}</b> ${remaining===1?'persona':'personas'}. ${g.require_post?'Cada nueva cuenta debe publicar al menos 1 post para contar.':'Cada nueva cuenta registrada desde tu enlace cuenta.'}`}</p>
        <div class="challenge-number"><b>${progress}</b><span>/ ${required}</span></div>
        <div class="gate-progress large"><span style="width:${pct}%"></span></div>
        ${g.unlocked?`<button class="btn primary" onclick="closeModal();renderProfile('${escapeAttr(u.username)}')">Ver perfil</button>`:`<div class="growth-share-grid"><button class="btn primary whatsapp-btn" onclick="shareChallengeInviteWhatsApp('${escapeAttr(link)}','${escapeAttr(u.username)}',${g.require_post?'true':'false'},'${escapeAttr(campaign)}')">WhatsApp</button><button class="btn ghost" onclick="shareChallengeInviteNative('${escapeAttr(link)}','${escapeAttr(u.username)}',${g.require_post?'true':'false'},'${escapeAttr(campaign)}')">Compartir</button><button class="btn ghost growth-copy" onclick="copyChallengeInvite('${escapeAttr(link)}','${escapeAttr(u.username)}','${escapeAttr(campaign)}')">Copiar enlace</button></div>`}
        <small class="challenge-note">Las personas invitadas crean su propia cuenta y pueden usar Instant Admirers con normalidad. Solo las nuevas altas hechas desde tu enlace cuentan para tu progreso.${g.require_post?' La publicación puede hacerse después del registro.':''}</small>
        <button class="btn ghost" onclick="closeModal();go('feed')">Seguir usando Instant Admirers</button>
      </div>`);
  } catch(e){toast(e.message,'error');}
};

window.openFriendGateSettings = async () => {
  try{
    const g=await api('/api/friend-gate');
    modal(`<div class="modal-head"><h3>Acceso a mi perfil</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
      <div class="gate-settings">
        <div class="security-callout"><b>Convierte tu perfil en un acceso por invitaciones</b><p>Quien llegue a tu perfil verá el progreso del reto y podrá usar su cuenta con normalidad mientras lo completa.</p></div>
        <label class="privacy-section"><span><b>Activar acceso especial</b><small>Si está activado, las personas deberán completar el reto antes de ver tu perfil.</small></span><span class="switch"><input id="gateEnabled" type="checkbox" ${g.friend_gate_enabled?'checked':''}><span></span></span></label>
        <label class="gate-message-field"><span><b>Mensaje de acceso al perfil</b><small>Explica brevemente por qué has protegido tu perfil o qué encontrará quien consiga entrar.</small></span><textarea id="gateAccessMessage" maxlength="220" rows="4" placeholder="Aquí comparto cosas más personales. Si quieres verlas, desbloquea mi perfil 💜">${escapeHtml(g.friend_gate_message || '')}</textarea><small class="gate-message-count"><span id="gateMessageCount">${String(g.friend_gate_message || '').length}</span>/220</small></label>
        <label>Número de personas que deben invitar<input id="gateRequired" type="number" min="1" max="50" value="${Number(g.friend_gate_required_referrals||5)}"></label>
        <label class="legal-check"><input id="gateRequirePost" type="checkbox" ${g.friend_gate_require_post!==false?'checked':''}><span>Las nuevas cuentas deben publicar al menos 1 post para contar.</span></label>
        <label class="legal-check"><input id="gateAutoAccept" type="checkbox" ${g.friend_gate_auto_accept!==false?'checked':''}><span>Al completar el reto, crear automáticamente la amistad con esa persona.</span></label>
        <button class="btn primary" onclick="saveFriendGateSettings()">Guardar condición</button>
      </div>`);
    const gateMessage=$('#gateAccessMessage');
    gateMessage?.addEventListener('input',()=>{ const count=$('#gateMessageCount'); if(count) count.textContent=String(gateMessage.value||'').length; });
  }catch(e){toast(e.message,'error');}
};

window.saveFriendGateSettings = async () => {
  try{
    const required=Math.max(1,Math.min(50,Number($('#gateRequired')?.value||5)));
    const accessMessage=String($('#gateAccessMessage')?.value || '').trim().slice(0,220);
    await api('/api/friend-gate',{method:'PATCH',body:JSON.stringify({enabled:Boolean($('#gateEnabled')?.checked),required_referrals:required,require_post:Boolean($('#gateRequirePost')?.checked),auto_accept:Boolean($('#gateAutoAccept')?.checked),access_message:accessMessage})});
    await refreshMe(false);closeModal();toast('Condición de amistad actualizada');
  }catch(e){toast(e.message,'error');}
};

window.editProfile = () => {
  const u = state.me;
  modal(`<div class="modal-head"><h3>Editar perfil</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="edit-profile">
      <div class="edit-cover-preview ${u.cover?'has-cover':''}" id="editCoverPreview">${u.cover?`<img src="${escapeAttr(u.cover)}" alt="Portada actual" id="editCoverPreviewImg">`:''}<div class="profile-photo-actions cover-actions"><label class="btn ghost compact" onclick="prepareGalleryInput('coverFile',false)">Galería<input type="file" id="coverFile" accept="image/*" hidden></label><button class="btn ghost compact mobile-capture-only" type="button" onclick="captureFromDevice('coverFile','photo','environment')">📷 Cámara</button>${u.cover?`<button class="btn danger compact" type="button" onclick="removeProfileCover()">Eliminar portada</button>`:''}</div><div class="image-preview-status" id="coverPreviewStatus" aria-live="polite"></div></div>
      <div class="edit-avatar-row"><div id="editAvatarPreview" class="edit-avatar-preview">${avatar(u, 'large')}</div><div class="profile-photo-actions"><label class="btn ghost compact" onclick="prepareGalleryInput('avatarFile',false)">Galería<input type="file" id="avatarFile" accept="image/*" hidden></label><button class="btn ghost compact mobile-capture-only" type="button" onclick="captureFromDevice('avatarFile','photo','user')">🤳 Cámara</button>${u.avatar?`<button class="btn danger compact" type="button" onclick="removeProfileAvatar()">Eliminar foto</button>`:''}<small class="image-preview-status avatar-status" id="avatarPreviewStatus" aria-live="polite"></small></div></div>
      <label>Nombre<input id="editName" value="${escapeAttr(u.name)}" maxlength="100"></label>
      <label>Frase de perfil<input id="editHeadline" value="${escapeAttr(u.headline || '')}" maxlength="140" placeholder="Diseñador, creador, viajero…"></label>
      <label>Biografía<textarea id="editBio" maxlength="500" rows="4">${escapeHtml(u.bio || '')}</textarea></label>
      <label>Intereses<input id="editInterests" value="${escapeAttr(u.interests || '')}" maxlength="500" placeholder="música, viajes, tecnología"></label>
      <label>Ubicación<input id="editLocation" value="${escapeAttr(u.location || '')}" maxlength="120" placeholder="Valencia, España"></label>
      <label>Web<input id="editWebsite" value="${escapeAttr(u.website || '')}" maxlength="500" placeholder="tusitio.com"></label>
      <button class="btn primary" onclick="saveProfile()">Guardar cambios</button>
    </div>`);

  const avatarInput = $('#avatarFile');
  const coverInput = $('#coverFile');
  avatarInput?.addEventListener('change', () => previewProfileFile('avatar'));
  coverInput?.addEventListener('change', () => previewProfileFile('cover'));
};

function previewProfileFile(kind) {
  const input = kind === 'avatar' ? $('#avatarFile') : $('#coverFile');
  const file = input?.files?.[0];
  if (!file) return;
  if (!file.type?.startsWith('image/')) {
    toast('Selecciona una imagen válida', 'error');
    input.value = '';
    return;
  }
  if (!validateMediaFile(file, input)) return;
  const url = URL.createObjectURL(file);
  if (kind === 'avatar') {
    const wrap = $('#editAvatarPreview');
    if (wrap) wrap.innerHTML = `<div class="avatar large preview-selected"><img src="${escapeAttr(url)}" alt="Vista previa de tu nueva foto"></div>`;
    const status = $('#avatarPreviewStatus');
    if (status) status.textContent = '✓ Foto seleccionada';
  } else {
    const wrap = $('#editCoverPreview');
    if (wrap) {
      let img = $('#editCoverPreviewImg');
      if (!img) {
        img = document.createElement('img');
        img.id = 'editCoverPreviewImg';
        img.alt = 'Vista previa de tu nueva portada';
        wrap.prepend(img);
      }
      img.src = url;
      wrap.classList.add('has-cover','preview-selected');
    }
    const status = $('#coverPreviewStatus');
    if (status) status.textContent = '✓ Portada seleccionada';
  }
}


window.removeProfileAvatar = async () => {
  if (!state.me.avatar) return;
  if (!confirm('¿Eliminar tu foto de perfil? Volverás a ver tus iniciales como avatar.')) return;
  try {
    await api('/api/me/avatar', { method:'DELETE' });
    await refreshMe();
    editProfile();
    toast('Foto de perfil eliminada');
  } catch (e) { toast(e.message, 'error'); }
};

window.removeProfileCover = async () => {
  if (!state.me.cover) return;
  if (!confirm('¿Eliminar tu portada? Volverás al fondo predeterminado.')) return;
  try {
    await api('/api/me/cover', { method:'DELETE' });
    await refreshMe();
    editProfile();
    toast('Portada eliminada');
  } catch (e) { toast(e.message, 'error'); }
};

window.saveProfile = async () => {
  try {
    let avatarUrl = state.me.avatar || '';
    let coverUrl = state.me.cover || '';
    const file = $('#avatarFile')?.files?.[0];
    const coverFile = $('#coverFile')?.files?.[0];
    if (file) { const up = await uploadMediaFile(file); avatarUrl = up.url; }
    if (coverFile) { const up = await uploadMediaFile(coverFile); coverUrl = up.url; }
    await api('/api/me', { method:'PATCH', body:JSON.stringify({
      name:$('#editName').value, headline:$('#editHeadline').value, bio:$('#editBio').value,
      interests:$('#editInterests').value, location:$('#editLocation').value, website:$('#editWebsite').value,
      avatar:avatarUrl, cover:coverUrl
    }) });
    closeModal(); await refreshMe(); state.profile = state.me.username; await renderProfile(state.me.username); toast('Perfil actualizado');
  } catch (e) { toast(e.message, 'error'); }
};

async function renderNotifications() {
  const rows = await api('/api/notifications');
  const browserButton = ('Notification' in window && Notification.permission !== 'granted') ? `<button class="btn ghost compact browser-alert-btn" onclick="requestBrowserNotifications()">Activar avisos del navegador</button>` : '';
  $('#main').innerHTML = `${pageHeader('Actividad','Lo que está pasando alrededor de tu perfil')}<div class="activity-tools">${browserButton}<button class="btn ghost compact" onclick="go('friends')">Amigos y solicitudes</button><button class="btn ghost compact" onclick="openPrivacySettings()">Privacidad${Number(state.me?.follow_requests_count||0)?` · ${state.me.follow_requests_count}`:''}</button></div><div class="card notification-list">${rows.length ? rows.map(notificationHtml).join('') : `<div class="empty"><div class="empty-icon">♡</div><h3>Aún no hay actividad</h3><p>Cuando alguien interactúe contigo, aparecerá aquí.</p></div>`}</div>`;
  await api('/api/notifications/read', { method:'POST' });
  state.me.unread_notifications = 0;
  setTimeout(() => { if (state.view === 'notifications') layoutNavOnly(); }, 100);
}

function notificationHtml(n) {
  let action = 'ha interactuado contigo';
  let click = `openProfile('${escapeAttr(n.username || '')}')`;
  if (n.type === 'follow') action = 'ha empezado a seguirte';
  else if (n.type === 'follow_request') { action = 'quiere seguir tu cuenta privada'; click = `openPrivacySettings()`; }
  else if (n.type === 'follow_accept') { action = 'ha aceptado tu solicitud de seguimiento'; }
  else if (n.type === 'like') { action = 'ha indicado que le gusta tu publicación'; click = `openComments(${Number(n.post_id)})`; }
  else if (n.type === 'comment') { action = 'ha comentado tu publicación'; click = `openComments(${Number(n.post_id)})`; }
  else if (n.type === 'friend_request') { action = 'quiere añadirte como amigo'; click = `go('friends')`; }
  else if (n.type === 'friend_accept') { action = 'ha aceptado tu solicitud de amistad'; }
  else if (n.type === 'message') { action = 'te ha enviado un mensaje'; click = `go('messages')`; }
  else if (n.type === 'mention') { action = 'te ha mencionado en una publicación o comentario'; click = n.post_id ? `openComments(${Number(n.post_id)})` : click; }
  else if (n.type === 'repost') { action = 'ha republicado tu publicación'; click = n.post_id ? `openComments(${Number(n.post_id)})` : click; }
  return `<button class="notification ${n.read_at ? '' : 'unread'}" onclick="${click}">${avatar(n,'small')}<span><b>${escapeHtml(n.name || n.username || 'Alguien')}</b> ${action}${n.type === 'comment' && n.text ? `<em>“${escapeHtml(n.text).slice(0,100)}”</em>` : ''}<small>${timeAgo(n.created_at)}</small></span></button>`;
}

function layoutNavOnly() {
  const desktop = $('#desktopNav');
  if (desktop) desktop.innerHTML = `${navButton('feed','⌂','Inicio')}${navButton('reels','▶','Reels')}${navButton('discover','✦','Descubrir')}${navButton('search','⌕','Buscar')}${!isSystemAccount()?navButton('messages','✉','Mensajes'):''}${!isSystemAccount()?navButton('notifications','♡','Actividad'):''}${!isSystemAccount()?navButton('bookmarks','▱','Guardados'):''}${state.me?.is_admin ? navButton('admin','⚙','Administración') : ''}${!isSystemAccount()?`<button class="nav-item ${state.view === 'profile' ? 'active' : ''}" onclick="openProfile('${escapeAttr(state.me.username)}')"><span class="nav-icon">◎</span><span>Perfil</span></button>`:''}`;
}

async function loadRightbar() {
  const box = $('#rightbar'); if (!box) return;
  try {
    let suggestions, tags;
    const cached = state.rightbarCache;
    if (cached && Date.now() - cached.at < 45000) {
      suggestions = cached.suggestions;
      tags = cached.tags;
    } else {
      [suggestions, tags] = await Promise.all([api('/api/suggestions?limit=4'), api('/api/trending')]);
      state.rightbarCache = { at:Date.now(), suggestions, tags };
    }
    if (!box.isConnected) return;
    const accountCard=isSystemAccount()
      ? `<div class="card side-card"><div class="side-title">Cuenta técnica</div><div class="profile-summary">${avatar(state.me)}<span><b>${escapeHtml(state.me.name)}</b><small>Administración · fuera de la red social</small></span></div><div class="system-account-actions"><button class="btn primary compact" onclick="go('admin')">Administración</button><button class="btn ghost compact" onclick="openAccountSettings()">Ajustes</button></div></div>`
      : `<div class="card side-card"><div class="side-title">Tu perfil</div><button class="profile-summary" onclick="openProfile('${escapeAttr(state.me.username)}')">${avatar(state.me)}<span><b>${escapeHtml(state.me.name)}</b><small>@${escapeHtml(state.me.username)}</small></span></button><div class="mini-stats"><button type="button" class="mini-stat-btn" onclick="openProfile('${escapeAttr(state.me.username)}')" title="Ver tus publicaciones"><b>${state.me.posts_count || 0}</b><span>posts</span></button><button type="button" class="mini-stat-btn social" onclick="openFollowList('${escapeAttr(state.me.username)}','followers')" title="Ver seguidores" aria-label="Ver seguidores"><b>${state.me.followers_count || 0}</b><span>seguidores ↗</span></button><button type="button" class="mini-stat-btn social" onclick="openFollowList('${escapeAttr(state.me.username)}','following')" title="Ver a quién sigues" aria-label="Ver a quién sigues"><b>${state.me.following_count || 0}</b><span>siguiendo ↗</span></button></div></div>`;
    box.innerHTML = `${accountCard}
      <div class="card side-card"><div class="side-title">Personas para ti</div>${suggestions.length ? suggestions.map(u => `<div class="side-user suggested-side-user"><button onclick="openProfile('${escapeAttr(u.username)}')">${avatar(u,'small')}<span><b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.username)}</small><em>✦ ${escapeHtml(u.recommendation_reason || 'Sugerido')}</em></span></button>${isSystemAccount()?'':(u.follow_requested?`<button class="text-btn" onclick="toggleFollow(${u.id},'${escapeAttr(u.username)}')">Solicitada</button>`:`<button class="text-btn" onclick="toggleFollow(${u.id},'${escapeAttr(u.username)}')">${u.account_private?'Solicitar':'Seguir'}</button>`)}</div>`).join('') : '<p class="muted">No hay sugerencias disponibles.</p>'}</div>
      <div id="rightbarTrends" class="card side-card"><div class="side-title">Tendencias · 7 días</div>${tags.length ? tags.map(t => `<button class="trend" onclick="searchTag('${escapeAttr(t.tag)}')"><b>${escapeHtml(t.tag)}</b><small>${t.count} posts · ${t.authors || 1} personas · ${t.engagement || 0} interacciones</small></button>`).join('') : '<p class="muted">Los hashtags aparecerán aquí cuando se usen.</p>'}</div>
      <button class="logout-link" onclick="logout()">Cerrar sesión</button>`;
    void mountRightbarAd();
  } catch {
    if (box.isConnected) box.innerHTML = '';
  }
}


// --- V0.5: Stories ---------------------------------------------------------
function storyStrip(stories = []) {
  const groups = [];
  const byUser = new Map();
  stories.forEach(story => {
    if (!byUser.has(story.username)) {
      const group = { username: story.username, name: story.name, avatar: story.avatar, items: [] };
      byUser.set(story.username, group); groups.push(group);
    }
    byUser.get(story.username).items.push(story);
  });
  return `<section class="card stories-card"><div class="stories-scroll">
    <button class="story-bubble story-add" onclick="createStoryModal()"><span class="story-ring add-ring">${avatar(state.me,'story')}<i>+</i></span><small>Tu story</small></button>
    ${groups.map(g => {
      const unseen = g.items.some(x => !x.viewed && !x.own);
      return `<button class="story-bubble ${unseen ? '' : 'viewed'}" onclick="openStories('${escapeAttr(g.username)}')"><span class="story-ring">${avatar(g,'story')}</span><small>${escapeHtml(g.username === state.me.username ? 'Tus stories' : g.name.split(' ')[0])}</small></button>`;
    }).join('')}
  </div></section>`;
}

window.createStoryModal = () => {
  modal(`<div class="modal-head"><h3>Nueva Story</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="story-create">
      <label class="story-drop" id="storyDrop" onclick="prepareGalleryInput('storyFile',true)">🖼️<b>Elegir de la galería</b><span>Se eliminará automáticamente en 24 horas. Fotos hasta 10 MB · Vídeos hasta 100 MB.</span><input id="storyFile" type="file" accept="image/*,video/*" onchange="previewStoryFile(this)" hidden></label>
      <div class="mobile-capture-actions story-capture-actions">
        <button type="button" class="capture-btn" onclick="captureFromDevice('storyFile','photo','environment')">📷 Hacer foto</button>
        <button type="button" class="capture-btn" onclick="captureFromDevice('storyFile','video','environment')">🎥 Grabar vídeo</button>
      </div>
      <div id="storyPreview"></div>
      <label>Texto opcional<textarea id="storyText" rows="3" maxlength="500" placeholder="Añade algo a tu story…"></textarea></label>
      <label>Quién puede verla<select id="storyVisibility"><option value="public">🌍 Toda la comunidad</option><option value="followers">👥 Solo seguidores</option></select></label>
      <button class="btn primary" id="storyPublish" onclick="publishStory()">Publicar Story</button>
    </div>`);
};

window.previewStoryFile = (input) => {
  const file = input.files?.[0]; if (!file) return;
  if (!validateMediaFile(file, input)) {
    const preview = $('#storyPreview'); if (preview) preview.innerHTML = '';
    $('#storyDrop')?.classList.remove('has-file');
    return;
  }
  const url = URL.createObjectURL(file);
  $('#storyPreview').innerHTML = file.type.startsWith('video/') ? `<video class="story-preview" src="${url}" controls></video>` : `<img class="story-preview" src="${url}" alt="">`;
  $('#storyDrop').classList.add('has-file');
};

window.publishStory = async () => {
  const file = $('#storyFile')?.files?.[0];
  if (!file) return toast('Elige una foto o vídeo', 'error');
  if (!validateMediaFile(file, $('#storyFile'))) return;
  const btn = $('#storyPublish');
  try {
    btn.disabled = true; btn.textContent = 'Publicando…';
    const up = await uploadMediaFile(file);
    await api('/api/stories', { method:'POST', body:JSON.stringify({ media_id:up.media_id, text:$('#storyText').value, visibility:$('#storyVisibility').value }) });
    closeModal(); toast('Story publicada · dura 24 h'); await renderView();
  } catch (e) { toast(e.message,'error'); btn.disabled = false; btn.textContent = 'Publicar Story'; }
};

window.openStories = async (username) => {
  try {
    const all = await api('/api/stories');
    const items = all.filter(x => x.username === username);
    if (!items.length) return toast('Esta Story ya no está disponible');
    let index = items.findIndex(x => !x.viewed && !x.own); if (index < 0) index = 0;
    state.storyViewer = { items, index };
    await showStory();
  } catch (e) { toast(e.message,'error'); }
};

function stopStoryProgress() {
  clearTimeout(showStory.timer);
  if (showStory.raf) cancelAnimationFrame(showStory.raf);
  showStory.raf = null;
}

function setStoryProgress(percent) {
  const fill = document.querySelector('.story-progress span.active i');
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function runImageStoryProgress(duration = 6000) {
  const started = performance.now();
  const tick = (now) => {
    if (!state.storyViewer) return;
    const pct = ((now - started) / duration) * 100;
    setStoryProgress(pct);
    if (pct >= 100) return nextStory(1);
    showStory.raf = requestAnimationFrame(tick);
  };
  showStory.raf = requestAnimationFrame(tick);
}

function runVideoStoryProgress(video) {
  const tick = () => {
    if (!state.storyViewer || !video?.isConnected) return;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    setStoryProgress(duration ? (video.currentTime / duration) * 100 : 0);
    showStory.raf = requestAnimationFrame(tick);
  };
  showStory.raf = requestAnimationFrame(tick);
}

async function showStory() {
  stopStoryProgress();
  const viewer = state.storyViewer; if (!viewer) return;
  const s = viewer.items[viewer.index]; if (!s) return closeStoryViewer();
  if (!s.own) api(`/api/stories/${s.id}/view`, { method:'POST' }).catch(()=>{});
  const rawMedia = s.media_processing ? '' : (s.media_type === 'video'
    ? `<video id="storyMedia" class="story-media"${mediaVideoSourceAttrs(s)} autoplay playsinline controls${mediaProtectionAttrs(s,{video:true})}></video>`
    : `<img class="story-media" src="${escapeAttr(s.media_url)}" alt="Story"${mediaProtectionAttrs(s)}>`);
  const media = protectedMediaFrame(s,rawMedia,'story-protected-media');
  $('#modal-root').innerHTML = `<div class="story-backdrop"><div class="story-viewer">
    <div class="story-progress">${viewer.items.map((_,i)=>`<span class="${i < viewer.index ? 'done' : i === viewer.index ? 'active' : ''}"><i></i></span>`).join('')}</div>
    <div class="story-head"><button class="person-link" onclick="closeStoryViewer();openProfile('${escapeAttr(s.username)}')">${avatar(s,'small')}<span><b>${escapeHtml(s.name)}</b><small>@${escapeHtml(s.username)} · ${timeAgo(s.created_at)}</small></span></button><button class="story-close" onclick="closeStoryViewer()">×</button></div>
    <div class="story-stage">${media}${s.text ? `<div class="story-caption">${formatText(s.text)}</div>` : ''}<button class="story-prev" onclick="nextStory(-1)">‹</button><button class="story-next" onclick="nextStory(1)">›</button></div>
    ${s.own ? `<div class="story-owner-tools"><button onclick="showStoryViewers(${s.id})">👁 ${s.views_count || 0} visualizaciones</button><button class="danger-text" onclick="deleteStory(${s.id})">Eliminar</button></div>` : ''}
  </div></div>`;

  if (s.media_type === 'video' && !s.media_processing) {
    setupBunnyStreams($('#modal-root') || document);
    const video = $('#storyMedia');
    if (video) {
      video.addEventListener('loadedmetadata', () => setStoryProgress(0), { once:true });
      video.addEventListener('ended', () => { setStoryProgress(100); nextStory(1); }, { once:true });
      runVideoStoryProgress(video);
    }
  } else {
    runImageStoryProgress(6000);
  }
}

window.nextStory = (delta) => {
  if (!state.storyViewer) return;
  const next = state.storyViewer.index + delta;
  if (next < 0) return;
  if (next >= state.storyViewer.items.length) return closeStoryViewer();
  state.storyViewer.index = next; showStory();
};

window.closeStoryViewer = () => { stopStoryProgress(); state.storyViewer = null; closeModal(); if (state.view === 'feed') renderFeed().catch(()=>{}); };

window.deleteStory = async (id) => {
  if (!confirm('¿Eliminar esta Story?')) return;
  try { await api(`/api/stories/${id}`, { method:'DELETE' }); closeStoryViewer(); toast('Story eliminada'); }
  catch (e) { toast(e.message,'error'); }
};

window.showStoryViewers = async (id) => {
  try {
    clearTimeout(showStory.timer);
    const rows = await api(`/api/stories/${id}/viewers`);
    modal(`<div class="modal-head"><h3>Visualizaciones</h3><button class="icon-btn" onclick="closeModal()">×</button></div><div class="viewer-list">${rows.length ? rows.map(u=>`<button class="person-link viewer-row" onclick="closeModal();openProfile('${escapeAttr(u.username)}')">${avatar(u,'small')}<span><b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.username)} · ${timeAgo(u.viewed_at)}</small></span></button>`).join('') : '<div class="empty compact-empty">Todavía no la ha visto nadie.</div>'}</div>`);
  } catch (e) { toast(e.message,'error'); }
};

// --- V0.5: Reels -----------------------------------------------------------
async function renderReels() {
  resetLazyMediaObserver();
  const page = normalizePagePayload(await api('/api/reels?limit=8&offset=0'));
  const rows = page.items;
  $('#main').innerHTML = `${pageHeader('Reels','Vídeos verticales de la comunidad')}<div class="reels-feed" id="reelsFeed">${rows.length ? rows.map(reelHtml).join('') : `<div class="card empty"><div class="empty-icon">▶</div><h3>Aún no hay Reels</h3><p>Publica un vídeo desde Inicio y aparecerá aquí.</p><button class="btn primary" onclick="focusComposer()">Publicar vídeo</button></div>`}</div>${pagerHtml('reels', page.has_more)}`;
  setupReels();
  installInfinitePager('reels', page, async pager => {
    if (state.view !== 'reels') return;
    const next = normalizePagePayload(await api(pageUrl('/api/reels', pager, 8)));
    const feed = document.getElementById('reelsFeed');
    if (feed && next.items.length) feed.insertAdjacentHTML('beforeend', next.items.map(reelHtml).join(''));
    pager.hasMore = next.has_more;
    pager.nextCursor = next.next_cursor;
    pager.nextOffset = next.next_offset;
    setupReels();
  });
}

function reelHtml(p) {
  const rawMedia=p.media_processing?'':`<video class="reel-video"${mediaVideoSourceAttrs(p)} loop muted playsinline preload="none" data-reel-video="1" onclick="toggleReelSound(this)"${mediaProtectionAttrs(p,{video:true})}></video>`;
  const media=protectedMediaFrame(p,rawMedia,'reel-protected-media');
  return `<article class="reel-card" data-reel="${p.id}">
    ${media}
    <div class="reel-gradient"></div>
    <div class="reel-info"><button class="reel-user" onclick="openProfile('${escapeAttr(p.username)}')">${avatar(p,'small')}<span><b>${escapeHtml(p.name)}</b><small>@${escapeHtml(p.username)}</small></span></button>${p.text ? `<div class="reel-text">${formatText(p.text)}</div>` : ''}<div class="reel-hint">Toca el vídeo para activar/desactivar sonido</div></div>
    <div class="reel-actions"><button class="reel-action ${p.liked?'liked':''}" onclick="likePost(${p.id})"><span>${p.liked?'♥':'♡'}</span><b>${p.likes_count}</b></button><button class="reel-action" onclick="openComments(${p.id})"><span>◌</span><b>${p.comments_count}</b></button><button class="reel-action" onclick="sharePost(${p.id})"><span>↗</span></button><button class="reel-action ${p.saved?'saved':''}" onclick="savePost(${p.id})"><span>${p.saved?'▰':'▱'}</span></button></div>
  </article>`;
}

function setupReels() {
  setupBunnyStreams(document);
  const videos = $$('.reel-video');
  if (state.reelObserver) { state.reelObserver.disconnect(); state.reelObserver = null; }
  if (!videos.length) return;
  if (!('IntersectionObserver' in window)) {
    const first = videos[0];
    if (first) { first.preload = 'metadata'; first.play().catch(()=>{}); }
    return;
  }
  state.reelObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    const v = entry.target;
    if (entry.isIntersecting && entry.intersectionRatio > .65) {
      if (v.dataset.metadataLoaded !== '1') {
        v.preload = 'metadata';
        v.dataset.metadataLoaded = '1';
        try { v.load(); } catch (_) {}
      }
      v.play().catch(()=>{});
    } else {
      v.pause();
    }
  }), { rootMargin:'350px 0px', threshold:[0,.25,.65,1] });
  videos.forEach(v => state.reelObserver.observe(v));
}

window.toggleReelSound = (video) => { video.muted = !video.muted; if (video.paused) video.play().catch(()=>{}); };

// --- V0.7: Compartir, republicar y mensajería ------------------------------
window.sharePost = (postId) => {
  modal(`<div class="modal-head"><h3>Compartir</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="share-options">
      <button onclick="repostPost(${postId})"><span>↻</span><div><b>Republicar en Instant Admirers</b><small>Añádelo a tu perfil y al feed de tus seguidores</small></div></button>
      <button onclick="sharePostPrivate(${postId})"><span>✉</span><div><b>Enviar por mensaje</b><small>Compártelo en una conversación privada</small></div></button>
    </div>`);
};

window.repostPost = (postId) => {
  modal(`<div class="modal-head"><h3>Republicar</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="repost-compose">
      <textarea id="repostText" maxlength="1500" rows="5" placeholder="Añade un comentario opcional…"></textarea>
      <div class="edit-post-tools"><span>Quién puede verlo</span><select id="repostVisibility"><option value="public">🌍 Público</option><option value="followers">👥 Seguidores</option></select></div>
      <button class="btn primary" onclick="confirmRepost(${postId})">Republicar</button>
    </div>`);
  setTimeout(()=>$('#repostText')?.focus(),50);
};

window.confirmRepost = async (postId) => {
  try {
    await api(`/api/posts/${postId}/repost`, { method:'POST', body:JSON.stringify({ text:$('#repostText').value, visibility:$('#repostVisibility').value }) });
    closeModal(); toast('Republicado en Instant Admirers'); await refreshMe(false); await renderView();
  } catch(e) { toast(e.message,'error'); }
};

window.sharePostPrivate = async (postId) => {
  try {
    const users = await api('/api/users');
    const ordered = [...users].sort((a,b) => (a.friendship_status === 'friends' ? -1 : 0) - (b.friendship_status === 'friends' ? -1 : 0));
    modal(`<div class="modal-head"><h3>Compartir por mensaje</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
      <div class="share-note">Elige a quién quieres enviar esta publicación.</div>
      <div class="new-message-list">${ordered.length ? ordered.map(u=>`<button class="person-link new-message-user" onclick="sharePostTo(${postId},${u.id})">${avatar(u,'small')}<span><b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.username)}${u.friendship_status==='friends'?' · amigo':''}</small></span><i>›</i></button>`).join('') : '<div class="empty compact-empty">No hay otros usuarios todavía.</div>'}</div>`);
  } catch(e) { toast(e.message,'error'); }
};

window.sharePostTo = async (postId, userId) => {
  try {
    const c = await api(`/api/conversations/direct/${userId}`, { method:'POST' });
    await api(`/api/conversations/${c.id}/messages`, { method:'POST', body:JSON.stringify({ shared_post_id:postId }) });
    closeModal(); toast('Publicación enviada por privado');
  } catch(e) { toast(e.message,'error'); }
};

function settleChatScrollToBottom(stream) {
  if (!stream) return;
  const scroll = () => { stream.scrollTop = stream.scrollHeight; };
  scroll();
  requestAnimationFrame(scroll);
  setTimeout(scroll, 80);
  setTimeout(scroll, 260);
}

async function renderMessages() {
  resetLazyMediaObserver();
  const conversations = await api('/api/conversations');
  const isMobile = matchMedia('(max-width:860px)').matches;
  if (!state.activeConversation && !isMobile && conversations[0]) state.activeConversation = Number(conversations[0].id);
  const active = conversations.find(c => Number(c.id) === Number(state.activeConversation));
  let messages = [];
  let chatAccess = { allowed:true, code:'', reason:'' };
  if (active) {
    [messages,chatAccess] = await Promise.all([
      api(`/api/conversations/${active.id}/messages`),
      api(`/api/conversations/${active.id}/access`)
    ]);
    state.chatAccess = chatAccess;
  } else {
    state.chatAccess = null;
  }
  $('#main').innerHTML = `${pageHeader('Mensajes','Conversaciones privadas en tiempo real')}
    <section class="card chat-shell ${active ? 'has-active' : ''}">
      <div class="conversation-pane">
        <div class="chat-pane-head"><b>Conversaciones</b><button class="btn primary compact" onclick="newMessage()">Nuevo</button></div>
        <div class="conversation-list">${conversations.length ? conversations.map(conversationRow).join('') : `<div class="empty compact-empty"><p>Aún no tienes conversaciones.</p><button class="btn primary compact" onclick="newMessage()">Enviar primer mensaje</button></div>`}</div>
      </div>
      <div class="message-pane">${active ? chatPanelHtml(active,messages,isMobile,chatAccess) : `<div class="chat-placeholder"><div>✉</div><h3>Selecciona una conversación</h3><p>Habla en privado con otras personas de la comunidad.</p></div>`}</div>
    </section>`;
  setupLazyMedia($('#main'));
  if (active) {
    requestAnimationFrame(() => settleChatScrollToBottom($('#messageStream')));
    state.me.unread_messages = Math.max(0, Number(state.me.unread_messages || 0) - Number(active.unread_count || 0));
    updateNavBadges();
    if (state.messagePoll) clearInterval(state.messagePoll);
    const hasProcessingVideo = messages.some(m => Boolean(m?.media_processing || m?.shared_post?.media_processing));
    state.messagePoll = setInterval(refreshActiveConversation, hasProcessingVideo ? 5000 : 15000);
  }
}

function conversationRow(c) {
  const preview = c.last_message ? c.last_message : c.last_shared_post_id ? '↗ Publicación compartida' : c.last_media_type === 'image' ? '📷 Foto' : c.last_media_type === 'video' ? '🎬 Vídeo' : 'Nueva conversación';
  return `<button class="conversation-row ${Number(c.id)===Number(state.activeConversation)?'active':''}" onclick="openConversation(${c.id})">${avatar(c,'small')}<span class="conversation-copy"><b>${escapeHtml(c.name)}${c.online?'<i class="online-dot" title="En línea"></i>':''}</b><small>${escapeHtml(preview).slice(0,65)}</small></span><span class="conversation-meta"><small>${c.last_message_at?timeAgo(c.last_message_at):''}</small>${Number(c.unread_count)>0?`<i>${Math.min(99,c.unread_count)}</i>`:''}</span></button>`;
}

function chatPanelHtml(c, messages, isMobile, chatAccess={allowed:true}) {
  const reply = state.replyTo && Number(state.replyTo.conversationId)===Number(c.id) && chatAccess.allowed ? `<div class="reply-compose" id="replyCompose"><span><b>Respondiendo a ${escapeHtml(state.replyTo.name)}</b><small>${escapeHtml(state.replyTo.text || 'Multimedia').slice(0,90)}</small></span><button onclick="clearReply()">×</button></div>` : '';
  const challengeLocked = !chatAccess.allowed && chatAccess.code === 'FRIEND_GATE_CHAT_LOCKED';
  const composer = chatAccess.allowed
    ? `<div id="messageMediaPreview"></div>
      <div class="message-compose"><label class="attach-btn" title="Galería" onclick="prepareGalleryInput('messageFile',true)">＋<input id="messageFile" type="file" accept="image/*,video/*" onchange="previewMessageFile(this)" hidden></label><button type="button" class="attach-btn capture-icon mobile-capture-only" title="Hacer foto" onclick="captureFromDevice('messageFile','photo','environment')">📷</button><button type="button" class="attach-btn capture-icon mobile-capture-only" title="Grabar vídeo" onclick="captureFromDevice('messageFile','video','environment')">🎥</button><textarea id="messageText" rows="1" maxlength="4000" placeholder="Escribe un mensaje…" oninput="handleTyping(${c.id})" onblur="stopTyping(${c.id})" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage(${c.id})}"></textarea><button id="messageSendBtn" class="btn primary compact" onclick="sendMessage(${c.id})">Enviar</button></div>`
    : `<div class="chat-access-lock"><span>🔒</span><div><b>${escapeHtml(challengeLocked ? teaserCopy('Completa el reto para usar el chat','Complete the challenge to use chat') : teaserCopy('Chat no disponible','Chat unavailable'))}</b><p>${escapeHtml(challengeLocked ? teaserCopy('Este perfil protege sus mensajes con un reto de acceso. Complétalo antes de enviar mensajes, fotos o vídeos.','This profile protects messages with an access challenge. Complete it before sending messages, photos or videos.') : teaserCopy('No puedes enviar mensajes a esta persona en este momento.','You cannot send messages to this person right now.'))}</p></div>${challengeLocked?`<button class="btn primary compact" onclick="openProfile('${escapeAttr(c.username)}')">${teaserCopy('Ver reto','View challenge')}</button>`:''}</div>`;
  return `<div class="chat-header">${isMobile?`<button class="icon-btn chat-back" onclick="closeConversation()">‹</button>`:''}<button class="person-link" onclick="openProfile('${escapeAttr(c.username)}')">${avatar(c,'small')}<span><b>${escapeHtml(c.name)}</b><small>@${escapeHtml(c.username)} · ${presenceHtml({id:c.other_id,online:c.online,last_seen_at:c.last_seen_at})}</small></span></button><button class="icon-btn" onclick="renderMessages()" title="Actualizar">↻</button></div>
    <div class="message-stream" id="messageStream">${messages.length ? messages.map(messageHtml).join('') : `<div class="chat-first"><b>Empieza la conversación con ${escapeHtml(c.name)}</b><span>Los mensajes son privados entre vosotros.</span></div>`}</div>
    <div class="typing-indicator" id="typingIndicator"></div>
    ${reply}
    ${composer}`;
}

function messageHtml(m) {
  const rawMedia = m.media_url ? (m.media_type === 'video' ? `<video class="message-media"${mediaVideoSourceAttrs(m)} controls playsinline preload="none" data-lazy-video="1"${mediaProtectionAttrs(m,{video:true})}></video>` : `<img class="message-media" src="${escapeAttr(m.media_url)}" loading="lazy" decoding="async" alt=""${mediaProtectionAttrs(m)}>` ) : '';
  const media = protectedMediaFrame(m,rawMedia,'message-protected-media');
  const reply = m.reply ? `<div class="message-reply"><b>${escapeHtml(m.reply.name || m.reply.username || 'Mensaje')}</b><span>${escapeHtml(m.reply.text || (m.reply.media_type==='image'?'📷 Foto':m.reply.media_type==='video'?'🎬 Vídeo':'Mensaje')).slice(0,120)}</span></div>` : '';
  let shared = '';
  if (m.shared_post?.unavailable) shared = `<div class="shared-post unavailable">Esta publicación ya no está disponible para ti.</div>`;
  else if (m.shared_post) {
    const sp=m.shared_post;
    const rawSharedMedia=sp.media_url ? (sp.media_type==='video'?`<video class="shared-protected-media-item"${mediaVideoSourceAttrs(sp)} controls playsinline preload="none" data-lazy-video="1"${mediaProtectionAttrs(sp,{video:true})}></video>`:`<img class="shared-protected-media-item" src="${escapeAttr(sp.media_url)}" loading="lazy" decoding="async" alt=""${mediaProtectionAttrs(sp)}${imageViewerAttrs(sp)}>` ) : '';
    const smedia=protectedMediaFrame(sp,rawSharedMedia,'shared-protected-media');
    shared = `<div class="shared-post"><div class="shared-author">${avatar(sp,'small')}<span><b>${escapeHtml(sp.name || sp.username)}</b><small>@${escapeHtml(sp.username || '')}</small></span></div>${sp.text?`<p>${formatText(sp.text)}</p>`:''}${smedia}</div>`;
  }
  const excerpt = safeEncode((m.text || (m.media_type==='image'?'Foto':m.media_type==='video'?'Vídeo':m.shared_post?'Publicación':'Mensaje')).slice(0,100));
  const sender = safeEncode(m.name || m.username || 'Mensaje');
  const replyButton = state.chatAccess?.allowed === false ? '' : `<button class="message-reply-btn" onclick="replyToMessage(${m.id},'${sender}','${excerpt}')" title="Responder">↩</button>`;
  return `<div class="message ${m.own?'mine':'theirs'}">${replyButton}<div class="message-bubble">${reply}${m.text?`<p>${formatText(m.text)}</p>`:''}${media}${shared}<small>${timeAgo(m.created_at)}</small></div></div>`;
}

window.replyToMessage = (id, encodedName, encodedText) => {
  state.replyTo = { id:Number(id), conversationId:Number(state.activeConversation), name:decodeURIComponent(encodedName), text:decodeURIComponent(encodedText) };
  const activeId=state.activeConversation; renderMessages().then(()=>$('#messageText')?.focus());
};
window.clearReply = () => { state.replyTo=null; $('#replyCompose')?.remove(); };

window.openConversation = async (id) => { state.activeConversation = Number(id); state.replyTo=null; state.chatAccess=null; await renderMessages(); };
window.closeConversation = async () => { stopTyping(state.activeConversation); state.activeConversation = null; state.replyTo=null; state.chatAccess=null; if(state.messagePoll){clearInterval(state.messagePoll);state.messagePoll=null;} await renderMessages(); };

window.startMessage = async (userId) => {
  try { const d = await api(`/api/conversations/direct/${userId}`, { method:'POST' }); state.view='messages'; state.activeConversation=Number(d.id); state.replyTo=null; layout(); await renderMessages(); }
  catch(e){ toast(e.message,'error'); }
};

window.newMessage = async () => {
  try {
    const users = await api('/api/users');
    const ordered=[...users].sort((a,b)=>(a.friendship_status==='friends'?-1:0)-(b.friendship_status==='friends'?-1:0));
    modal(`<div class="modal-head"><h3>Nuevo mensaje</h3><button class="icon-btn" onclick="closeModal()">×</button></div><div class="new-message-list">${ordered.length ? ordered.map(u=>`<button class="person-link new-message-user" onclick="closeModal();startMessage(${u.id})">${avatar(u,'small')}<span><b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.username)}${u.online?' · en línea':''}</small></span><i>›</i></button>`).join('') : '<div class="empty compact-empty">No hay más usuarios todavía.</div>'}</div>`);
  } catch(e){ toast(e.message,'error'); }
};

window.previewMessageFile = (input) => {
  const f=input.files?.[0], box=$('#messageMediaPreview'); if(!f||!box) return;
  if (!validateMediaFile(f, input)) { box.innerHTML=''; return; }
  const url=URL.createObjectURL(f); box.innerHTML=`<div class="message-preview">${f.type.startsWith('video/')?`<video src="${url}" controls></video>`:`<img src="${url}" alt="">`}<button onclick="clearMessageFile()">×</button></div>`;
};
window.clearMessageFile = () => { if($('#messageFile')) $('#messageFile').value=''; if($('#messageMediaPreview')) $('#messageMediaPreview').innerHTML=''; };

window.handleTyping = (conversationId) => {
  if(!state.socket?.connected) return;
  state.socket.emit('typing',{conversationId:Number(conversationId),typing:true});
  clearTimeout(state.typingTimer);
  state.typingTimer=setTimeout(()=>stopTyping(conversationId),1100);
};
window.stopTyping = (conversationId) => {
  clearTimeout(state.typingTimer); state.typingTimer=null;
  if(state.socket?.connected && conversationId) state.socket.emit('typing',{conversationId:Number(conversationId),typing:false});
};

window.sendMessage = async (conversationId) => {
  const input=$('#messageText'); const btn=$('#messageSendBtn'); const text=input?.value.trim()||''; const file=$('#messageFile')?.files?.[0];
  if((!text&&!file) || state.messageSending) return;
  if (file && !validateMediaFile(file, $('#messageFile'))) { clearMessageFile(); return; }
  try {
    state.messageSending=true; if(btn){btn.disabled=true;btn.textContent='…';} if(input) input.disabled=true;
    let media_id=null;
    if(file){ const up=await uploadMediaFile(file); media_id=up.media_id; }
    await api(`/api/conversations/${conversationId}/messages`,{method:'POST',body:JSON.stringify({text,media_id,reply_to_id:state.replyTo?.id||null})});
    stopTyping(conversationId); state.replyTo=null; if(input) input.value=''; clearMessageFile(); await renderMessages();
  } catch(e){
    toast(e.message,'error');
    if(e.code==='FRIEND_GATE_CHAT_LOCKED'){ state.replyTo=null; state.chatAccess={allowed:false,code:e.code,reason:'challenge'}; await renderMessages().catch(()=>{}); }
  }
  finally { state.messageSending=false; if(btn?.isConnected){btn.disabled=false;btn.textContent='Enviar';} if(input?.isConnected) input.disabled=false; }
};

async function refreshActiveConversation(){
  if(state.view!=='messages'||!state.activeConversation) return;
  try{
    const [messages,chatAccess]=await Promise.all([
      api(`/api/conversations/${state.activeConversation}/messages`),
      api(`/api/conversations/${state.activeConversation}/access`)
    ]);
    const accessChanged = Boolean(state.chatAccess?.allowed) !== Boolean(chatAccess?.allowed) || String(state.chatAccess?.code||'') !== String(chatAccess?.code||'');
    state.chatAccess=chatAccess;
    if(accessChanged){ await renderMessages(); return; }
    const stream=$('#messageStream');
    if(!stream) return;
    const nearBottom=stream.scrollHeight-stream.scrollTop-stream.clientHeight<100;
    stream.innerHTML=messages.length?messages.map(messageHtml).join(''):'<div class="chat-first"><span>Aún no hay mensajes.</span></div>';
    setupLazyMedia(stream);
    if(nearBottom) settleChatScrollToBottom(stream);
    const hasProcessingVideo = messages.some(m => Boolean(m?.media_processing || m?.shared_post?.media_processing));
    if(state.messagePoll){
      clearInterval(state.messagePoll);
      state.messagePoll=setInterval(refreshActiveConversation,hasProcessingVideo?5000:15000);
    }
  }catch{}
}


function updateNavBadges() {
  const values = { messages:Number(state.me?.unread_messages||0), notifications:Number(state.me?.unread_notifications||0) };
  for (const [view,count] of Object.entries(values)) {
    document.querySelectorAll(`[data-nav-view="${view}"]`).forEach(btn => {
      let badge=btn.querySelector('.nav-badge');
      if(count>0){ if(!badge){ badge=document.createElement('span'); badge.className='nav-badge'; btn.appendChild(badge); } badge.textContent=String(Math.min(99,count)); }
      else badge?.remove();
    });
  }
  const top=$('#topActivityButton');
  if(top){ let badge=top.querySelector('.nav-badge'); const count=values.notifications; if(count>0){ if(!badge){badge=document.createElement('span');badge.className='nav-badge';top.appendChild(badge);} badge.textContent=String(Math.min(99,count)); } else badge?.remove(); }
}

function updatePresenceDom(userId, online, lastSeenAt = null) {
  document.querySelectorAll(`[data-presence-user="${Number(userId)}"]`).forEach(el => {
    el.classList.toggle('online', Boolean(online));
    el.innerHTML = `<i></i>${online ? 'En línea' : (lastSeenAt ? `Última vez ${timeAgo(lastSeenAt)}` : 'Desconectado')}`;
  });
}

function browserNotice(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try { new Notification(title, { body }); } catch {}
}

window.requestBrowserNotifications = async () => {
  if (!('Notification' in window)) return toast('Este navegador no permite avisos');
  const result = await Notification.requestPermission();
  toast(result === 'granted' ? 'Avisos activados' : 'No se activaron los avisos');
  if(state.view==='notifications') renderNotifications().catch(()=>{});
};

function connectRealtime() {
  if (!state.token || typeof io === 'undefined') return;
  if (state.socket) state.socket.disconnect();
  state.socket = io({ auth:{ token:state.token }, transports:['websocket','polling'] });
  state.socket.on('presence', ({userId,online,lastSeenAt}) => updatePresenceDom(userId,online,lastSeenAt));
  state.socket.on('typing', ({conversationId,typing}) => {
    if(Number(conversationId)!==Number(state.activeConversation)) return;
    const box=$('#typingIndicator'); if(box) box.textContent=typing?'Escribiendo…':'';
  });
  state.socket.on('message:new', async (event) => {
    if(state.view==='messages' && Number(state.activeConversation)===Number(event.conversationId)) {
      await refreshActiveConversation();
      state.socket.emit('typing',{conversationId:Number(event.conversationId),typing:false});
    } else {
      state.me.unread_messages=Number(state.me.unread_messages||0)+1; updateNavBadges();
      toast('Nuevo mensaje'); browserNotice('Instant Admirers', event.text || (event.sharedPostId ? 'Te han compartido una publicación' : 'Tienes un nuevo mensaje'));
    }
  });
  state.socket.on('notification:new', (event) => {
    state.me.unread_notifications=Number(state.me.unread_notifications||0)+1; updateNavBadges();
    const labels={follow:'Nuevo seguidor',follow_request:'Nueva solicitud de seguimiento',follow_accept:'Solicitud de seguimiento aceptada',like:'Nuevo me gusta',comment:'Nuevo comentario',friend_request:'Nueva solicitud de amistad',friend_accept:'Solicitud aceptada',mention:'Te han mencionado',repost:'Han republicado tu post'};
    browserNotice('Instant Admirers', labels[event.type] || 'Tienes nueva actividad');
  });
}

async function refreshMe(rebuild = true) {
  state.me = await api('/api/me');
  window.IAI18N?.syncFromAccount?.(state.me?.preferred_language);
  if (rebuild) layout();
  else loadRightbar();
}


// --- V1.0: onboarding, cuenta y administración -----------------------------
window.openOnboarding = () => {
  const u = state.me || {};
  modal(`<div class="modal-head"><h3>Bienvenido a Instant Admirers</h3><button class="icon-btn" onclick="skipOnboarding()">×</button></div>
    <div class="onboarding">
      <div class="onboarding-intro">
        <span>✨</span>
        <h2>Haz tu perfil un poco más tuyo</h2>
        <p>Esto ayuda a que “Para ti” y las recomendaciones empiecen con mejores señales.</p>
      </div>
      <label>Frase de perfil<input id="onHeadline" maxlength="140" value="${escapeAttr(u.headline || '')}" placeholder="Diseñador, creador, viajero…"></label>
      <label>Intereses<input id="onInterests" maxlength="500" value="${escapeAttr(u.interests || '')}" placeholder="música, viajes, tecnología"></label>
      <label>Ubicación<input id="onLocation" maxlength="120" value="${escapeAttr(u.location || '')}" placeholder="Valencia, España"></label>
      <div class="onboarding-actions"><button class="btn ghost" onclick="skipOnboarding()">Ahora no</button><button class="btn primary" onclick="saveOnboarding()">Guardar y empezar</button></div>
    </div>`);
};

window.saveOnboarding = async () => {
  try {
    await api('/api/onboarding', { method:'POST', body:JSON.stringify({
      headline:$('#onHeadline')?.value || '',
      interests:$('#onInterests')?.value || '',
      location:$('#onLocation')?.value || ''
    }) });
    closeModal();
    await refreshMe();
    toast('Perfil preparado');
  } catch(e) { toast(e.message,'error'); }
};

window.skipOnboarding = async () => {
  try {
    await api('/api/onboarding', { method:'POST', body:JSON.stringify({
      headline:state.me?.headline || '',
      interests:state.me?.interests || '',
      location:state.me?.location || ''
    }) });
    closeModal();
    await refreshMe(false);
  } catch(e) { closeModal(); }
};

window.openLegalAcceptance = () => {
  modal(`<div class="modal-head"><h3>Actualización legal</h3></div>
    <div class="legal-acceptance">
      <div class="legal-acceptance-icon">18+</div>
      <h2>Antes de continuar</h2>
      <p>Instant Admirers es una comunidad exclusivamente para mayores de 18 años. Para seguir usando tu cuenta debes confirmar tu edad y aceptar los Términos de Uso vigentes.</p>
      <label class="legal-check"><input id="existingLegalCheck" type="checkbox"><span>Confirmo que tengo <b>18 años o más</b> y acepto los <a href="/terms/" target="_blank" rel="noopener">Términos de Uso</a> y las <a href="/community-guidelines/" target="_blank" rel="noopener">Normas de la Comunidad</a>. He leído la <a href="/privacy/" target="_blank" rel="noopener">Política de Privacidad</a>.</span></label>
      <div class="legal-acceptance-actions"><button class="btn ghost" onclick="logout()">Salir</button><button id="acceptLegalBtn" class="btn primary" onclick="acceptCurrentLegal()">Aceptar y continuar</button></div>
    </div>`);
};

window.acceptCurrentLegal = async () => {
  if (!$('#existingLegalCheck')?.checked) return toast('Confirma la edad y aceptación para continuar','error');
  const btn=$('#acceptLegalBtn'); if(btn?.disabled)return;
  try{
    if(btn){btn.disabled=true;btn.textContent='Guardando…';}
    await api('/api/account/accept-terms',{method:'POST',body:JSON.stringify({age_confirmed:true,terms_accepted:true})});
    closeModal();
    await refreshMe(false);
    if (state.me && state.me.onboarding_completed === false) setTimeout(openOnboarding, 100);
  }catch(e){toast(e.message,'error');if(btn){btn.disabled=false;btn.textContent='Aceptar y continuar';}}
};

window.openAccountSettings = () => {
  modal(`<div class="modal-head"><h3>Ajustes de cuenta</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="account-settings">
      <section class="settings-block">
        <div><b>Email</b><small>${escapeHtml(state.me?.email || '')} · ${state.me?.email_verified_at?'<span class="verified-email">Verificado</span>':'<span class="pending-email">Sin verificar</span>'}</small></div>
        <div class="settings-actions">${state.me?.email_verified_at?'':'<button class="btn ghost compact" onclick="sendMyVerification()">Verificar</button>'}<button class="btn ghost compact" onclick="openEmailChange()">Cambiar email</button></div>
      </section>
      <section class="settings-block">
        <div><b>Contraseña</b><small>Cambia tu contraseña usando la actual.</small></div>
        <button class="btn ghost compact" onclick="openPasswordChange()">Cambiar contraseña</button>
      </section>
      <section class="settings-block">
        <div><b>Privacidad</b><small>Cuenta privada, mensajes, bloqueos y silencios.</small></div>
        <button class="btn ghost compact" onclick="closeModal();openPrivacySettings()">Abrir privacidad</button>
      </section>
      <section class="settings-block language-settings-block">
        <div><b>Idioma</b><small>Se detecta automáticamente la primera vez y después se guarda en tu cuenta.</small></div>
        ${window.IAI18N?.switcherHtml?.(false) || ''}
      </section>
      ${state.me?.is_admin ? `<section class="settings-block"><div><b>Administración</b><small>Revisa denuncias y actividad de moderación.</small></div><button class="btn ghost compact" onclick="closeModal();go('admin')">Abrir panel</button></section>` : ''}
      <section class="settings-block pwa-settings-block">
        <div><b>Aplicación</b><small>${isStandaloneApp() ? 'Instant Admirers está instalada en este dispositivo.' : 'Instala Instant Admirers y ábrela desde tu pantalla de inicio.'}</small></div>
        <button class="btn ghost compact" data-pwa-install-label onclick="installInstantAdmirers()" ${isStandaloneApp()?'disabled':''}>${isStandaloneApp()?'Instalada':'Instalar app'}</button>
      </section>
      <section class="settings-block">
        <div><b>Legal y privacidad</b><small>Aviso legal, privacidad, cookies, términos y normas de la comunidad.</small></div>
        <a class="btn ghost compact legal-settings-link" href="/legal/" target="_blank" rel="noopener">Ver documentos</a>
      </section>
      <section class="settings-block">
        <div><b>Sesión</b><small>Cierra tu sesión de Instant Admirers en este dispositivo.</small></div>
        <button class="btn ghost compact" onclick="closeModal();logout()">Cerrar sesión</button>
      </section>
      <section class="settings-block danger-settings">
        <div><b>Eliminar cuenta</b><small>Esta acción elimina tu perfil y tus datos asociados de Instant Admirers.</small></div>
        <button class="btn danger compact" onclick="openDeleteAccount()">Eliminar cuenta</button>
      </section>
    </div>`);
};


window.sendMyVerification = async () => {
  try{await api('/api/account/email/verification',{method:'POST',body:'{}'});toast('Te hemos enviado un correo de verificación');}
  catch(e){toast(e.message,'error');}
};

window.openEmailChange = () => {
  modal(`<div class="modal-head"><h3>Cambiar email</h3><button class="icon-btn" onclick="openAccountSettings()">×</button></div>
    <div class="account-form"><p class="muted">Enviaremos un enlace al nuevo email. El cambio solo se aplica cuando lo confirmes.</p>
      <label>Nuevo email<input id="newAccountEmail" type="email" autocomplete="email"></label>
      <label>Contraseña actual<input id="emailCurrentPassword" type="password" autocomplete="current-password"></label>
      <button id="changeEmailSubmit" class="btn primary" onclick="requestEmailChange()">Confirmar nuevo email</button>
    </div>`);
};

window.requestEmailChange = async () => {
  const btn=$('#changeEmailSubmit'); if(btn?.disabled)return;
  try{
    if(btn){btn.disabled=true;btn.textContent='Enviando…';}
    await api('/api/account/email',{method:'POST',body:JSON.stringify({new_email:$('#newAccountEmail')?.value || '',current_password:$('#emailCurrentPassword')?.value || ''})});
    closeModal(); toast('Revisa el nuevo email para confirmar el cambio');
  }catch(e){toast(e.message,'error');}
  finally{if(btn?.isConnected){btn.disabled=false;btn.textContent='Confirmar nuevo email';}}
};

window.openPasswordChange = () => {
  modal(`<div class="modal-head"><h3>Cambiar contraseña</h3><button class="icon-btn" onclick="openAccountSettings()">×</button></div>
    <div class="account-form">
      <label>Contraseña actual<input id="currentPassword" type="password" autocomplete="current-password"></label>
      <label>Nueva contraseña<input id="newPassword" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres"></label>
      <label>Repite la nueva contraseña<input id="newPassword2" type="password" autocomplete="new-password"></label>
      <button class="btn primary" onclick="changePassword()">Guardar contraseña</button>
    </div>`);
};

window.changePassword = async () => {
  const a=$('#newPassword')?.value || '', b=$('#newPassword2')?.value || '';
  if(a!==b) return toast('Las nuevas contraseñas no coinciden','error');
  try {
    await api('/api/account/password',{method:'POST',body:JSON.stringify({current_password:$('#currentPassword').value,new_password:a})});
    closeModal(); toast('Contraseña actualizada. Vuelve a entrar.'); setTimeout(()=>logout(),700);
  } catch(e){ toast(e.message,'error'); }
};

window.openDeleteAccount = () => {
  modal(`<div class="modal-head"><h3>Eliminar cuenta</h3><button class="icon-btn" onclick="openAccountSettings()">×</button></div>
    <div class="delete-account-box">
      <div class="danger-callout"><b>Esta acción es permanente</b><p>Se eliminarán tu perfil, publicaciones, Stories, mensajes y relaciones asociadas a la cuenta.</p></div>
      <label>Contraseña<input id="deletePassword" type="password" autocomplete="current-password"></label>
      <label>Escribe <b>ELIMINAR</b><input id="deleteConfirm" autocomplete="off" placeholder="ELIMINAR"></label>
      <button class="btn danger" onclick="deleteAccount()">Eliminar mi cuenta definitivamente</button>
    </div>`);
};

window.deleteAccount = async () => {
  if(!confirm('¿Confirmas que quieres eliminar tu cuenta definitivamente?')) return;
  try{
    await api('/api/account',{method:'DELETE',body:JSON.stringify({password:$('#deletePassword').value,confirmation:$('#deleteConfirm').value})});
    closeModal(); logout();
  }catch(e){toast(e.message,'error');}
};

function reportReasonLabel(reason='') {
  return ({spam:'Spam',harassment:'Acoso',impersonation:'Suplantación',nudity:'Desnudos / contenido sexual',violence:'Violencia',hate:'Odio',scam:'Estafa',other:'Otro'})[reason] || reason;
}

function adPlacementLabel(value='') {
  return ({right_sidebar:'Columna derecha',feed:'Dentro del feed',profile:'Perfiles'})[value] || value;
}
function adProfileModeLabel(value='') {
  return ({all:'Todos los perfiles',include:'Solo perfiles seleccionados',exclude:'Todos excepto seleccionados'})[value] || value;
}
function adScheduleLabel(ad={}) {
  const now=Date.now(),start=ad.starts_at?new Date(ad.starts_at).getTime():null,end=ad.ends_at?new Date(ad.ends_at).getTime():null;
  if(start && start>now) return `Programada · empieza ${(window.IAI18N?.formatDateTime?.(ad.starts_at) || new Date(ad.starts_at).toLocaleString())}`;
  if(end && end<=now) return `Finalizada · ${(window.IAI18N?.formatDateTime?.(ad.ends_at) || new Date(ad.ends_at).toLocaleString())}`;
  if(end) return `Activa hasta ${(window.IAI18N?.formatDateTime?.(ad.ends_at) || new Date(ad.ends_at).toLocaleString())}`;
  if(start) return `Desde ${(window.IAI18N?.formatDateTime?.(ad.starts_at) || new Date(ad.starts_at).toLocaleString())}`;
  return 'Sin fechas';
}
function adAdminCard(ad={}) {
  const impressions=Number(ad.impressions||0),clicks=Number(ad.clicks||0),ctr=impressions?((clicks/impressions)*100).toFixed(2):'0.00';
  const targets=Array.isArray(ad.targets)?ad.targets:[];
  return `<article class="admin-ad-card ${ad.active?'':'inactive'}">
    <div class="admin-ad-preview">${ad.creative_type==='image'&&(ad.image_display_url||ad.image_url)?`<img src="${escapeAttr(ad.image_display_url||ad.image_url)}" alt="">`:`<div class="google-ad-mark">G<span>Google</span></div>`}</div>
    <div class="admin-ad-body">
      <div class="admin-ad-title"><div><b>${escapeHtml(ad.name)}</b><span>${ad.creative_type==='google'?'Google AdSense':'Banner de imagen'} · ${ad.active?'Activo':'Desactivado'}</span></div><em class="${ad.active?'active':''}">${ad.active?'ACTIVO':'PAUSADO'}</em></div>
      <div class="admin-ad-tags">${(ad.placements||[]).map(x=>`<span>${escapeHtml(adPlacementLabel(x))}</span>`).join('')}<span>${ad.desktop_enabled?'PC':''}${ad.desktop_enabled&&ad.mobile_enabled?' + ':''}${ad.mobile_enabled?'Móvil':''}</span><span>${escapeHtml(adProfileModeLabel(ad.profile_mode))}</span></div>
      ${targets.length?`<div class="admin-ad-targets"><small>Perfiles:</small>${targets.slice(0,8).map(t=>`<span>@${escapeHtml(t.username)}</span>`).join('')}${targets.length>8?`<span>+${targets.length-8}</span>`:''}</div>`:''}
      <div class="admin-ad-meta"><span>${escapeHtml(adScheduleLabel(ad))}</span><span>Prioridad ${Number(ad.priority||0)}</span>${ad.creative_type==='image'?`<span>${impressions} impresiones · ${clicks} clics · CTR ${ctr}%</span>`:'<span>Rendimiento de clics: Google AdSense</span>'}</div>
      <div class="admin-ad-actions"><button class="btn ghost compact" onclick="previewAdminAd(${Number(ad.id)})">Vista previa</button><button class="btn ghost compact" onclick="openAdEditor(${Number(ad.id)})">Editar</button><button class="btn ${ad.active?'ghost':'primary'} compact" onclick="toggleAdminAd(${Number(ad.id)},${ad.active?'false':'true'})">${ad.active?'Desactivar':'Activar'}</button><button class="btn danger compact" onclick="deleteAdminAd(${Number(ad.id)})">Eliminar</button></div>
    </div>
  </article>`;
}
function advertisingAdminHtml(data={}) {
  const ads=Array.isArray(data.ads)?data.ads:[];
  const enabled=Boolean(data.settings?.enabled);
  return `<section class="card admin-section advertising-admin">
    <div class="section-row"><div><h3>Publicidad</h3><p>Banners propios o Google AdSense, con ubicaciones, dispositivos, fechas y segmentación por perfiles.</p></div><span class="advertising-master-badge ${enabled?'active':''}">${enabled?'ACTIVA':'APAGADA'}</span></div>
    <div class="advertising-master-row"><label><span><b>Sistema de publicidad</b><small>Si está apagado no aparece ningún anuncio ni ningún hueco publicitario.</small></span><input type="checkbox" id="advertisingSystemEnabled" ${enabled?'checked':''} onchange="toggleAdvertisingSystem(this.checked)"></label><button class="btn primary compact" onclick="openAdEditor(0)">+ Crear anuncio</button></div>
    <div class="admin-ad-list">${ads.length?ads.map(adAdminCard).join(''):'<div class="advertising-empty"><b>No hay publicidad configurada</b><p>La plataforma no muestra ningún espacio vacío. Crea un anuncio cuando quieras empezar.</p><button class="btn primary compact" onclick="openAdEditor(0)">Crear primer anuncio</button></div>'}</div>
  </section>`;
}
function toDateTimeLocal(value){
  if(!value) return '';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
  const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
}
function currentAdminAd(id){return (state.adminAdsData?.ads||[]).find(a=>Number(a.id)===Number(id))||null;}

window.toggleAdvertisingSystem=async(enabled)=>{
  try{await api('/api/admin/ads/settings',{method:'PATCH',body:JSON.stringify({enabled:Boolean(enabled)})});toast(enabled?'Publicidad activada':'Publicidad desactivada');await renderAdmin();}catch(e){toast(e.message,'error');await renderAdmin();}
};
window.toggleAdminAd=async(id,active)=>{
  try{await api(`/api/admin/ads/${Number(id)}/status`,{method:'PATCH',body:JSON.stringify({active:Boolean(active)})});toast(active?'Anuncio activado':'Anuncio desactivado');await renderAdmin();}catch(e){toast(e.message,'error');}
};
window.deleteAdminAd=async(id)=>{
  const ad=currentAdminAd(id);if(!ad)return;
  if(!confirm(`¿Eliminar definitivamente la publicidad “${ad.name}”?`))return;
  try{await api(`/api/admin/ads/${Number(id)}`,{method:'DELETE'});toast('Anuncio eliminado');await renderAdmin();}catch(e){toast(e.message,'error');}
};
window.previewAdminAd=(id)=>{
  const ad=currentAdminAd(id);if(!ad)return;
  if(ad.creative_type==='google'){
    modal(`<div class="modal-head"><h3>Vista previa · ${escapeHtml(ad.name)}</h3><button class="icon-btn" onclick="closeModal()">×</button></div><div class="ad-preview-modal google-preview"><div class="google-preview-box"><b>Google AdSense</b><p>El bloque se cargará en su ubicación real cuando esté activo. Para no generar impresiones de prueba en Google, aquí no ejecutamos el anuncio.</p><small>Ubicaciones: ${(ad.placements||[]).map(adPlacementLabel).join(' · ')}</small></div></div>`);return;
  }
  const english=(window.IAI18N?.getLanguage?.() || 'es')==='en';
  const legacyText=ad.display_text===null ? (ad.alt_text||'') : (ad.display_text||'');
  const previewAd={...ad,
    alt_text:english?(ad.alt_text_en||ad.alt_text||''):(ad.alt_text||''),
    display_title:english?(ad.display_title_en||ad.display_title||''):(ad.display_title||''),
    display_text:english?(ad.display_text_en||legacyText):legacyText,
    button_text:english?(ad.button_text_en||ad.button_text||''):(ad.button_text||'')
  };
  modal(`<div class="modal-head"><h3>Vista previa · ${escapeHtml(ad.name)}</h3><button class="icon-btn" onclick="closeModal()">×</button></div><div class="ad-preview-modal"><div class="ad-preview-card"><span class="ad-disclosure">Publicidad</span>${(ad.image_display_url||ad.image_url)?`<img src="${escapeAttr(ad.image_display_url||ad.image_url)}" alt="${escapeAttr(previewAd.alt_text||'')}">`:''}${adVisibleCopyHtml(previewAd)}</div>${(ad.mobile_image_display_url||ad.mobile_image_url)?`<div class="ad-mobile-preview"><small>Imagen móvil</small><img src="${escapeAttr(ad.mobile_image_display_url||ad.mobile_image_url)}" alt=""></div>`:''}</div>`);
};

window.openAdEditor=(id=0)=>{
  const ad=currentAdminAd(id)||{id:0,name:'',active:true,creative_type:'image',image_url:'',image_provider:'',image_provider_id:'',mobile_image_url:'',mobile_image_provider:'',mobile_image_provider_id:'',link_url:'',google_code:'',alt_text:'',alt_text_en:'',display_title:'',display_title_en:'',display_text:'',display_text_en:'',button_text:'',button_text_en:'',placements:['feed'],desktop_enabled:true,mobile_enabled:true,profile_mode:'all',priority:0,starts_at:null,ends_at:null,targets:[]};
  state.adEditorTargets=[...(ad.targets||[])];
  state.adEditorId=Number(ad.id||0);
  modal(`<div class="modal-head"><h3>${ad.id?'Editar publicidad':'Crear publicidad'}</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="ad-editor">
      <div class="ad-editor-grid two"><label>Nombre interno<input id="adName" maxlength="120" value="${escapeAttr(ad.name||'')}" placeholder="Banner septiembre"></label><label>Tipo<select id="adCreativeType" onchange="adEditorRefresh()"><option value="image" ${ad.creative_type==='image'?'selected':''}>Banner de imagen</option><option value="google" ${ad.creative_type==='google'?'selected':''}>Google AdSense (código)</option></select></label></div>
      <label class="ad-active-line"><span><b>Anuncio activo</b><small>Puede estar configurado y dejarse pausado.</small></span><input id="adActive" type="checkbox" ${ad.active?'checked':''}></label>
      <div id="adImageFields" class="ad-editor-block">
        <div class="ad-editor-block-head"><b>Creatividad de imagen</b><small>Puedes subirla desde tu ordenador o pegar una URL.</small></div>
        <div class="ad-editor-grid two"><label>Imagen principal desde ordenador<input id="adImageFile" type="file" accept="image/*" onchange="previewAdLocalFile(this,'adImageLivePreview')"></label><label>O URL de imagen<input id="adImageUrl" type="url" value="${escapeAttr(ad.image_url||'')}" placeholder="https://..."></label></div>
        <div id="adImageLivePreview" class="ad-editor-live-preview">${(ad.image_display_url||ad.image_url)?`<img src="${escapeAttr(ad.image_display_url||ad.image_url)}" alt="">`:''}</div>
        <div class="ad-editor-grid two"><label>Imagen móvil opcional<input id="adMobileImageFile" type="file" accept="image/*" onchange="previewAdLocalFile(this,'adMobileLivePreview')"></label><label>O URL móvil opcional<input id="adMobileImageUrl" type="url" value="${escapeAttr(ad.mobile_image_url||'')}" placeholder="Si está vacío usa la principal"></label></div>
        <div id="adMobileLivePreview" class="ad-editor-live-preview mobile">${(ad.mobile_image_display_url||ad.mobile_image_url)?`<img src="${escapeAttr(ad.mobile_image_display_url||ad.mobile_image_url)}" alt="">`:''}</div>
        <div class="ad-editor-grid two"><label>Dirección al hacer clic<input id="adLinkUrl" type="url" value="${escapeAttr(ad.link_url||'')}" placeholder="https://..."></label><label>Texto alternativo (accesibilidad) · ES<input id="adAltText" maxlength="240" value="${escapeAttr(ad.alt_text||'')}" placeholder="Describe la imagen para accesibilidad"><small class="ad-field-help">Este texto no se muestra visualmente.</small></label></div>
        <div class="ad-visible-copy-editor">
          <div class="ad-editor-block-head"><b>Texto visible del anuncio (opcional)</b><small>Configura español e inglés. Si el inglés queda vacío se utilizará el español.</small></div>
          <div class="ad-language-copy-group" data-no-i18n><strong>🇪🇸 Español</strong><div class="ad-editor-grid two"><label>Título visible<input id="adDisplayTitle" maxlength="120" value="${escapeAttr(ad.display_title||'')}" placeholder="¿Jugamos?"></label><label>Texto del botón<input id="adButtonText" maxlength="60" value="${escapeAttr(ad.button_text||'')}" placeholder="Entrar ahora"><small class="ad-field-help">El botón aparece si también hay una dirección de destino.</small></label></div><label>Texto visible<textarea id="adDisplayText" class="ad-copy-input" maxlength="500" rows="3" placeholder="Escribe aquí el mensaje que quieres que se vea en la publicidad">${escapeHtml(ad.display_text===null?(ad.alt_text||''):(ad.display_text||''))}</textarea></label></div>
          <div class="ad-language-copy-group" data-no-i18n><strong>🇬🇧 English</strong><div class="ad-editor-grid two"><label>Visible title<input id="adDisplayTitleEn" maxlength="120" value="${escapeAttr(ad.display_title_en||'')}" placeholder="Want to play?"></label><label>Button text<input id="adButtonTextEn" maxlength="60" value="${escapeAttr(ad.button_text_en||'')}" placeholder="Enter now"></label></div><label>Visible text<textarea id="adDisplayTextEn" class="ad-copy-input" maxlength="500" rows="3" placeholder="Write the English message here">${escapeHtml(ad.display_text_en||'')}</textarea></label><label>Alternative text (accessibility)<input id="adAltTextEn" maxlength="240" value="${escapeAttr(ad.alt_text_en||'')}" placeholder="Describe the image in English"></label></div>
        </div>
      </div>
      <div id="adGoogleFields" class="ad-editor-block">
        <div class="ad-editor-block-head"><b>Código de Google AdSense</b><small>Pega el bloque oficial completo. Solo se admite el código de AdSense, no JavaScript arbitrario.</small></div>
        <textarea id="adGoogleCode" rows="9" spellcheck="false" placeholder="Pega aquí el código de Google AdSense">${escapeHtml(ad.google_code||'')}</textarea>
      </div>
      <div class="ad-editor-block"><div class="ad-editor-block-head"><b>Dónde mostrarlo</b><small>Si una ubicación no tiene ningún anuncio activo, no aparece ningún hueco.</small></div>
        <div class="ad-check-grid"><label><input id="adPlaceRight" type="checkbox" ${(ad.placements||[]).includes('right_sidebar')?'checked':''}><span><b>Columna derecha</b><small>Solo ordenador · entre Personas para ti y Tendencias.</small></span></label><label><input id="adPlaceFeed" type="checkbox" ${(ad.placements||[]).includes('feed')?'checked':''}><span><b>Dentro del feed</b><small>Tras las primeras publicaciones, en PC y móvil.</small></span></label><label><input id="adPlaceProfile" type="checkbox" ${(ad.placements||[]).includes('profile')?'checked':''}><span><b>En perfiles</b><small>Debajo de la cabecera del perfil.</small></span></label></div>
      </div>
      <div class="ad-editor-grid two"><div class="ad-editor-block"><div class="ad-editor-block-head"><b>Dispositivos</b></div><div class="ad-device-checks"><label><input id="adDesktopEnabled" type="checkbox" ${ad.desktop_enabled?'checked':''}> Ordenador</label><label><input id="adMobileEnabled" type="checkbox" ${ad.mobile_enabled?'checked':''}> Móvil</label></div></div><div class="ad-editor-block"><div class="ad-editor-block-head"><b>Prioridad</b><small>Los valores altos se eligen primero.</small></div><input id="adPriority" type="number" min="-1000" max="1000" value="${Number(ad.priority||0)}"></div></div>
      <div class="ad-editor-block"><div class="ad-editor-block-head"><b>Segmentación por perfil</b><small>Permite que una publicidad aparezca solo al visitar @usuarios concretos o que los excluya. Las campañas limitadas a perfiles no aparecen en el feed general.</small></div>
        <select id="adProfileMode" onchange="adEditorRefresh()"><option value="all" ${ad.profile_mode==='all'?'selected':''}>Todos los perfiles / sin restricción</option><option value="include" ${ad.profile_mode==='include'?'selected':''}>Solo perfiles seleccionados</option><option value="exclude" ${ad.profile_mode==='exclude'?'selected':''}>Todos excepto perfiles seleccionados</option></select>
        <div id="adProfileTargetsBox" class="ad-target-box"><div class="ad-target-search"><input id="adTargetSearch" maxlength="80" placeholder="Buscar @usuario o nombre" onkeydown="if(event.key==='Enter'){event.preventDefault();searchAdTargetProfiles()}"><button class="btn ghost compact" onclick="searchAdTargetProfiles()">Buscar</button></div><div id="adTargetResults" class="ad-target-results"></div><div id="adTargetChips" class="ad-target-chips"></div></div>
      </div>
      <div class="ad-editor-block"><div class="ad-editor-block-head"><b>Programación opcional</b><small>Déjalo vacío para mostrarlo mientras esté activo.</small></div><div class="ad-editor-grid two"><label>Empieza<input id="adStartsAt" type="datetime-local" value="${escapeAttr(toDateTimeLocal(ad.starts_at))}"></label><label>Termina<input id="adEndsAt" type="datetime-local" value="${escapeAttr(toDateTimeLocal(ad.ends_at))}"></label></div></div>
      <div class="ad-editor-actions"><button class="btn ghost" onclick="closeModal()">Cancelar</button><button id="saveAdButton" class="btn primary" onclick="saveAdminAd()">${ad.id?'Guardar cambios':'Crear anuncio'}</button></div>
    </div>`);
  adEditorRefresh();renderAdTargetChips();
};
window.adEditorRefresh=()=>{
  const type=$('#adCreativeType')?.value||'image',mode=$('#adProfileMode')?.value||'all';
  if($('#adImageFields'))$('#adImageFields').hidden=type!=='image';
  if($('#adGoogleFields'))$('#adGoogleFields').hidden=type!=='google';
  if($('#adProfileTargetsBox'))$('#adProfileTargetsBox').hidden=mode==='all';
};
window.previewAdLocalFile=(input,previewId)=>{
  const file=input?.files?.[0];if(!file)return;
  if(!String(file.type||'').startsWith('image/')){toast('Selecciona una imagen','error');input.value='';return;}
  if(file.size>10*1024*1024){toast('La imagen supera 10 MB','error');input.value='';return;}
  const box=document.getElementById(previewId);if(box)box.innerHTML=`<img src="${URL.createObjectURL(file)}" alt="Vista previa">`;
};
function renderAdTargetChips(){
  const box=$('#adTargetChips');if(!box)return;
  box.innerHTML=state.adEditorTargets?.length?state.adEditorTargets.map(t=>`<span>@${escapeHtml(t.username)} <button type="button" onclick="removeAdTargetProfile(${Number(t.id)})">×</button></span>`).join(''):'<small>No hay perfiles seleccionados.</small>';
}
window.removeAdTargetProfile=(id)=>{state.adEditorTargets=(state.adEditorTargets||[]).filter(t=>Number(t.id)!==Number(id));renderAdTargetChips();};
window.addAdTargetProfile=(id,encodedUsername,encodedName)=>{
  const username=decodeURIComponent(encodedUsername||''),name=decodeURIComponent(encodedName||'');
  if(!(state.adEditorTargets||[]).some(t=>Number(t.id)===Number(id))) state.adEditorTargets.push({id:Number(id),username,name});
  renderAdTargetChips();const results=$('#adTargetResults');if(results)results.innerHTML='';
};
window.searchAdTargetProfiles=async()=>{
  const q=String($('#adTargetSearch')?.value||'').trim();if(q.length<1)return;
  try{const data=await api(`/api/admin/users?limit=15&q=${encodeURIComponent(q)}`);const results=$('#adTargetResults');if(!results)return;const candidates=(data.users||[]).filter(u=>!u.is_admin&&!u.social_hidden);results.innerHTML=candidates.length?candidates.map(u=>`<button type="button" onclick="addAdTargetProfile(${Number(u.id)},'${safeEncode(u.username)}','${safeEncode(u.name||'')}')"><b>@${escapeHtml(u.username)}</b><span>${escapeHtml(u.name||'')}</span></button>`).join(''):'<small>No se encontraron perfiles sociales.</small>';}catch(e){toast(e.message,'error');}
};
async function uploadAdminAdImage(file){
  if(!file)return null;const fd=new FormData();fd.append('file',file);return api('/api/admin/ads/upload',{method:'POST',body:fd,timeout:MEDIA_UPLOAD_TIMEOUT_MS});
}
window.saveAdminAd=async()=>{
  const button=$('#saveAdButton');
  try{
    const id=Number(state.adEditorId||0),existing=id?currentAdminAd(id):null,type=$('#adCreativeType')?.value||'image';
    const name=String($('#adName')?.value||'').trim();
    const profileMode=$('#adProfileMode')?.value||'all';
    const desktopEnabled=Boolean($('#adDesktopEnabled')?.checked),mobileEnabled=Boolean($('#adMobileEnabled')?.checked);
    const placements=[];if($('#adPlaceRight')?.checked)placements.push('right_sidebar');if($('#adPlaceFeed')?.checked)placements.push('feed');if($('#adPlaceProfile')?.checked)placements.push('profile');
    const mainFile=$('#adImageFile')?.files?.[0]||null,mobileFile=$('#adMobileImageFile')?.files?.[0]||null;
    let imageUrl=String($('#adImageUrl')?.value||'').trim(),mobileImageUrl=String($('#adMobileImageUrl')?.value||'').trim();
    const googleCode=String($('#adGoogleCode')?.value||'').trim();
    if(name.length<2) throw new Error('Escribe un nombre interno para el anuncio.');
    if(!placements.length) throw new Error('Selecciona al menos una ubicación.');
    if(!desktopEnabled&&!mobileEnabled) throw new Error('Selecciona ordenador, móvil o ambos.');
    if(profileMode==='include'&&!(state.adEditorTargets||[]).length) throw new Error('Selecciona al menos un perfil para mostrar esta publicidad.');
    if(type==='image'&&desktopEnabled&&!mainFile&&!imageUrl) throw new Error('Selecciona una imagen principal desde el ordenador o mediante URL.');
    if(type==='image'&&mobileEnabled&&!mobileFile&&!mobileImageUrl&&!mainFile&&!imageUrl) throw new Error('Selecciona una imagen para móvil o una imagen principal reutilizable.');
    if(type==='google'&&!googleCode) throw new Error('Pega el código oficial de Google AdSense.');
    if(button){button.disabled=true;button.textContent='Guardando…';}

    let imageProvider=existing?.image_provider||'',imageProviderId=existing?.image_provider_id||'',mobileProvider=existing?.mobile_image_provider||'',mobileProviderId=existing?.mobile_image_provider_id||'';
    if(existing && imageUrl!==String(existing.image_url||'')){imageProvider='';imageProviderId='';}
    if(existing && mobileImageUrl!==String(existing.mobile_image_url||'')){mobileProvider='';mobileProviderId='';}
    if(mainFile){const uploaded=await uploadAdminAdImage(mainFile);imageUrl=uploaded.url;imageProvider=uploaded.provider;imageProviderId=uploaded.provider_id;}
    if(mobileFile){const uploaded=await uploadAdminAdImage(mobileFile);mobileImageUrl=uploaded.url;mobileProvider=uploaded.provider;mobileProviderId=uploaded.provider_id;}
    if(type==='google'){imageUrl='';mobileImageUrl='';imageProvider='';imageProviderId='';mobileProvider='';mobileProviderId='';}
    const starts=$('#adStartsAt')?.value||'',ends=$('#adEndsAt')?.value||'';
    if(starts&&ends&&new Date(ends)<=new Date(starts)) throw new Error('La fecha final debe ser posterior a la fecha de inicio.');
    const payload={name,active:Boolean($('#adActive')?.checked),creative_type:type,image_url:imageUrl,image_provider:imageProvider,image_provider_id:imageProviderId,mobile_image_url:mobileImageUrl,mobile_image_provider:mobileProvider,mobile_image_provider_id:mobileProviderId,link_url:String($('#adLinkUrl')?.value||'').trim(),google_code:googleCode,alt_text:String($('#adAltText')?.value||'').trim(),alt_text_en:String($('#adAltTextEn')?.value||'').trim(),display_title:String($('#adDisplayTitle')?.value||'').trim(),display_title_en:String($('#adDisplayTitleEn')?.value||'').trim(),display_text:String($('#adDisplayText')?.value||'').trim(),display_text_en:String($('#adDisplayTextEn')?.value||'').trim(),button_text:String($('#adButtonText')?.value||'').trim(),button_text_en:String($('#adButtonTextEn')?.value||'').trim(),placements,desktop_enabled:desktopEnabled,mobile_enabled:mobileEnabled,profile_mode:profileMode,priority:Number($('#adPriority')?.value||0),starts_at:starts?new Date(starts).toISOString():null,ends_at:ends?new Date(ends).toISOString():null,target_ids:(state.adEditorTargets||[]).map(t=>Number(t.id))};
    await api(id?`/api/admin/ads/${id}`:'/api/admin/ads',{method:id?'PATCH':'POST',body:JSON.stringify(payload),timeout:MEDIA_UPLOAD_TIMEOUT_MS});
    closeModal();toast(id?'Publicidad actualizada':'Publicidad creada');await renderAdmin();
  }catch(e){toast(e.message,'error');if(button){button.disabled=false;button.textContent=state.adEditorId?'Guardar cambios':'Crear anuncio';}}
};


function growthAttributionDetailsHtml(c={}) {
  const sources=Array.isArray(c.sources)?c.sources:[];
  const referrers=Array.isArray(c.referrers)?c.referrers:[];
  const devices=Array.isArray(c.devices)?c.devices:[];
  const recent=Array.isArray(c.recent_visits)?c.recent_visits:[];
  const sourceRows=sources.length?sources.map(r=>{
    const visits=Number(r.visits||0), registrations=Number(r.registrations||0);
    const conversion=visits?((registrations/visits)*100).toFixed(1):'0.0';
    return `<div class="growth-source-row"><span><b>${escapeHtml(r.source||'direct')}</b></span><span>${visits} visitas</span><span>${registrations} registros</span><span>${conversion}%</span></div>`;
  }).join(''):'<p class="muted">Aún no hay visitas atribuidas.</p>';
  const refRows=referrers.length?referrers.map(r=>`<span class="growth-origin-chip"><b>${escapeHtml(r.referrer_host||'directo')}</b> · ${Number(r.visits||0)}</span>`).join(''):'<span class="growth-origin-chip">Sin referrer externo detectado</span>';
  const deviceRows=devices.length?devices.map(r=>`<span class="growth-origin-chip"><b>${escapeHtml(r.device_type||'unknown')}</b> · ${Number(r.visits||0)}</span>`).join(''):'';
  const recentRows=recent.length?recent.map(r=>`<div class="growth-recent-visit"><span><b>${escapeHtml(r.source||'direct')}</b>${r.utm_content?` · ${escapeHtml(r.utm_content)}`:''}</span><span>${escapeHtml(r.device_type||'unknown')}${r.referrer_host?` · ${escapeHtml(r.referrer_host)}`:''}</span><small>${timeAgo(r.visited_at)}</small></div>`).join(''):'<p class="muted">Sin visitas recientes.</p>';
  return `<details class="growth-attribution-details"><summary>Ver procedencia de las visitas</summary><div class="growth-attribution-body"><div class="growth-attribution-block"><small>FUENTES Y CONVERSIÓN</small><div class="growth-source-table"><div class="growth-source-row head"><span>Fuente</span><span>Visitas</span><span>Registros</span><span>Conv.</span></div>${sourceRows}</div></div><div class="growth-attribution-block"><small>REFERRER DETECTADO</small><div class="growth-origin-chips">${refRows}</div></div>${deviceRows?`<div class="growth-attribution-block"><small>DISPOSITIVOS</small><div class="growth-origin-chips">${deviceRows}</div></div>`:''}<div class="growth-attribution-block"><small>ÚLTIMAS VISITAS</small><div class="growth-recent-list">${recentRows}</div></div></div></details>`;
}

async function renderAdmin() {
  if(!state.me?.is_admin){
    $('#main').innerHTML=`<div class="card empty"><h3>Acceso no disponible</h3><p>Este panel está reservado a administración.</p></div>`;
    return;
  }
  const [stats,reports,actions,security,launch,demo,readiness,communityLaunch,growth,adminUsers,advertising]=await Promise.all([
    api('/api/admin/stats'),
    api('/api/admin/reports?status=all'),
    api('/api/admin/actions'),
    api('/api/admin/security-events'),
    api('/api/admin/launch-dashboard'),
    api('/api/admin/demo/status'),
    api('/api/admin/launch-readiness'),
    api('/api/admin/community-launch'),
    api('/api/admin/growth-engine'),
    api('/api/admin/users?limit=50'),
    api('/api/admin/ads')
  ]);
  state.adminAdsData=advertising;
  $('#main').innerHTML=`${pageHeader('Administración','Moderación y estado general de Instant Admirers')}
    <div class="admin-stats">
      <div class="card admin-stat"><b>${stats.users}</b><span>Usuarios</span><small>+${stats.new_users_7d} esta semana</small></div>
      <div class="card admin-stat"><b>${stats.posts}</b><span>Publicaciones</span><small>+${stats.new_posts_7d} esta semana</small></div>
      <div class="card admin-stat"><b>${stats.open_reports}</b><span>Denuncias abiertas</span><small>${stats.reviewing_reports} en revisión</small></div>
      <div class="card admin-stat"><b>${stats.suspended_users}</b><span>Suspendidos</span><small>${stats.closed_reports} denuncias cerradas</small></div>
    </div>
    <section class="card admin-section admin-users-section">
      <div class="section-row"><div><h3>Gestión de usuarios</h3><p>Busca, suspende, reactiva o elimina cuentas reales. Las cuentas de administración están protegidas.</p></div><span id="adminUsersCount">${Number(adminUsers.total||0)}</span></div>
      <div class="admin-user-search"><input id="adminUserSearch" maxlength="120" placeholder="Buscar por nick, nombre o email" onkeydown="if(event.key==='Enter') adminSearchUsers()"><button class="btn ghost compact" onclick="adminSearchUsers()">Buscar</button><button class="btn ghost compact" onclick="adminResetUserSearch()">Todos</button></div>
      <div id="adminUserList" class="admin-user-list">${adminUsers.users.length?adminUsers.users.map(adminUserHtml).join(''):'<div class="empty compact-empty">No hay usuarios.</div>'}</div>
      <p class="admin-users-note">Eliminar una cuenta es definitivo: se borran sus publicaciones, mensajes, relaciones, referidos y multimedia asociada mediante las reglas de la base de datos. Se conserva una entrada de auditoría de la acción administrativa.</p>
    </section>
    ${advertisingAdminHtml(advertising)}
    <section class="card admin-section launch-dashboard">
      <div class="section-row"><div><h3>Lanzamiento controlado</h3><p>Altas, activación, actividad y errores reales.</p></div><span class="launch-mode-badge">${escapeHtml(launch.settings.registration_mode)}</span></div>
      <div class="launch-control-row"><label>Registro<select id="launchRegistrationMode"><option value="open" ${launch.settings.registration_mode==='open'?'selected':''}>Abierto</option><option value="invite_only" ${launch.settings.registration_mode==='invite_only'?'selected':''}>Solo invitación</option><option value="paused" ${launch.settings.registration_mode==='paused'?'selected':''}>Pausado</option></select></label><button class="btn primary compact" onclick="saveLaunchRegistrationMode()">Aplicar</button></div>
      <div class="launch-metrics">
        <div><b>${launch.metrics.active_24h}</b><span>Activos 24 h</span><small>${launch.metrics.active_7d} en 7 días</small></div>
        <div><b>${launch.metrics.users_new_7d}</b><span>Altas 7 días</span><small>${launch.metrics.users_verified}/${launch.metrics.users_total} verificados</small></div>
        <div><b>${launch.metrics.users_with_post}</b><span>Con 1er post</span><small>${launch.metrics.users_with_avatar} con foto</small></div>
        <div><b>${launch.metrics.posts_7d}</b><span>Posts 7 días</span><small>${launch.metrics.posts_24h} hoy</small></div>
        <div><b>${launch.metrics.referrals_7d}</b><span>Referidos 7 días</span><small>${launch.metrics.referrals_qualified} cualificados</small></div>
        <div class="${Number(launch.metrics.errors_24h)>0?'has-errors':''}"><b>${launch.metrics.errors_24h}</b><span>Errores 24 h</span><small>${launch.metrics.reports_pending} denuncias pendientes</small></div>
      </div>
      <div class="launch-secondary"><span>${launch.metrics.stories_active} Stories activas</span><span>${launch.metrics.reels_total} vídeos/Reels</span><span>${launch.metrics.messages_24h} mensajes hoy</span></div>
      <div class="launch-errors"><div class="section-row"><h4>Últimos errores técnicos</h4><span>${launch.recent_errors.length}</span></div>${launch.recent_errors.length?launch.recent_errors.slice(0,8).map(e=>`<div class="launch-error"><b>${escapeHtml(e.event_type)}</b><span>${e.username?'@'+escapeHtml(e.username):'sin usuario'} · ${escapeHtml(e.path || '/')}</span><small>${escapeHtml(e.metadata?.message || '')} · ${timeAgo(e.created_at)}</small></div>`).join(''):'<p class="muted">Sin errores registrados.</p>'}</div>
    </section>
    <section class="card admin-section launch-center">
      <div class="section-row"><div><h3>Centro de lanzamiento</h3><p>Checklist técnico, primera cohorte y configuración pública.</p></div><span class="launch-readiness-badge ${readiness.technical_ready?'ready':'pending'}">${readiness.score}%</span></div>
      <div class="launch-readiness-summary ${readiness.technical_ready?'ready':'pending'}"><div><b>${readiness.technical_ready?'Base técnica preparada':'Aún hay bloqueos antes de abrir'}</b><span>${readiness.technical_ready?'Puedes avanzar a una cohorte real cuando quieras.':'Revisa los puntos marcados como obligatorios.'}</span></div><strong>${readiness.score}%</strong></div>
      <div class="launch-check-grid">${readiness.checks.map(c=>`<div class="launch-check ${c.ok?'ok':'pending'} ${c.level==='blocker'?'blocker':''}"><i>${c.ok?'✓':'!'}</i><span><b>${escapeHtml(c.label)}</b><small>${escapeHtml(c.detail)}</small></span><em>${c.level==='blocker'?'Obligatorio':'Recomendado'}</em></div>`).join('')}</div>
      <div class="launch-cohort-card"><div><small>PRIMERA COHORTE</small><b>${readiness.target.current} / ${readiness.target.value}</b><span>usuarios reales</span></div><div class="launch-cohort-progress"><i style="width:${Math.min(100,Math.round((Number(readiness.target.current||0)/Math.max(1,Number(readiness.target.value||100)))*100))}%"></i></div></div>
      <div class="launch-funnel"><span><b>${readiness.funnel.users_total}</b> registrados</span><span><b>${readiness.funnel.users_verified}</b> verificados</span><span><b>${readiness.funnel.users_with_avatar}</b> con foto</span><span><b>${readiness.funnel.users_profile_complete}</b> perfil completo</span><span><b>${readiness.funnel.users_with_post}</b> publicaron</span><span><b>${readiness.funnel.users_following}</b> siguen a alguien</span><span><b>${readiness.funnel.active_7d}</b> activos 7 d</span></div>
      <div class="launch-settings-grid">
        <label>Fase<select id="launchPhase"><option value="prelaunch" ${readiness.settings.launch_phase==='prelaunch'?'selected':''}>Prelanzamiento</option><option value="pilot" ${readiness.settings.launch_phase==='pilot'?'selected':''}>Cohorte inicial</option><option value="public" ${readiness.settings.launch_phase==='public'?'selected':''}>Público</option></select></label>
        <label>Objetivo primera cohorte<input id="launchCohortTarget" type="number" min="10" max="100000" value="${Number(readiness.settings.cohort_target||100)}"></label>
        <label class="launch-banner-toggle"><span>Mostrar aviso de fase</span><input id="launchBannerEnabled" type="checkbox" ${readiness.settings.banner_enabled?'checked':''}></label>
        <label class="launch-banner-text">Texto del aviso<input id="launchBannerText" maxlength="240" value="${escapeAttr(readiness.settings.banner_text || '')}" placeholder="Estamos abriendo Instant Admirers por fases."></label>
      </div>
      <div class="launch-center-actions"><button class="btn primary compact" onclick="saveLaunchPreparation()">Guardar preparación</button>${readiness.invite_url?`<button class="btn ghost compact" onclick="copyLaunchInvite('${escapeAttr(readiness.invite_url)}')">Copiar invitación inicial</button>`:''}${demo.active?`<button class="btn danger compact" onclick="clearDemoLab()">Eliminar datos TEST</button>`:''}</div>
    </section>
    <section class="card admin-section community-launch-admin">
      <div class="section-row"><div><h3>Comunidad inicial</h3><p>Warm-start para que los primeros usuarios encuentren gente y motivos para publicar sin contenido ficticio.</p></div><span class="community-ready-badge">V1.8</span></div>
      <div class="community-admin-metrics"><span><b>${communityLaunch.metrics.members_total||0}</b> miembros reales</span><span><b>${communityLaunch.metrics.members_7d||0}</b> altas 7 d</span><span><b>${communityLaunch.metrics.activated_members||0}</b> activados</span><span><b>${communityLaunch.metrics.posts_7d||0}</b> posts 7 d</span><span><b>${communityLaunch.metrics.active_7d||0}</b> activos 7 d</span></div>
      <div class="community-admin-settings">
        <label><span><b>Recién llegados</b><small>Destaca nuevos miembros verificados en Descubrir.</small></span><input id="communityNewcomersEnabled" type="checkbox" ${communityLaunch.settings.newcomer_spotlight_enabled?'checked':''}></label>
        <label class="community-limit"><span><b>Miembros fundadores</b><small>Primeras cuentas reales que reciben el distintivo de cohorte.</small></span><input id="communityFoundingLimit" type="number" min="10" max="10000" value="${Number(communityLaunch.settings.founding_member_limit||100)}"></label>
      </div>
      <div class="launch-center-actions"><button class="btn primary compact" onclick="saveCommunityLaunchSettings()">Guardar comunidad inicial</button>${readiness.invite_url?`<button class="btn ghost compact" onclick="copyLaunchInvite('${escapeAttr(readiness.invite_url)}')">Copiar invitación de cohorte</button>`:''}</div>
    </section>
    <section class="card admin-section growth-engine-admin">
      <div class="section-row"><div><h3>Growth Engine</h3><p>Campañas medibles para convertir audiencia externa en registros y saber exactamente de dónde llegan las visitas.</p></div><span class="growth-version-badge">V1.12.14</span></div>
      <div class="growth-create-grid growth-create-grid-v124">
        <label>Campaña<input id="growthCampaignName" maxlength="120" placeholder="Página 16K"></label>
        <label>Canal<select id="growthCampaignChannel"><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="whatsapp">WhatsApp</option><option value="google">Google</option><option value="email">Email</option><option value="other">Otro</option></select></label>
        <label>Perfil destino<input id="growthCampaignTarget" maxlength="30" value="${escapeAttr(state.me?.username || '')}" placeholder="usuario"></label>
        <label>Pieza / origen <small>(opcional)</small><input id="growthCampaignSourceTag" maxlength="120" placeholder="story-01, post-16k, bio..."></label>
        <label class="growth-message-create">Mensaje de acceso <small>(opcional · 220 caracteres)</small><textarea id="growthCampaignAccessMessage" maxlength="220" rows="3" placeholder="Este texto aparecerá en Entrar y Crear cuenta cuando la visita llegue desde esta campaña."></textarea></label>
        <label class="growth-public-preview-toggle"><input id="growthCampaignPublicTeaser" type="checkbox"><span><b>Vista pública del perfil</b><small>Al tocar la cabecera o foto, muestra el perfil y texto de posts. Fotos/vídeos quedan bloqueados hasta crear cuenta.</small></span></label>
        <button class="btn primary compact growth-create-button" onclick="createGrowthCampaign()">Crear campaña</button>
      </div>
      <p class="growth-attribution-note">El enlace generado añade UTM automáticamente. Instant Admirers registra la fuente, el referrer disponible y el dispositivo sin guardar la IP del visitante.</p>
      ${growth.profiles?.length?`<div class="growth-profile-funnels"><small>EMBUDO DE PERFILES EXCLUSIVOS</small>${growth.profiles.map(p=>`<div class="growth-profile-row"><div><b>@${escapeHtml(p.username)}</b><span>Reto: ${Number(p.required||0)} invitaciones${p.require_post?' + 1 post':''}</span></div><div><span><b>${Number(p.challenge_starts||0)}</b> iniciados</span><span><b>${Number(p.share_actions||0)}</b> compartidos</span><span><b>${Number(p.referred_signups||0)}</b> altas</span><span><b>${Number(p.completed||0)}</b> desbloqueos</span></div></div>`).join('')}</div>`:`<div class="growth-empty"><b>Aún no hay perfiles con acceso especial activo</b><span>Activa “Acceso a mi perfil” para usar el embudo viral.</span></div>`}
      <div class="growth-campaign-list">${growth.campaigns?.length?growth.campaigns.map(c=>`<article class="growth-campaign-card ${c.active?'':'inactive'}"><div class="growth-campaign-head"><div><b>${escapeHtml(c.name)}</b><span>${escapeHtml(c.channel)} · @${escapeHtml(c.target_username)}${c.source_tag?` · ${escapeHtml(c.source_tag)}`:''}</span></div><em>${c.active?'ACTIVA':'PAUSADA'}</em></div>${!c.target_gate_enabled?`<div class="growth-warning">⚠ El perfil destino no tiene activo el acceso especial.</div>`:''}<div class="growth-funnel"><span><b>${Number(c.metrics?.visits||0)}</b> visitas</span><span><b>${Number(c.metrics?.registrations||0)}</b> registros</span>${c.public_teaser_enabled?`<span><b>${Number(c.metrics?.teaser_views||0)}</b> vistas perfil</span><span><b>${Number(c.metrics?.teaser_signup_clicks||0)}</b> clics alta</span>`:''}<span><b>${Number(c.metrics?.challenge_starts||0)}</b> retos</span><span><b>${Number(c.metrics?.share_actions||0)}</b> comparticiones</span><span><b>${Number(c.metrics?.referred_signups||0)}</b> referidos</span><span><b>${Number(c.metrics?.completed||0)}</b> desbloqueos</span></div>${c.public_teaser_enabled?'<div class="growth-public-preview-chip">👁 Vista pública activa · multimedia bloqueada</div>':''}<div class="growth-campaign-message-preview"><small>MENSAJE DE ACCESO</small><p>${c.access_message?`“${escapeHtml(c.access_message)}”`:'Usará el mensaje general del perfil.'}</p></div><div class="growth-link-row"><input readonly value="${escapeAttr(c.link||'')}"><button class="btn ghost compact" onclick="copyGrowthLink('${escapeAttr(c.link||'')}')">Copiar</button><button class="btn ${c.active?'danger':'primary'} compact" onclick="toggleGrowthCampaign(${c.id},${c.active?'false':'true'})">${c.active?'Pausar':'Activar'}</button></div>${growthAttributionDetailsHtml(c)}<details class="growth-campaign-edit"><summary>Editar mensaje y origen</summary><div class="growth-campaign-edit-grid"><label>Mensaje de acceso<textarea id="growthAccessMessage-${c.id}" maxlength="220" rows="3" placeholder="Vacío = usar mensaje general del perfil">${escapeHtml(c.access_message||'')}</textarea></label><label>Pieza / origen<input id="growthSourceTag-${c.id}" maxlength="120" value="${escapeAttr(c.source_tag||'')}" placeholder="story-01, bio, reel-03..."></label><label class="growth-public-preview-toggle compact"><input id="growthPublicTeaser-${c.id}" type="checkbox" ${c.public_teaser_enabled?'checked':''}><span><b>Vista pública del perfil</b><small>Permite tocar foto/cabecera antes del registro.</small></span></label><button class="btn primary compact" onclick="saveGrowthCampaignDetails(${c.id})">Guardar cambios</button></div></details></article>`).join(''):`<div class="growth-empty"><b>Crea tu primera campaña</b><span>Por ejemplo: “Página 16K” con canal Facebook y @rubi como perfil destino.</span></div>`}</div>
    </section>
    <section class="card admin-section demo-lab">
      <div class="section-row"><div><h3>Laboratorio de pruebas</h3><p>Datos sintéticos, claramente marcados y eliminables. No son usuarios reales.</p></div><span class="demo-lab-badge ${demo.active?'active':''}">${demo.active?'ACTIVO':'VACÍO'}</span></div>
      ${demo.active ? `
        <div class="demo-lab-metrics"><span><b>${demo.profiles}</b> perfiles TEST</span><span><b>${demo.posts}</b> posts</span><span><b>${demo.reels}</b> Reels</span><span><b>${demo.stories}</b> Stories</span><span><b>${demo.comments}</b> comentarios</span><span><b>${demo.likes}</b> likes</span></div>
        <p class="demo-lab-note">Tu cuenta de administrador sigue automáticamente varias cuentas TEST para que puedas comprobar Inicio, scroll infinito y recomendaciones. Las métricas de lanzamiento de arriba excluyen estos datos.</p>
        <div class="demo-lab-actions"><button class="btn ghost compact" onclick="go('feed')">Probar Inicio</button><button class="btn ghost compact" onclick="go('discover')">Probar Descubrir</button><button class="btn ghost compact" onclick="go('reels')">Probar Reels</button><button class="btn danger compact" onclick="clearDemoLab()">Eliminar datos de prueba</button></div>
      ` : `
        <div class="demo-lab-empty"><b>Generar entorno temporal</b><p>Crea 24 perfiles TEST, 144 publicaciones, Reels, Stories, comentarios, likes y algunos mensajes de prueba. Todo se elimina después con un solo botón.</p><button class="btn primary" onclick="generateDemoLab()">Generar datos de prueba</button></div>
      `}
    </section>
    <section class="card admin-section">
      <div class="section-row"><h3>Denuncias</h3><span>${reports.length}</span></div>
      <div class="admin-report-list">${reports.length?reports.map(adminReportHtml).join(''):'<div class="empty compact-empty">No hay denuncias.</div>'}</div>
    </section>
    <section class="card admin-section">
      <div class="section-row"><h3>Últimas acciones</h3><span>${actions.length}</span></div>
      <div class="admin-action-list">${actions.length?actions.map(a=>`<div class="admin-action"><b>${escapeHtml(a.action)}</b><span>${a.target_username?'@'+escapeHtml(a.target_username):''}${a.report_id?` · denuncia #${a.report_id}`:''}</span><small>${a.admin_username?'@'+escapeHtml(a.admin_username)+' · ':''}${timeAgo(a.created_at)}</small></div>`).join(''):'<p class="muted">Todavía no hay acciones de moderación.</p>'}</div>
    </section>
    <section class="card admin-section">
      <div class="section-row"><h3>Seguridad</h3><span>${security.length}</span></div>
      <div class="admin-action-list">${security.length?security.slice(0,40).map(e=>`<div class="admin-action"><b>${escapeHtml(e.event_type)}</b><span>${e.username?'@'+escapeHtml(e.username):'sin usuario asociado'}</span><small>${timeAgo(e.created_at)}</small></div>`).join(''):'<p class="muted">Todavía no hay eventos de seguridad.</p>'}</div>
    </section>`;
}



window.copyGrowthLink=async(url)=>{try{await navigator.clipboard.writeText(url);toast('Enlace de campaña copiado');}catch(_){prompt('Copia este enlace:',url);}};
window.createGrowthCampaign=async()=>{
  const payload={
    name:String($('#growthCampaignName')?.value||'').trim(),
    channel:String($('#growthCampaignChannel')?.value||'facebook'),
    target_username:String($('#growthCampaignTarget')?.value||'').trim().replace(/^@/,''),
    source_tag:String($('#growthCampaignSourceTag')?.value||'').trim().slice(0,120),
    access_message:String($('#growthCampaignAccessMessage')?.value||'').trim().slice(0,220),
    public_teaser_enabled:Boolean($('#growthCampaignPublicTeaser')?.checked)
  };
  try{const created=await api('/api/admin/growth-campaigns',{method:'POST',body:JSON.stringify(payload)});toast('Campaña creada');if(created.link) await window.copyGrowthLink(created.link);await renderAdmin();}catch(e){toast(e.message,'error');}
};
window.saveGrowthCampaignDetails=async(id)=>{
  const payload={access_message:String($(`#growthAccessMessage-${id}`)?.value||'').trim().slice(0,220),source_tag:String($(`#growthSourceTag-${id}`)?.value||'').trim().slice(0,120),public_teaser_enabled:Boolean($(`#growthPublicTeaser-${id}`)?.checked)};
  try{await api(`/api/admin/growth-campaigns/${id}`,{method:'PATCH',body:JSON.stringify(payload)});toast('Campaña actualizada');await renderAdmin();}catch(e){toast(e.message,'error');}
};
window.toggleGrowthCampaign=async(id,active)=>{try{await api(`/api/admin/growth-campaigns/${id}`,{method:'PATCH',body:JSON.stringify({active:Boolean(active)})});toast(active?'Campaña activada':'Campaña pausada');await renderAdmin();}catch(e){toast(e.message,'error');}};

window.saveCommunityLaunchSettings=async()=>{
  const payload={
    newcomer_spotlight_enabled:Boolean($('#communityNewcomersEnabled')?.checked),
    founding_member_limit:Number($('#communityFoundingLimit')?.value||100)
  };
  try{
    await api('/api/admin/community-launch',{method:'PATCH',body:JSON.stringify(payload)});
    state.community=null;
    toast('Comunidad inicial actualizada');
    await renderAdmin();
  }catch(e){toast(e.message,'error');}
};

window.generateDemoLab = async () => {
  if(!confirm('Se crearán 24 perfiles TEST y contenido sintético para probar la plataforma. No son usuarios reales. ¿Continuar?')) return;
  try{
    toast('Generando entorno de prueba…');
    const result=await api('/api/admin/demo/generate',{method:'POST',body:'{}',timeout:120000});
    toast(`Entorno creado: ${result.profiles} perfiles y ${result.posts} posts`);
    await renderAdmin();
  }catch(e){toast(e.message,'error');}
};

window.clearDemoLab = async () => {
  if(!confirm('¿Eliminar TODOS los perfiles y contenidos TEST? Los usuarios reales y sus publicaciones no se tocarán.')) return;
  try{
    const result=await api('/api/admin/demo',{method:'DELETE',timeout:120000});
    toast(`Datos de prueba eliminados (${result.deleted_profiles} perfiles)`);
    await renderAdmin();
  }catch(e){toast(e.message,'error');}
};

window.saveLaunchRegistrationMode = async () => {
  const mode=$('#launchRegistrationMode')?.value || 'open';
  const labels={open:'registro abierto',invite_only:'solo invitación',paused:'registro pausado'};
  if(!confirm(`Cambiar el lanzamiento a: ${labels[mode] || mode}?`)) return;
  try{await api('/api/admin/launch/settings',{method:'PATCH',body:JSON.stringify({registration_mode:mode})});toast('Modo de registro actualizado');await renderAdmin();}
  catch(e){toast(e.message,'error');}
};


window.saveLaunchPreparation = async () => {
  const payload={
    registration_mode:$('#launchRegistrationMode')?.value || 'open',
    launch_phase:$('#launchPhase')?.value || 'prelaunch',
    cohort_target:Number($('#launchCohortTarget')?.value || 100),
    banner_enabled:Boolean($('#launchBannerEnabled')?.checked),
    banner_text:String($('#launchBannerText')?.value || '').trim()
  };
  if(payload.launch_phase==='public' && !confirm('Vas a marcar la fase como PÚBLICA. Esto no cambia por sí solo el modo de registro. ¿Continuar?')) return;
  try{
    const updated=await api('/api/admin/launch/settings',{method:'PATCH',body:JSON.stringify(payload)});
    state.launchStatus={...state.launchStatus,...updated};
    toast('Preparación de lanzamiento guardada');
    await renderAdmin();
  }catch(e){toast(e.message,'error');}
};

window.copyLaunchInvite = async (url) => {
  try{await navigator.clipboard.writeText(url);toast('Invitación inicial copiada');}
  catch(_){prompt('Copia este enlace de invitación:',url);}
};

function adminUserHtml(u){
  const status=String(u.account_status||'active');
  const protectedAccount=Boolean(u.is_admin);
  const verified=Boolean(u.email_verified_at);
  const lastSeen=u.last_seen_at?timeAgo(u.last_seen_at):'sin actividad registrada';
  return `<article class="admin-user-row" data-admin-user="${Number(u.id)}">
    <div class="admin-user-main">
      <div class="admin-user-avatar">${u.avatar?`<img src="${escapeAttr(u.avatar)}" alt="">`:'◎'}</div>
      <div><b>@${escapeHtml(u.username)}</b><span>${escapeHtml(u.name||'')}</span><small>${escapeHtml(u.email||'')}</small></div>
    </div>
    <div class="admin-user-meta">
      <span class="admin-user-status ${escapeAttr(status)}">${status==='suspended'?'Suspendido':'Activo'}</span>
      <span>${verified?'✓ Email verificado':'Email pendiente'}</span>
      <span>${Number(u.posts_count||0)} posts · ${Number(u.referrals_count||0)} referidos</span>
      <small>Alta ${timeAgo(u.created_at)} · ${lastSeen}</small>
    </div>
    <div class="admin-user-actions">
      ${protectedAccount?'<span class="admin-protected-account">Cuenta de administración</span>':`<button class="btn ${status==='suspended'?'primary':'ghost'} compact" onclick="adminToggleUser(${Number(u.id)},'${status==='suspended'?'active':'suspended'}',0)">${status==='suspended'?'Reactivar':'Suspender'}</button><button class="btn danger compact" onclick="adminDeleteUser(${Number(u.id)},'${escapeAttr(u.username)}')">Eliminar</button>`}
    </div>
  </article>`;
}

window.adminSearchUsers=async()=>{
  const q=String($('#adminUserSearch')?.value||'').trim();
  try{
    const result=await api(`/api/admin/users?limit=50&q=${encodeURIComponent(q)}`);
    const list=$('#adminUserList');
    const count=$('#adminUsersCount');
    if(count) count.textContent=String(Number(result.total||0));
    if(list) list.innerHTML=result.users.length?result.users.map(adminUserHtml).join(''):'<div class="empty compact-empty">No se encontraron usuarios.</div>';
  }catch(e){toast(e.message,'error');}
};

window.adminResetUserSearch=async()=>{
  if($('#adminUserSearch')) $('#adminUserSearch').value='';
  await adminSearchUsers();
};

window.adminDeleteUser=async(userId,username)=>{
  const typed=prompt(`ELIMINACIÓN DEFINITIVA\n\nSe borrará @${username} y todo su contenido asociado.\n\nEscribe exactamente ${username} para confirmar:`,'');
  if(typed===null) return;
  if(String(typed).trim().replace(/^@/,'').toLowerCase()!==String(username).toLowerCase()){
    toast('Confirmación incorrecta. No se ha eliminado la cuenta.','error');
    return;
  }
  const reason=prompt('Motivo interno de la eliminación (opcional):','') ?? '';
  if(!confirm(`Última confirmación: ¿eliminar definitivamente la cuenta @${username}? Esta acción no se puede deshacer.`)) return;
  try{
    const result=await api(`/api/admin/users/${Number(userId)}`,{method:'DELETE',body:JSON.stringify({confirmation:typed,reason}),timeout:120000});
    const suffix=Number(result.media_cleanup_failures||0)>0?' · Hay multimedia remota pendiente de limpieza.':'';
    toast(`Cuenta @${username} eliminada${suffix}`);
    await renderAdmin();
  }catch(e){toast(e.message,'error');}
};

function adminReportHtml(r){
  const target=r.target_username?`@${escapeHtml(r.target_username)}`:'contenido eliminado';
  const post=r.post_id?`<div class="admin-report-post"><b>Publicación #${r.post_id}</b><p>${escapeHtml(r.post_text || '').slice(0,220)}</p></div>`:'';
  return `<article class="admin-report status-${escapeAttr(r.status)}">
    <div class="admin-report-head"><div><b>#${r.id} · ${escapeHtml(reportReasonLabel(r.reason))}</b><small>Denuncia de @${escapeHtml(r.reporter_username)} · ${timeAgo(r.created_at)}</small></div><span>${escapeHtml(r.status)}</span></div>
    <p><b>Objetivo:</b> ${target}</p>
    ${r.details?`<p>${escapeHtml(r.details)}</p>`:''}
    ${post}
    ${r.admin_note?`<div class="admin-note">Nota: ${escapeHtml(r.admin_note)}</div>`:''}
    <div class="admin-report-actions">
      ${r.status!=='reviewing'?`<button class="btn ghost compact" onclick="adminSetReport(${r.id},'reviewing')">En revisión</button>`:''}
      ${r.status!=='closed'?`<button class="btn primary compact" onclick="adminSetReport(${r.id},'closed')">Cerrar</button>`:''}
      ${r.status!=='open'?`<button class="btn ghost compact" onclick="adminSetReport(${r.id},'open')">Reabrir</button>`:''}
      ${r.post_id?`<button class="btn danger compact" onclick="adminRemovePost(${r.post_id},${r.id})">Eliminar post</button>`:''}
      ${r.target_user_id?`<button class="btn ${r.target_status==='suspended'?'ghost':'danger'} compact" onclick="adminToggleUser(${r.target_user_id},'${r.target_status==='suspended'?'active':'suspended'}',${r.id})">${r.target_status==='suspended'?'Reactivar usuario':'Suspender usuario'}</button>`:''}
    </div>
  </article>`;
}

window.adminSetReport = async (id,status) => {
  const note=prompt('Nota de moderación (opcional):','') ?? '';
  try{await api(`/api/admin/reports/${id}`,{method:'PATCH',body:JSON.stringify({status,note})});toast('Denuncia actualizada');await renderAdmin();}catch(e){toast(e.message,'error');}
};

window.adminRemovePost = async (postId,reportId) => {
  if(!confirm('¿Eliminar esta publicación?')) return;
  const note=prompt('Motivo interno (opcional):','') ?? '';
  try{
    await api(`/api/admin/posts/${postId}`,{method:'DELETE',body:JSON.stringify({note})});
    if(reportId) await api(`/api/admin/reports/${reportId}`,{method:'PATCH',body:JSON.stringify({status:'closed',note:note||'Publicación eliminada por moderación'})});
    toast('Publicación eliminada');await renderAdmin();
  }catch(e){toast(e.message,'error');}
};

window.adminToggleUser = async (userId,status,reportId) => {
  const label=status==='suspended'?'suspender':'reactivar';
  if(!confirm(`¿Quieres ${label} esta cuenta?`)) return;
  const note=prompt('Motivo interno (opcional):','') ?? '';
  try{
    await api(`/api/admin/users/${userId}/status`,{method:'POST',body:JSON.stringify({status,note})});
    if(reportId && status==='suspended') await api(`/api/admin/reports/${reportId}`,{method:'PATCH',body:JSON.stringify({status:'closed',note:note||'Cuenta suspendida por moderación'})});
    toast(status==='suspended'?'Cuenta suspendida':'Cuenta reactivada');await renderAdmin();
  }catch(e){toast(e.message,'error');}
};

async function init(options = {}) {
  trackGrowthCampaignLanding();
  if (await handleAuthLink()) return;
  if (!state.token) {
    const publicProfile=profileUsernameFromPath(location.pathname);
    if(publicProfile && publicTeaserRequested() && currentGrowthCampaign()) await renderPublicTeaserProfile(publicProfile);
    else authScreen();
    updatePwaInstallUi();
    return;
  }
  if (!navigator.onLine) { renderOfflineLaunch(); updatePwaInstallUi(); return; }
  try {
    state.me = await api('/api/me');
    const currentLanguage=window.IAI18N?.getLanguage?.() || 'es';
    const manualLanguage=Boolean(window.IAI18N?.hasManualChoice?.());
    if(manualLanguage){
      if(state.me?.preferred_language!==currentLanguage) api('/api/me/language',{method:'PATCH',body:JSON.stringify({language:currentLanguage})}).then(()=>{ if(state.me) state.me.preferred_language=currentLanguage; }).catch(()=>{});
    } else if(state.me?.preferred_language) window.IAI18N?.syncFromAccount?.(state.me.preferred_language);
    else api('/api/me/language',{method:'PATCH',body:JSON.stringify({language:currentLanguage})}).then(()=>{ if(state.me) state.me.preferred_language=currentLanguage; }).catch(()=>{});
    await loadLaunchStatus();
    trackSessionActivity();
    connectRealtime();
    const pendingProfile = String(options.preferredProfile || pendingProfileDestination()).trim();
    if (pendingProfile) {
      rememberPendingProfile(pendingProfile);
      state.view='profile';
      state.profile=pendingProfile;
    }
    layout();
    if (pendingProfile) {
      try {
        const canonical = await resolveDirectProfileUsername(pendingProfile);
        const target = canonical || pendingProfile;
        state.view = 'profile';
        state.profile = target;
        setProfileBrowserUrl(target, { replace:true });
        await renderProfile(target);
        clearPendingProfileDestination();
      } catch (profileError) {
        console.error('No se pudo abrir el perfil pendiente', profileError);
        // Importante: NO enviar a Inicio. Conservamos el destino para poder reintentar y diagnosticar.
        rememberPendingProfile(pendingProfile);
        setProfileBrowserUrl(pendingProfile, { replace:true });
        renderPendingProfileError(pendingProfile, profileError);
      }
    } else {
      await renderView();
    }
    if (!state.me?.terms_accepted_at || state.me?.terms_version !== '2026-09-20' || !state.me?.age_confirmed_at) {
      setTimeout(openLegalAcceptance, 120);
    } else if (state.me && state.me.onboarding_completed === false) {
      setTimeout(openOnboarding, 150);
    }
  } catch (error) {
    if (!navigator.onLine || /conexión|conectar/i.test(String(error?.message || ''))) {
      renderOfflineLaunch();
      showNetworkState(false);
      return;
    }
    logout();
  }
}

window.addEventListener('popstate', async () => {
  if (!state.token) {
    const username = profileUsernameFromPath(location.pathname);
    if (username) rememberPendingProfile(username);
    if(username && publicTeaserRequested() && currentGrowthCampaign()) await renderPublicTeaserProfile(username);
    else authScreen();
    return;
  }
  const username = profileUsernameFromPath(location.pathname);
  try {
    if (username) {
      state.view = 'profile'; state.profile = username; layout(); await renderProfile(username);
    } else {
      await go('feed', { history:false });
    }
  } catch (e) { toast(e.message, 'error'); }
});

window.addEventListener('offline', () => showNetworkState(false));
window.addEventListener('online', () => showNetworkState(true));
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (state.storyViewer) return closeStoryViewer();
  if ($('#modal-root')?.children.length) closeModal();
});
if (!navigator.onLine) setTimeout(() => showNetworkState(false), 200);

registerInstantAdmirersPwa();
init();


// V1.12.3: bloqueo reforzado de descarga casual sobre multimedia protegida.
const isProtectedMediaTarget = target => Boolean(target?.closest?.('[data-protected-media="1"],[data-protected-media-frame="1"]'));

document.addEventListener('contextmenu', event => {
  if (!isProtectedMediaTarget(event.target)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

document.addEventListener('dragstart', event => {
  if (!isProtectedMediaTarget(event.target)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

document.addEventListener('mousedown', event => {
  if (event.button !== 2 || !isProtectedMediaTarget(event.target)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

document.addEventListener('auxclick', event => {
  if (!isProtectedMediaTarget(event.target)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

document.addEventListener('selectstart', event => {
  if (!isProtectedMediaTarget(event.target)) return;
  event.preventDefault();
}, true);
