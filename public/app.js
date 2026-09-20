const state = {
  token: localStorage.getItem('token') || '',
  me: null,
  view: 'feed',
  feedMode: localStorage.getItem('feedMode') || 'following',
  profile: null,
  search: '',
  busy: false,
  activeConversation: null,
  storyViewer: null,
  messagePoll: null,
  socket: null,
  replyTo: null,
  typingTimer: null,
  messageSending: false,
  requestCount: 0,
  sessionExpiring: false
};

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

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

function safeEncode(value = '') { return encodeURIComponent(String(value)).replace(/'/g, '%27'); }

function initials(u = {}) {
  return String(u.name || u.username || '?').trim().slice(0, 1).toUpperCase();
}

function avatar(u = {}, size = '') {
  const klass = size ? ` avatar ${size}` : 'avatar';
  return `<div class="${klass}">${u.avatar ? `<img src="${escapeAttr(u.avatar)}" alt="">` : `<span>${escapeHtml(initials(u))}</span>`}</div>`;
}

function timeAgo(date) {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 60) return 'ahora';
  const min = Math.floor(sec / 60); if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d} d`;
  return new Intl.DateTimeFormat('es-ES', { day:'2-digit', month:'short' }).format(new Date(date));
}


function presenceText(u = {}) {
  if (u.online) return 'En línea';
  return u.last_seen_at ? `Última vez ${timeAgo(u.last_seen_at)}` : 'Desconectado';
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

function closeModal() { $('#modal-root').innerHTML = ''; }
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

function authScreen() {
  $('#app').innerHTML = `
    <div class="auth-page">
      <section class="auth-hero">
        <div class="brand-logo-wrap">${brandLockup('big')}</div>
        <h1>Encuentra tu gente. Comparte tu mundo.</h1>
        <p><span class="auth-copy-desktop">Conecta con personas, comparte fotos y vídeos, descubre nuevas historias y crea una comunidad a tu manera.</span><span class="auth-copy-mobile">Conecta con personas y comparte lo que te importa.</span></p>
        <div class="hero-pills"><span>📸 Fotos</span><span>🎬 Vídeos</span><span>💬 Conversaciones</span><span>✨ Comunidad</span></div>
      </section>
      <section class="auth-card-wrap">
        <section class="auth-card card">
          <div class="tabs">
            <button id="loginTab" class="tab active" onclick="showAuth('login')">Entrar</button>
            <button id="registerTab" class="tab" onclick="showAuth('register')">Crear cuenta</button>
          </div>
          <div id="authbox"></div>
        </section>
        ${legalLinks()}
      </section>
    </div>`;
  showAuth('login');
  const authNotice=sessionStorage.getItem('authNotice'); if(authNotice){sessionStorage.removeItem('authNotice');setTimeout(()=>toast(authNotice),80);}
}

window.showAuth = (mode) => {
  $('#loginTab')?.classList.toggle('active', mode === 'login');
  $('#registerTab')?.classList.toggle('active', mode === 'register');
  $('#authbox').innerHTML = mode === 'login' ? `
    <div class="auth-form">
      <label>Email o usuario</label><input id="loginid" autocomplete="username" placeholder="tuusuario">
      <label>Contraseña</label><input id="loginpass" type="password" autocomplete="current-password" placeholder="••••••••" onkeydown="if(event.key==='Enter')login()">
      <button id="loginSubmit" class="btn primary large" onclick="login()">Entrar</button>
      <button class="auth-text-link" onclick="openForgotPassword()">¿Has olvidado tu contraseña?</button>
    </div>` : `
    <div class="auth-form">
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
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando…'; }
    const d = await api('/api/auth/login', { method:'POST', body: JSON.stringify({ emailOrUsername: $('#loginid').value, password: $('#loginpass').value }) });
    state.token = d.token; localStorage.setItem('token', d.token); await init();
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
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Creando cuenta…'; }
    const d = await api('/api/auth/register', { method:'POST', body: JSON.stringify({ name: $('#regname').value, username: $('#reguser').value, email: $('#regemail').value, password: $('#regpass').value, age_confirmed:true, terms_accepted:true, terms_version:'2026-09-20' }) });
    if (d.verification_required) {
      modal(`<div class="modal-head"><h3>Confirma tu email</h3><button class="icon-btn" onclick="closeModal()">×</button></div><div class="account-form"><div class="security-callout"><b>Cuenta creada</b><p>Te hemos enviado un enlace de verificación. Ábrelo antes de iniciar sesión.</p></div><button class="btn primary" onclick="closeModal();showAuth('login')">Volver a entrar</button></div>`);
      return;
    }
    state.token = d.token; localStorage.setItem('token', d.token); await init();
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
    const d=await api('/api/auth/forgot-password',{method:'POST',body:JSON.stringify({email:$('#forgotEmail')?.value || ''})});
    closeModal(); toast(d.message || 'Revisa tu correo');
  }catch(e){toast(e.message,'error');}
  finally{if(btn?.isConnected){btn.disabled=false;btn.textContent='Enviar enlace';}}
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

function layout() {
  $('#app').innerHTML = `
    <header class="topbar">
      <button class="brand-button" onclick="go('feed')">${brandLockup('top')}</button>
      <div class="top-actions">
        <button class="top-icon" onclick="go('search')" aria-label="Buscar">⌕</button>
        <button id="topActivityButton" class="top-icon badge-wrap" onclick="go('notifications')" aria-label="Actividad">♡${Number(state.me?.unread_notifications || 0) ? `<span class="nav-badge">${Math.min(99,state.me.unread_notifications)}</span>` : ''}</button>
        <button class="top-avatar" onclick="openProfile('${escapeAttr(state.me.username)}')">${avatar(state.me, 'small')}</button>
      </div>
    </header>
    <div class="shell">
      <aside class="left-col">
        <div class="left-sticky">
          <button class="brand-button desktop-brand" onclick="go('feed')">${brandLockup('side')}</button>
          <nav class="nav" id="desktopNav">
            ${navButton('feed','⌂','Inicio')}
            ${navButton('reels','▶','Reels')}
            ${navButton('discover','✦','Descubrir')}
            ${navButton('search','⌕','Buscar')}
            ${navButton('messages','✉','Mensajes')}
            ${navButton('notifications','♡','Actividad')}
            ${navButton('bookmarks','▱','Guardados')}
            ${state.me?.is_admin ? navButton('admin','⚙','Administración') : ''}
            <button class="nav-item ${state.view === 'profile' ? 'active' : ''}" onclick="openProfile('${escapeAttr(state.me.username)}')"><span class="nav-icon">◎</span><span>Perfil</span></button>
          </nav>
          <button class="btn primary compose-side" onclick="focusComposer()">Publicar</button>
          <button class="account-mini" onclick="openProfile('${escapeAttr(state.me.username)}')">${avatar(state.me, 'small')}<span><b>${escapeHtml(state.me.name)}</b><small>@${escapeHtml(state.me.username)}</small></span></button>
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
      ${navButton('messages','✉','Mensajes')}
      <button class="nav-item ${state.view === 'profile' ? 'active' : ''}" onclick="openProfile('${escapeAttr(state.me.username)}')"><span class="nav-icon">◎</span><span>Perfil</span></button>
    </nav>`;
  loadRightbar();
}

window.logout = () => {
  if (state.messagePoll) { clearInterval(state.messagePoll); state.messagePoll = null; }
  if (state.socket) { state.socket.disconnect(); state.socket = null; }
  localStorage.removeItem('token'); state.token = ''; state.me = null; state.view = 'feed'; authScreen();
};

window.go = async (view) => {
  if (state.messagePoll) { clearInterval(state.messagePoll); state.messagePoll = null; }
  state.view = view;
  if (view !== 'profile') state.profile = null;
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

function composer() {
  return `<section class="card composer-compact" id="composer">
    ${avatar(state.me)}
    <button class="composer-trigger" onclick="openComposerModal()">¿Qué quieres compartir?</button>
    <button class="composer-media-shortcut" onclick="openComposerModal(true)" title="Añadir foto o vídeo" aria-label="Añadir foto o vídeo">▧</button>
  </section>`;
}

window.openComposerModal = (pickMedia = false) => {
  modal(`<div class="modal-head composer-modal-head"><h3>Crear publicación</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="composer-modal">
      <div class="composer-author">${avatar(state.me)}<div><b>${escapeHtml(state.me.name)}</b><small>@${escapeHtml(state.me.username)}</small></div></div>
      <textarea id="posttext" rows="6" maxlength="5000" placeholder="¿Qué quieres compartir con la comunidad?"></textarea>
      <div class="composer-hint">Puedes usar <b>@usuario</b> para mencionar y <b>#tema</b> para crear una tendencia.</div>
      <div id="mediaPreview"></div>
      <div class="composer-modal-tools">
        <label id="modalMediaPicker" class="media-picker modal-media-picker" tabindex="0">▧ Foto / vídeo<input type="file" id="media" accept="image/*,video/*" onchange="previewMedia(this)"></label>
        <select id="visibility" title="Visibilidad"><option value="public">🌍 Público</option><option value="followers">👥 Seguidores</option></select>
      </div>
      <button class="btn primary large composer-publish" id="publishBtn" onclick="createPost()">Publicar</button>
    </div>`);
  setTimeout(() => {
    if (!pickMedia) {
      $('#posttext')?.focus();
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
  if (!file || !box) return box.innerHTML = '';
  const url = URL.createObjectURL(file);
  box.innerHTML = file.type.startsWith('video/')
    ? `<div class="preview-wrap"><video src="${url}" controls></video><button onclick="clearMedia()">×</button></div>`
    : `<div class="preview-wrap"><img src="${url}" alt=""><button onclick="clearMedia()">×</button></div>`;
};
window.clearMedia = () => { const input = $('#media'); if (input) input.value = ''; const p = $('#mediaPreview'); if (p) p.innerHTML = ''; };

window.createPost = async () => {
  if (state.busy) return;
  try {
    state.busy = true; const btn = $('#publishBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Publicando…'; }
    let media_id = null, media_type = 'none';
    const file = $('#media')?.files?.[0];
    if (file) {
      const fd = new FormData(); fd.append('file', file);
      const up = await api('/api/upload', { method:'POST', body:fd });
      media_id = up.media_id; media_type = up.mime.startsWith('video/') ? 'video' : 'image';
    }
    await api('/api/posts', { method:'POST', body:JSON.stringify({ text: $('#posttext')?.value || '', media_id, media_type, visibility: $('#visibility')?.value || 'public' }) });
    toast('Publicado');
    closeModal();
    await refreshMe(); await renderFeed();
  } catch (e) { toast(e.message, 'error'); }
  finally { state.busy = false; }
};

function repostEmbed(r) {
  if (!r) return '';
  if (r.unavailable) return `<div class="repost-embed unavailable">Esta publicación ya no está disponible.</div>`;
  const media = r.media_url ? (r.media_type === 'video'
    ? `<video class="repost-media" src="${escapeAttr(r.media_url)}" controls preload="metadata"></video>`
    : `<img class="repost-media" src="${escapeAttr(r.media_url)}" loading="lazy" alt="">`) : '';
  return `<div class="repost-embed">
    <button class="repost-author" onclick="openProfile('${escapeAttr(r.username)}')">${avatar(r,'small')}<span><b>${escapeHtml(r.name)}</b><small>@${escapeHtml(r.username)} · ${timeAgo(r.created_at)}</small></span></button>
    ${r.text ? `<div class="repost-text">${formatText(r.text)}</div>` : ''}
    ${media}
  </div>`;
}

function postHtml(p) {
  const media = p.media_url ? (p.media_type === 'video'
    ? `<video class="post-media" src="${escapeAttr(p.media_url)}" controls preload="metadata"></video>`
    : `<img class="post-media" src="${escapeAttr(p.media_url)}" loading="lazy" alt="Publicación de ${escapeAttr(p.username)}">`) : '';
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

async function renderFeed() {
  const endpoint = state.feedMode === 'for-you' ? '/api/for-you' : '/api/feed';
  const [rows, stories] = await Promise.all([api(endpoint), api('/api/stories')]);
  const empty = state.feedMode === 'for-you'
    ? `<div class="card empty feed-empty"><div class="empty-icon">✦</div><h3>Estamos preparando tu Para ti</h3><p>Interactúa con publicaciones, sigue perfiles o añade intereses para afinarlo.</p><div class="empty-actions"><button class="btn primary compact" onclick="go('discover')">Descubrir</button><button class="btn ghost compact" onclick="editProfile()">Mis intereses</button></div></div>`
    : `<div class="card empty feed-empty"><div class="empty-icon">⌂</div><h3>Tu feed está empezando</h3><p>Sigue personas desde Descubrir o crea tu primera publicación.</p><div class="empty-actions"><button class="btn primary compact" onclick="go('discover')">Descubrir</button><button class="btn ghost compact" onclick="openComposerModal()">Publicar</button></div></div>`;
  $('#main').innerHTML = `<div class="feed-start">${storyStrip(stories)}${composer()}${feedTabs()}${personalizeHint()}</div><div class="post-list">${rows.length ? rows.map(postHtml).join('') : empty}</div>`;
}


function followButtonHtml(u, klass = 'btn primary compact') {
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

async function renderDiscover() {
  const [rows,trends,suggestions] = await Promise.all([api('/api/discover'),api('/api/trending'),api('/api/suggestions?limit=8')]);
  const trendStrip = trends.length ? `<div class="trend-strip">${trends.slice(0,8).map(t=>`<button onclick="searchTag('${escapeAttr(t.tag)}')"><b>${escapeHtml(t.tag)}</b><small>${t.count} posts · ${t.authors} personas</small></button>`).join('')}</div>` : '';
  const people = suggestions.length ? `<section class="discover-people"><div class="section-heading"><div><h3>Personas para ti</h3><p>Perfiles recomendados según tu actividad e intereses.</p></div></div><div class="suggestion-scroll">${suggestions.map(suggestionCard).join('')}</div></section>` : '';
  $('#main').innerHTML = `${pageHeader('Descubrir','Encuentra personas, temas y contenido nuevo')}${people}${trendStrip}<div class="section-heading post-discover-heading"><div><h3>Popular ahora</h3><p>Publicaciones públicas con más conversación reciente.</p></div></div><div class="post-list">${rows.length ? rows.map(postHtml).join('') : `<div class="card empty"><div class="empty-icon">✦</div><h3>Aún no hay contenido público</h3><p>Cuando la comunidad publique contenido público, aparecerá aquí.</p></div>`}</div>`;
}

async function renderBookmarks() {
  const rows = await api('/api/bookmarks');
  $('#main').innerHTML = `${pageHeader('Guardados','Solo tú puedes ver lo que guardas')}<div class="post-list">${rows.length ? rows.map(postHtml).join('') : `<div class="card empty"><div class="empty-icon">▱</div><h3>No has guardado nada todavía</h3><p>Usa el icono de marcador de cualquier publicación.</p></div>`}</div>`;
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
  } catch (e) { toast(e.message, 'error'); }
};

window.searchTag = async (tag) => { state.search = tag; await go('search'); };

function userRow(u) {
  const summary = u.headline || u.bio || '';
  return `<div class="user-row"><button class="person-link" onclick="openProfile('${escapeAttr(u.username)}')">${avatar(u)}<span><b>${escapeHtml(u.name)}${u.account_private ? ' <i class="private-mini">🔒</i>' : ''}</b><small>@${escapeHtml(u.username)}</small>${summary ? `<em>${escapeHtml(summary).slice(0,90)}</em>` : ''}</span></button>${followButtonHtml(u)}</div>`;
}

window.openProfile = async (username) => { if (state.messagePoll) { clearInterval(state.messagePoll); state.messagePoll = null; } state.view = 'profile'; state.profile = username; layout(); await renderProfile(username); };

async function renderProfile(username) {
  const u = await api('/api/users/' + encodeURIComponent(username));
  let posts = [];
  if (!u.blocked_by_me) posts = await api('/api/users/' + encodeURIComponent(username) + '/posts');
  const website = u.website ? `<a class="profile-link" href="${escapeAttr(normalizeUrl(u.website))}" target="_blank" rel="noopener">↗ ${escapeHtml(u.website)}</a>` : '';
  const interests = String(u.interests || '').split(',').map(x=>x.trim()).filter(Boolean).slice(0,10);
  const privateLocked = u.account_private && !u.own && !u.following;
  let actions = '';
  if (u.own) {
    actions = `<div class="profile-desktop-actions"><button class="btn ghost compact" onclick="go('friends')">Amigos</button><button class="btn ghost compact" onclick="openPrivacySettings()">Privacidad</button><button class="btn ghost compact" onclick="openAccountSettings()">Ajustes</button>${state.me?.is_admin ? `<button class="btn ghost compact" onclick="go('admin')">Administración</button>` : ''}<button class="btn ghost compact" onclick="editProfile()">Editar perfil</button></div><div class="profile-mobile-actions"><button class="btn ghost compact profile-edit-mobile" onclick="editProfile()">Editar perfil</button><button class="icon-btn profile-own-more" title="Más opciones" aria-label="Más opciones de perfil" onclick="openOwnProfileMenu()">•••</button></div>`;
  } else if (u.blocked_by_me) {
    actions = `<button class="btn primary compact" onclick="toggleBlock(${u.id},'${escapeAttr(u.username)}')">Desbloquear</button>`;
  } else {
    actions = `${u.can_message?`<button class="btn ghost compact" onclick="startMessage(${u.id})">Mensaje</button>`:''}${friendButton(u)}${followButtonHtml(u)}<button class="icon-btn profile-more" title="Más opciones" onclick="openProfileMenu(${u.id},'${escapeAttr(u.username)}',${u.muted?'true':'false'})">•••</button>`;
  }
  $('#main').innerHTML = `<section class="card profile-card profile-card-v7">
    <div class="profile-cover ${u.cover ? 'has-cover' : ''}">${u.cover ? `<img src="${escapeAttr(u.cover)}" alt="">` : ''}</div>
    <div class="profile-main-v7">
      <div class="profile-top">${avatar(u, 'xl')}<div class="profile-cta">${actions}</div></div>
      <h2>${escapeHtml(u.name)}${u.account_private ? ' <span class="private-badge" title="Cuenta privada">🔒</span>' : ''}</h2><div class="handle">@${escapeHtml(u.username)}</div>
      ${u.headline ? `<div class="profile-headline">${escapeHtml(u.headline)}</div>` : ''}
      ${!u.blocked_by_me ? `<div class="profile-presence">${presenceHtml(u)}</div>` : ''}
      ${u.blocked_by_me ? `<div class="privacy-notice blocked-notice"><b>Has bloqueado a esta persona</b><span>No podéis ver vuestro contenido ni interactuar mientras esté bloqueada.</span></div>` : ''}
      ${u.bio && !u.blocked_by_me ? `<p class="profile-bio">${formatText(u.bio)}</p>` : ''}
      ${!u.blocked_by_me ? `<div class="profile-meta">${u.location ? `<span>⌖ ${escapeHtml(u.location)}</span>` : ''}${website}</div>` : ''}
      ${interests.length && !u.blocked_by_me ? `<div class="interest-chips">${interests.map(x=>`<button onclick="searchTag('#${escapeAttr(x.replace(/^#/,'').replace(/\s+/g,'_'))}')">${escapeHtml(x)}</button>`).join('')}</div>` : ''}
      <div class="profile-stats"><span><b>${u.posts_count}</b> publicaciones</span><span><b>${u.followers_count}</b> seguidores</span><span><b>${u.following_count}</b> siguiendo</span>${u.own ? `<button onclick="go('friends')"><b>${u.friends_count || 0}</b> amigos</button>` : `<span><b>${u.friends_count || 0}</b> amigos</span>`}</div>
    </div>
  </section>
  ${privateLocked ? `<div class="card private-profile-lock"><div>🔒</div><h3>Esta cuenta es privada</h3><p>Envía una solicitud para ver sus publicaciones y Stories.</p>${u.follow_requested ? '<span>Solicitud de seguimiento enviada</span>' : followButtonHtml(u)}</div>` : ''}
  ${!u.blocked_by_me && !privateLocked ? `<div class="profile-section-title">Publicaciones</div><div class="post-list">${posts.length ? posts.map(postHtml).join('') : `<div class="card empty profile-empty"><div class="empty-icon">▧</div><h3>Sin publicaciones todavía</h3><p>${u.own ? 'Tu primera publicación aparecerá aquí.' : 'Cuando publique algo, aparecerá aquí.'}</p>${u.own ? '<button class="btn primary compact" onclick="openComposerModal()">Crear publicación</button>' : ''}</div>`}</div>` : ''}`;
}

window.openProfileMenu = (userId, username, muted = false) => {
  modal(`<div class="modal-head"><h3>@${escapeHtml(username)}</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="post-menu">
      <button onclick="closeModal();toggleMute(${userId},'${escapeAttr(username)}')"><span>◌</span><div><b>${muted ? 'Dejar de silenciar' : 'Silenciar'}</b><small>${muted ? 'Volver a mostrar su contenido' : 'Ocultar sus posts y Stories de tus feeds'}</small></div></button>
      <button onclick="reportModal({userId:${userId},username:'${escapeAttr(username)}'})"><span>!</span><div><b>Denunciar perfil</b><small>Enviar este perfil a revisión</small></div></button>
      <button class="danger-option" onclick="closeModal();toggleBlock(${userId},'${escapeAttr(username)}')"><span>⊘</span><div><b>Bloquear</b><small>Impide seguimiento, amistad y mensajes</small></div></button>
    </div>`);
};


function friendButton(u) {
  if (!u || u.own) return '';
  if (u.friendship_status === 'friends') return `<button class="btn ghost compact friendship-btn" onclick="removeFriend(${u.id},'${escapeAttr(u.username)}')">✓ Amigos</button>`;
  if (u.friendship_status === 'sent') return `<button class="btn ghost compact friendship-btn" onclick="sendFriendRequest(${u.id},'${escapeAttr(u.username)}')">Solicitud enviada</button>`;
  if (u.friendship_status === 'received') return `<button class="btn primary compact friendship-btn" onclick="acceptFriendRequest(${Number(u.friend_request_id)},'${escapeAttr(u.username)}')">Aceptar amistad</button>`;
  return `<button class="btn ghost compact friendship-btn" onclick="sendFriendRequest(${u.id},'${escapeAttr(u.username)}')">＋ Amigo</button>`;
}

function normalizeUrl(url) { return /^https?:\/\//i.test(url) ? url : `https://${url}`; }

window.toggleFollow = async (id, username = '') => {
  try {
    const d = await api(`/api/users/${id}/follow`, { method:'POST' });
    if (d.status === 'requested') toast('Solicitud de seguimiento enviada');
    else if (d.status === 'following') toast('Ahora sigues a esta persona');
    else toast('Ya no la sigues');
    await refreshMe(false);
    if (state.view === 'profile' && username) await renderProfile(username); else await renderView();
  } catch (e) { toast(e.message, 'error'); }
};



window.openPrivacySettings = async () => {
  try {
    const [settings,requests,blocked,muted] = await Promise.all([api('/api/privacy'),api('/api/follow-requests'),api('/api/blocked'),api('/api/muted')]);
    modal(`<div class="modal-head"><h3>Privacidad y control</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
      <div class="privacy-settings">
        <section class="privacy-section"><div><b>Cuenta privada</b><small>Solo los seguidores que apruebes podrán ver tus publicaciones y Stories.</small></div><label class="switch"><input id="privacyPrivate" type="checkbox" ${settings.account_private?'checked':''}><span></span></label></section>
        <label class="privacy-field"><span><b>Quién puede enviarte mensajes</b><small>Controla quién puede iniciar o continuar una conversación contigo.</small></span><select id="privacyMessages"><option value="everyone" ${settings.message_policy==='everyone'?'selected':''}>Todo el mundo</option><option value="followers" ${settings.message_policy==='followers'?'selected':''}>Personas que me siguen</option><option value="friends" ${settings.message_policy==='friends'?'selected':''}>Solo amigos</option><option value="nobody" ${settings.message_policy==='nobody'?'selected':''}>Nadie</option></select></label>
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
  try { await api('/api/privacy',{method:'PATCH',body:JSON.stringify({account_private:$('#privacyPrivate').checked,message_policy:$('#privacyMessages').value})}); await refreshMe(false); toast('Privacidad actualizada'); await openPrivacySettings(); }
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
  } catch (e) { toast(e.message,'error'); }
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
  const [friends, requests] = await Promise.all([api('/api/friends'), api('/api/friends/requests')]);
  const incoming = requests.incoming || [], outgoing = requests.outgoing || [];
  $('#main').innerHTML = `${pageHeader('Amigos','Solicitudes y personas con las que has conectado')}
    ${incoming.length ? `<section class="card friends-section"><div class="section-row"><h3>Solicitudes</h3><span>${incoming.length}</span></div>${incoming.map(friendRequestRow).join('')}</section>` : ''}
    ${outgoing.length ? `<section class="card friends-section"><div class="section-row"><h3>Enviadas</h3></div>${outgoing.map(outgoingFriendRow).join('')}</section>` : ''}
    <section class="card friends-section"><div class="section-row"><h3>Tus amigos</h3><span>${friends.length}</span></div>${friends.length ? friends.map(friendRow).join('') : `<div class="empty compact-empty"><p>Aún no has añadido amigos.</p><button class="btn primary compact" onclick="go('discover')">Descubrir personas</button></div>`}</section>`;
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
      <button onclick="closeModal();go('friends')"><span>👥</span><div><b>Amigos</b><small>Gestiona amistades y solicitudes</small></div></button>
      <button onclick="closeModal();openPrivacySettings()"><span>🔒</span><div><b>Privacidad</b><small>Cuenta privada, mensajes, bloqueos y silencios</small></div></button>
      <button onclick="closeModal();openAccountSettings()"><span>⚙</span><div><b>Ajustes</b><small>Contraseña, legal y cuenta</small></div></button>
      ${state.me?.is_admin ? `<button onclick="closeModal();go('admin')"><span>🛡</span><div><b>Administración</b><small>Moderación y denuncias</small></div></button>` : ''}
      <button class="danger-option" onclick="closeModal();logout()"><span>↪</span><div><b>Cerrar sesión</b><small>Salir de Instant Admirers en este dispositivo</small></div></button>
    </div>`);
};

window.editProfile = () => {
  const u = state.me;
  modal(`<div class="modal-head"><h3>Editar perfil</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="edit-profile">
      <div class="edit-cover-preview ${u.cover?'has-cover':''}">${u.cover?`<img src="${escapeAttr(u.cover)}" alt="">`:''}<div class="profile-photo-actions cover-actions"><label class="btn ghost compact">Cambiar portada<input type="file" id="coverFile" accept="image/*" hidden></label>${u.cover?`<button class="btn danger compact" type="button" onclick="removeProfileCover()">Eliminar portada</button>`:''}</div></div>
      <div class="edit-avatar-row">${avatar(u, 'large')}<div class="profile-photo-actions"><label class="btn ghost compact">Cambiar foto<input type="file" id="avatarFile" accept="image/*" hidden></label>${u.avatar?`<button class="btn danger compact" type="button" onclick="removeProfileAvatar()">Eliminar foto</button>`:''}</div></div>
      <label>Nombre<input id="editName" value="${escapeAttr(u.name)}" maxlength="100"></label>
      <label>Frase de perfil<input id="editHeadline" value="${escapeAttr(u.headline || '')}" maxlength="140" placeholder="Diseñador, creador, viajero…"></label>
      <label>Biografía<textarea id="editBio" maxlength="500" rows="4">${escapeHtml(u.bio || '')}</textarea></label>
      <label>Intereses<input id="editInterests" value="${escapeAttr(u.interests || '')}" maxlength="500" placeholder="música, viajes, tecnología"></label>
      <label>Ubicación<input id="editLocation" value="${escapeAttr(u.location || '')}" maxlength="120" placeholder="Valencia, España"></label>
      <label>Web<input id="editWebsite" value="${escapeAttr(u.website || '')}" maxlength="500" placeholder="tusitio.com"></label>
      <button class="btn primary" onclick="saveProfile()">Guardar cambios</button>
    </div>`);
};


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
    if (file) { const fd = new FormData(); fd.append('file', file); const up = await api('/api/upload', { method:'POST', body:fd }); avatarUrl = up.url; }
    if (coverFile) { const fd = new FormData(); fd.append('file', coverFile); const up = await api('/api/upload', { method:'POST', body:fd }); coverUrl = up.url; }
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
  if (desktop) desktop.innerHTML = `${navButton('feed','⌂','Inicio')}${navButton('reels','▶','Reels')}${navButton('discover','✦','Descubrir')}${navButton('search','⌕','Buscar')}${navButton('messages','✉','Mensajes')}${navButton('notifications','♡','Actividad')}${navButton('bookmarks','▱','Guardados')}${state.me?.is_admin ? navButton('admin','⚙','Administración') : ''}<button class="nav-item ${state.view === 'profile' ? 'active' : ''}" onclick="openProfile('${escapeAttr(state.me.username)}')"><span class="nav-icon">◎</span><span>Perfil</span></button>`;
}

async function loadRightbar() {
  const box = $('#rightbar'); if (!box) return;
  try {
    const [suggestions, tags] = await Promise.all([api('/api/suggestions?limit=4'), api('/api/trending')]);
    box.innerHTML = `<div class="card side-card"><div class="side-title">Tu perfil</div><button class="profile-summary" onclick="openProfile('${escapeAttr(state.me.username)}')">${avatar(state.me)}<span><b>${escapeHtml(state.me.name)}</b><small>@${escapeHtml(state.me.username)}</small></span></button><div class="mini-stats"><span><b>${state.me.posts_count || 0}</b>posts</span><span><b>${state.me.followers_count || 0}</b>seguidores</span><span><b>${state.me.following_count || 0}</b>siguiendo</span></div></div>
      <div class="card side-card"><div class="side-title">Personas para ti</div>${suggestions.length ? suggestions.map(u => `<div class="side-user suggested-side-user"><button onclick="openProfile('${escapeAttr(u.username)}')">${avatar(u,'small')}<span><b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.username)}</small><em>✦ ${escapeHtml(u.recommendation_reason || 'Sugerido')}</em></span></button>${u.follow_requested?`<button class="text-btn" onclick="toggleFollow(${u.id},'${escapeAttr(u.username)}')">Solicitada</button>`:`<button class="text-btn" onclick="toggleFollow(${u.id},'${escapeAttr(u.username)}')">${u.account_private?'Solicitar':'Seguir'}</button>`}</div>`).join('') : '<p class="muted">Sigue interactuando y aparecerán sugerencias.</p>'}</div>
      <div class="card side-card"><div class="side-title">Tendencias · 7 días</div>${tags.length ? tags.map(t => `<button class="trend" onclick="searchTag('${escapeAttr(t.tag)}')"><b>${escapeHtml(t.tag)}</b><small>${t.count} posts · ${t.authors || 1} personas · ${t.engagement || 0} interacciones</small></button>`).join('') : '<p class="muted">Los hashtags aparecerán aquí cuando se usen.</p>'}</div>
      <button class="logout-link" onclick="logout()">Cerrar sesión</button>`;
  } catch {
    box.innerHTML = '';
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
      <label class="story-drop" id="storyDrop">📸<b>Elige una foto o vídeo</b><span>Se eliminará automáticamente en 24 horas.</span><input id="storyFile" type="file" accept="image/*,video/*" onchange="previewStoryFile(this)" hidden></label>
      <div id="storyPreview"></div>
      <label>Texto opcional<textarea id="storyText" rows="3" maxlength="500" placeholder="Añade algo a tu story…"></textarea></label>
      <label>Quién puede verla<select id="storyVisibility"><option value="public">🌍 Toda la comunidad</option><option value="followers">👥 Solo seguidores</option></select></label>
      <button class="btn primary" id="storyPublish" onclick="publishStory()">Publicar Story</button>
    </div>`);
};

window.previewStoryFile = (input) => {
  const file = input.files?.[0]; if (!file) return;
  const url = URL.createObjectURL(file);
  $('#storyPreview').innerHTML = file.type.startsWith('video/') ? `<video class="story-preview" src="${url}" controls></video>` : `<img class="story-preview" src="${url}" alt="">`;
  $('#storyDrop').classList.add('has-file');
};

window.publishStory = async () => {
  const file = $('#storyFile')?.files?.[0];
  if (!file) return toast('Elige una foto o vídeo', 'error');
  const btn = $('#storyPublish');
  try {
    btn.disabled = true; btn.textContent = 'Publicando…';
    const fd = new FormData(); fd.append('file', file);
    const up = await api('/api/upload', { method:'POST', body:fd });
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
  const media = s.media_type === 'video'
    ? `<video id="storyMedia" class="story-media" src="${escapeAttr(s.media_url)}" autoplay playsinline controls></video>`
    : `<img class="story-media" src="${escapeAttr(s.media_url)}" alt="Story">`;
  $('#modal-root').innerHTML = `<div class="story-backdrop"><div class="story-viewer">
    <div class="story-progress">${viewer.items.map((_,i)=>`<span class="${i < viewer.index ? 'done' : i === viewer.index ? 'active' : ''}"><i></i></span>`).join('')}</div>
    <div class="story-head"><button class="person-link" onclick="closeStoryViewer();openProfile('${escapeAttr(s.username)}')">${avatar(s,'small')}<span><b>${escapeHtml(s.name)}</b><small>@${escapeHtml(s.username)} · ${timeAgo(s.created_at)}</small></span></button><button class="story-close" onclick="closeStoryViewer()">×</button></div>
    <div class="story-stage">${media}${s.text ? `<div class="story-caption">${formatText(s.text)}</div>` : ''}<button class="story-prev" onclick="nextStory(-1)">‹</button><button class="story-next" onclick="nextStory(1)">›</button></div>
    ${s.own ? `<div class="story-owner-tools"><button onclick="showStoryViewers(${s.id})">👁 ${s.views_count || 0} visualizaciones</button><button class="danger-text" onclick="deleteStory(${s.id})">Eliminar</button></div>` : ''}
  </div></div>`;

  if (s.media_type === 'video') {
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
  const rows = await api('/api/reels');
  $('#main').innerHTML = `${pageHeader('Reels','Vídeos verticales de la comunidad')}<div class="reels-feed">${rows.length ? rows.map(reelHtml).join('') : `<div class="card empty"><div class="empty-icon">▶</div><h3>Aún no hay Reels</h3><p>Publica un vídeo desde Inicio y aparecerá aquí.</p><button class="btn primary" onclick="focusComposer()">Publicar vídeo</button></div>`}</div>`;
  setupReels();
}

function reelHtml(p) {
  return `<article class="reel-card" data-reel="${p.id}">
    <video class="reel-video" src="${escapeAttr(p.media_url)}" loop muted playsinline preload="metadata" onclick="toggleReelSound(this)"></video>
    <div class="reel-gradient"></div>
    <div class="reel-info"><button class="reel-user" onclick="openProfile('${escapeAttr(p.username)}')">${avatar(p,'small')}<span><b>${escapeHtml(p.name)}</b><small>@${escapeHtml(p.username)}</small></span></button>${p.text ? `<div class="reel-text">${formatText(p.text)}</div>` : ''}<div class="reel-hint">Toca el vídeo para activar/desactivar sonido</div></div>
    <div class="reel-actions"><button class="reel-action ${p.liked?'liked':''}" onclick="likePost(${p.id})"><span>${p.liked?'♥':'♡'}</span><b>${p.likes_count}</b></button><button class="reel-action" onclick="openComments(${p.id})"><span>◌</span><b>${p.comments_count}</b></button><button class="reel-action" onclick="sharePost(${p.id})"><span>↗</span></button><button class="reel-action ${p.saved?'saved':''}" onclick="savePost(${p.id})"><span>${p.saved?'▰':'▱'}</span></button></div>
  </article>`;
}

function setupReels() {
  const videos = $$('.reel-video');
  if (!('IntersectionObserver' in window)) { videos[0]?.play().catch(()=>{}); return; }
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    const v = entry.target;
    if (entry.isIntersecting && entry.intersectionRatio > .65) v.play().catch(()=>{}); else v.pause();
  }), { threshold:[0,.65,1] });
  videos.forEach(v => observer.observe(v));
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

async function renderMessages() {
  const conversations = await api('/api/conversations');
  const isMobile = matchMedia('(max-width:860px)').matches;
  if (!state.activeConversation && !isMobile && conversations[0]) state.activeConversation = Number(conversations[0].id);
  const active = conversations.find(c => Number(c.id) === Number(state.activeConversation));
  let messages = [];
  if (active) messages = await api(`/api/conversations/${active.id}/messages`);
  $('#main').innerHTML = `${pageHeader('Mensajes','Conversaciones privadas en tiempo real')}
    <section class="card chat-shell ${active ? 'has-active' : ''}">
      <div class="conversation-pane">
        <div class="chat-pane-head"><b>Conversaciones</b><button class="btn primary compact" onclick="newMessage()">Nuevo</button></div>
        <div class="conversation-list">${conversations.length ? conversations.map(conversationRow).join('') : `<div class="empty compact-empty"><p>Aún no tienes conversaciones.</p><button class="btn primary compact" onclick="newMessage()">Enviar primer mensaje</button></div>`}</div>
      </div>
      <div class="message-pane">${active ? chatPanelHtml(active,messages,isMobile) : `<div class="chat-placeholder"><div>✉</div><h3>Selecciona una conversación</h3><p>Habla en privado con otras personas de la comunidad.</p></div>`}</div>
    </section>`;
  if (active) {
    requestAnimationFrame(() => { const stream=$('#messageStream'); if(stream) stream.scrollTop=stream.scrollHeight; });
    state.me.unread_messages = Math.max(0, Number(state.me.unread_messages || 0) - Number(active.unread_count || 0));
    updateNavBadges();
    if (state.messagePoll) clearInterval(state.messagePoll);
    state.messagePoll = setInterval(refreshActiveConversation, 15000);
  }
}

function conversationRow(c) {
  const preview = c.last_message ? c.last_message : c.last_shared_post_id ? '↗ Publicación compartida' : c.last_media_type === 'image' ? '📷 Foto' : c.last_media_type === 'video' ? '🎬 Vídeo' : 'Nueva conversación';
  return `<button class="conversation-row ${Number(c.id)===Number(state.activeConversation)?'active':''}" onclick="openConversation(${c.id})">${avatar(c,'small')}<span class="conversation-copy"><b>${escapeHtml(c.name)}${c.online?'<i class="online-dot" title="En línea"></i>':''}</b><small>${escapeHtml(preview).slice(0,65)}</small></span><span class="conversation-meta"><small>${c.last_message_at?timeAgo(c.last_message_at):''}</small>${Number(c.unread_count)>0?`<i>${Math.min(99,c.unread_count)}</i>`:''}</span></button>`;
}

function chatPanelHtml(c, messages, isMobile) {
  const reply = state.replyTo && Number(state.replyTo.conversationId)===Number(c.id) ? `<div class="reply-compose" id="replyCompose"><span><b>Respondiendo a ${escapeHtml(state.replyTo.name)}</b><small>${escapeHtml(state.replyTo.text || 'Multimedia').slice(0,90)}</small></span><button onclick="clearReply()">×</button></div>` : '';
  return `<div class="chat-header">${isMobile?`<button class="icon-btn chat-back" onclick="closeConversation()">‹</button>`:''}<button class="person-link" onclick="openProfile('${escapeAttr(c.username)}')">${avatar(c,'small')}<span><b>${escapeHtml(c.name)}</b><small>@${escapeHtml(c.username)} · ${presenceHtml({id:c.other_id,online:c.online,last_seen_at:c.last_seen_at})}</small></span></button><button class="icon-btn" onclick="renderMessages()" title="Actualizar">↻</button></div>
    <div class="message-stream" id="messageStream">${messages.length ? messages.map(messageHtml).join('') : `<div class="chat-first"><b>Empieza la conversación con ${escapeHtml(c.name)}</b><span>Los mensajes son privados entre vosotros.</span></div>`}</div>
    <div class="typing-indicator" id="typingIndicator"></div>
    ${reply}
    <div id="messageMediaPreview"></div>
    <div class="message-compose"><label class="attach-btn">＋<input id="messageFile" type="file" accept="image/*,video/*" onchange="previewMessageFile(this)" hidden></label><textarea id="messageText" rows="1" maxlength="4000" placeholder="Escribe un mensaje…" oninput="handleTyping(${c.id})" onblur="stopTyping(${c.id})" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage(${c.id})}"></textarea><button id="messageSendBtn" class="btn primary compact" onclick="sendMessage(${c.id})">Enviar</button></div>`;
}

function messageHtml(m) {
  const media = m.media_url ? (m.media_type === 'video' ? `<video class="message-media" src="${escapeAttr(m.media_url)}" controls></video>` : `<img class="message-media" src="${escapeAttr(m.media_url)}" alt="">`) : '';
  const reply = m.reply ? `<div class="message-reply"><b>${escapeHtml(m.reply.name || m.reply.username || 'Mensaje')}</b><span>${escapeHtml(m.reply.text || (m.reply.media_type==='image'?'📷 Foto':m.reply.media_type==='video'?'🎬 Vídeo':'Mensaje')).slice(0,120)}</span></div>` : '';
  let shared = '';
  if (m.shared_post?.unavailable) shared = `<div class="shared-post unavailable">Esta publicación ya no está disponible para ti.</div>`;
  else if (m.shared_post) {
    const sp=m.shared_post;
    const smedia=sp.media_url ? (sp.media_type==='video'?`<video src="${escapeAttr(sp.media_url)}" controls preload="metadata"></video>`:`<img src="${escapeAttr(sp.media_url)}" loading="lazy" alt="">`) : '';
    shared = `<div class="shared-post"><div class="shared-author">${avatar(sp,'small')}<span><b>${escapeHtml(sp.name || sp.username)}</b><small>@${escapeHtml(sp.username || '')}</small></span></div>${sp.text?`<p>${formatText(sp.text)}</p>`:''}${smedia}</div>`;
  }
  const excerpt = safeEncode((m.text || (m.media_type==='image'?'Foto':m.media_type==='video'?'Vídeo':m.shared_post?'Publicación':'Mensaje')).slice(0,100));
  const sender = safeEncode(m.name || m.username || 'Mensaje');
  return `<div class="message ${m.own?'mine':'theirs'}"><button class="message-reply-btn" onclick="replyToMessage(${m.id},'${sender}','${excerpt}')" title="Responder">↩</button><div class="message-bubble">${reply}${m.text?`<p>${formatText(m.text)}</p>`:''}${media}${shared}<small>${timeAgo(m.created_at)}</small></div></div>`;
}

window.replyToMessage = (id, encodedName, encodedText) => {
  state.replyTo = { id:Number(id), conversationId:Number(state.activeConversation), name:decodeURIComponent(encodedName), text:decodeURIComponent(encodedText) };
  const activeId=state.activeConversation; renderMessages().then(()=>$('#messageText')?.focus());
};
window.clearReply = () => { state.replyTo=null; $('#replyCompose')?.remove(); };

window.openConversation = async (id) => { state.activeConversation = Number(id); state.replyTo=null; await renderMessages(); };
window.closeConversation = async () => { stopTyping(state.activeConversation); state.activeConversation = null; state.replyTo=null; if(state.messagePoll){clearInterval(state.messagePoll);state.messagePoll=null;} await renderMessages(); };

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
  try {
    state.messageSending=true; if(btn){btn.disabled=true;btn.textContent='…';} if(input) input.disabled=true;
    let media_id=null;
    if(file){ const fd=new FormData(); fd.append('file',file); const up=await api('/api/upload',{method:'POST',body:fd}); media_id=up.media_id; }
    await api(`/api/conversations/${conversationId}/messages`,{method:'POST',body:JSON.stringify({text,media_id,reply_to_id:state.replyTo?.id||null})});
    stopTyping(conversationId); state.replyTo=null; if(input) input.value=''; clearMessageFile(); await renderMessages();
  } catch(e){ toast(e.message,'error'); }
  finally { state.messageSending=false; if(btn?.isConnected){btn.disabled=false;btn.textContent='Enviar';} if(input?.isConnected) input.disabled=false; }
};

async function refreshActiveConversation(){
  if(state.view!=='messages'||!state.activeConversation) return;
  try{
    const messages=await api(`/api/conversations/${state.activeConversation}/messages`);
    const stream=$('#messageStream');
    if(!stream) return;
    const nearBottom=stream.scrollHeight-stream.scrollTop-stream.clientHeight<100;
    stream.innerHTML=messages.length?messages.map(messageHtml).join(''):'<div class="chat-first"><span>Aún no hay mensajes.</span></div>';
    if(nearBottom) stream.scrollTop=stream.scrollHeight;
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
      ${state.me?.is_admin ? `<section class="settings-block"><div><b>Administración</b><small>Revisa denuncias y actividad de moderación.</small></div><button class="btn ghost compact" onclick="closeModal();go('admin')">Abrir panel</button></section>` : ''}
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

async function renderAdmin() {
  if(!state.me?.is_admin){
    $('#main').innerHTML=`<div class="card empty"><h3>Acceso no disponible</h3><p>Este panel está reservado a administración.</p></div>`;
    return;
  }
  const [stats,reports,actions,security]=await Promise.all([
    api('/api/admin/stats'),
    api('/api/admin/reports?status=all'),
    api('/api/admin/actions'),
    api('/api/admin/security-events')
  ]);
  $('#main').innerHTML=`${pageHeader('Administración','Moderación y estado general de Instant Admirers')}
    <div class="admin-stats">
      <div class="card admin-stat"><b>${stats.users}</b><span>Usuarios</span><small>+${stats.new_users_7d} esta semana</small></div>
      <div class="card admin-stat"><b>${stats.posts}</b><span>Publicaciones</span><small>+${stats.new_posts_7d} esta semana</small></div>
      <div class="card admin-stat"><b>${stats.open_reports}</b><span>Denuncias abiertas</span><small>${stats.reviewing_reports} en revisión</small></div>
      <div class="card admin-stat"><b>${stats.suspended_users}</b><span>Suspendidos</span><small>${stats.closed_reports} denuncias cerradas</small></div>
    </div>
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

async function init() {
  if (await handleAuthLink()) return;
  if (!state.token) return authScreen();
  try {
    state.me = await api('/api/me');
    connectRealtime();
    layout();
    await renderView();
    if (!state.me?.terms_accepted_at || state.me?.terms_version !== '2026-09-20' || !state.me?.age_confirmed_at) {
      setTimeout(openLegalAcceptance, 120);
    } else if (state.me && state.me.onboarding_completed === false) {
      setTimeout(openOnboarding, 150);
    }
  } catch {
    logout();
  }
}

window.addEventListener('offline', () => showNetworkState(false));
window.addEventListener('online', () => showNetworkState(true));
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (state.storyViewer) return closeStoryViewer();
  if ($('#modal-root')?.children.length) closeModal();
});
if (!navigator.onLine) setTimeout(() => showNetworkState(false), 200);

init();
