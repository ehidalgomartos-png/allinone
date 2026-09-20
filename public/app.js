const state = {
  token: localStorage.getItem('token') || '',
  me: null,
  view: 'feed',
  profile: null,
  search: '',
  busy: false,
  activeConversation: null,
  storyViewer: null,
  messagePoll: null
};

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

async function api(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const r = await fetch(url, { ...opts, headers });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Ha ocurrido un error');
  return data;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
}

function escapeAttr(value = '') { return escapeHtml(value).replace(/`/g, '&#096;'); }

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

function formatText(text = '') {
  let html = escapeHtml(text).replace(/\n/g, '<br>');
  html = html.replace(/(^|\s)(#[\p{L}\p{N}_]+)/gu, (_, lead, tag) => `${lead}<button class="inline-link" onclick="searchTag('${escapeAttr(tag)}')">${tag}</button>`);
  return html;
}

function toast(message, kind = '') {
  let box = $('#toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast';
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

function authScreen() {
  $('#app').innerHTML = `
    <div class="auth-page">
      <section class="auth-hero">
        <div class="brand big">OmniSocial</div>
        <h1>Una comunidad para compartir lo que eres.</h1>
        <p>Publica, descubre personas, sigue perfiles, comenta, guarda contenido y crea tu propia comunidad.</p>
        <div class="hero-pills"><span>📸 Fotos</span><span>🎬 Vídeos</span><span>💬 Conversaciones</span><span>✨ Comunidad</span></div>
      </section>
      <section class="auth-card card">
        <div class="brand mobile-brand">OmniSocial</div>
        <div class="tabs">
          <button id="loginTab" class="tab active" onclick="showAuth('login')">Entrar</button>
          <button id="registerTab" class="tab" onclick="showAuth('register')">Crear cuenta</button>
        </div>
        <div id="authbox"></div>
      </section>
    </div>`;
  showAuth('login');
}

window.showAuth = (mode) => {
  $('#loginTab')?.classList.toggle('active', mode === 'login');
  $('#registerTab')?.classList.toggle('active', mode === 'register');
  $('#authbox').innerHTML = mode === 'login' ? `
    <div class="auth-form">
      <label>Email o usuario</label><input id="loginid" autocomplete="username" placeholder="tuusuario">
      <label>Contraseña</label><input id="loginpass" type="password" autocomplete="current-password" placeholder="••••••••">
      <button class="btn primary large" onclick="login()">Entrar</button>
    </div>` : `
    <div class="auth-form">
      <label>Nombre</label><input id="regname" placeholder="Tu nombre">
      <label>Usuario</label><input id="reguser" autocomplete="username" placeholder="tuusuario">
      <label>Email</label><input id="regemail" type="email" autocomplete="email" placeholder="tu@email.com">
      <label>Contraseña</label><input id="regpass" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres">
      <button class="btn primary large" onclick="register()">Crear mi cuenta</button>
    </div>`;
};

window.login = async () => {
  try {
    const d = await api('/api/auth/login', { method:'POST', body: JSON.stringify({ emailOrUsername: $('#loginid').value, password: $('#loginpass').value }) });
    state.token = d.token; localStorage.setItem('token', d.token); await init();
  } catch (e) { toast(e.message, 'error'); }
};

window.register = async () => {
  try {
    const d = await api('/api/auth/register', { method:'POST', body: JSON.stringify({ name: $('#regname').value, username: $('#reguser').value, email: $('#regemail').value, password: $('#regpass').value }) });
    state.token = d.token; localStorage.setItem('token', d.token); await init();
  } catch (e) { toast(e.message, 'error'); }
};

function navButton(view, icon, label) {
  const active = state.view === view ? 'active' : '';
  let count = 0;
  if (view === 'notifications') count = Number(state.me?.unread_notifications || 0);
  if (view === 'messages') count = Number(state.me?.unread_messages || 0);
  const badge = count > 0 ? `<span class="nav-badge">${Math.min(99, count)}</span>` : '';
  return `<button class="nav-item ${active}" onclick="go('${view}')"><span class="nav-icon">${icon}</span><span>${label}</span>${badge}</button>`;
}

function layout() {
  $('#app').innerHTML = `
    <header class="topbar">
      <button class="brand-button brand" onclick="go('feed')">OmniSocial</button>
      <div class="top-actions">
        <button class="top-icon" onclick="go('search')" aria-label="Buscar">⌕</button>
        <button class="top-icon badge-wrap" onclick="go('notifications')" aria-label="Actividad">♡${Number(state.me?.unread_notifications || 0) ? `<span class="nav-badge">${Math.min(99,state.me.unread_notifications)}</span>` : ''}</button>
        <button class="top-avatar" onclick="openProfile('${escapeAttr(state.me.username)}')">${avatar(state.me, 'small')}</button>
      </div>
    </header>
    <div class="shell">
      <aside class="left-col">
        <div class="left-sticky">
          <button class="brand-button brand desktop-brand" onclick="go('feed')">OmniSocial</button>
          <nav class="nav" id="desktopNav">
            ${navButton('feed','⌂','Inicio')}
            ${navButton('reels','▶','Reels')}
            ${navButton('discover','✦','Descubrir')}
            ${navButton('search','⌕','Buscar')}
            ${navButton('messages','✉','Mensajes')}
            ${navButton('notifications','♡','Actividad')}
            ${navButton('bookmarks','▱','Guardados')}
            <button class="nav-item ${state.view === 'profile' ? 'active' : ''}" onclick="openProfile('${escapeAttr(state.me.username)}')"><span class="nav-icon">◎</span><span>Perfil</span></button>
          </nav>
          <button class="btn primary compose-side" onclick="focusComposer()">Publicar</button>
          <button class="account-mini" onclick="openProfile('${escapeAttr(state.me.username)}')">${avatar(state.me, 'small')}<span><b>${escapeHtml(state.me.name)}</b><small>@${escapeHtml(state.me.username)}</small></span></button>
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
  localStorage.removeItem('token'); state.token = ''; state.me = null; state.view = 'feed'; authScreen();
};

window.go = async (view) => {
  if (state.messagePoll) { clearInterval(state.messagePoll); state.messagePoll = null; }
  state.view = view;
  if (view !== 'profile') state.profile = null;
  if (view !== 'messages') state.activeConversation = null;
  layout();
  await renderView();
};

window.focusComposer = async () => {
  if (state.view !== 'feed') await go('feed');
  setTimeout(() => $('#posttext')?.focus(), 60);
};

async function renderView() {
  const main = $('#main');
  if (!main) return;
  main.innerHTML = `<div class="loading-card card">Cargando…</div>`;
  try {
    if (state.view === 'feed') return renderFeed();
    if (state.view === 'reels') return renderReels();
    if (state.view === 'discover') return renderDiscover();
    if (state.view === 'search') return renderSearch();
    if (state.view === 'messages') return renderMessages();
    if (state.view === 'notifications') return renderNotifications();
    if (state.view === 'bookmarks') return renderBookmarks();
    if (state.view === 'profile') return renderProfile(state.profile || state.me.username);
  } catch (e) {
    main.innerHTML = `<div class="card empty"><h3>No se pudo cargar</h3><p>${escapeHtml(e.message)}</p><button class="btn" onclick="renderView()">Reintentar</button></div>`;
  }
}
window.renderView = renderView;

function pageHeader(title, subtitle = '') {
  return `<div class="page-head"><div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div></div>`;
}

function composer() {
  return `<section class="card composer" id="composer">
    <div class="composer-row">${avatar(state.me)}<div class="composer-main">
      <textarea id="posttext" rows="3" maxlength="5000" placeholder="¿Qué quieres compartir con la comunidad?"></textarea>
      <div id="mediaPreview"></div>
      <div class="composer-tools">
        <label class="media-picker">▧ Foto / vídeo<input type="file" id="media" accept="image/*,video/*" onchange="previewMedia(this)"></label>
        <select id="visibility" title="Visibilidad"><option value="public">🌍 Público</option><option value="followers">👥 Seguidores</option></select>
        <button class="btn primary compact" id="publishBtn" onclick="createPost()">Publicar</button>
      </div>
    </div></div>
  </section>`;
}

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
    await refreshMe(); await renderFeed();
  } catch (e) { toast(e.message, 'error'); }
  finally { state.busy = false; }
};

function postHtml(p) {
  const media = p.media_url ? (p.media_type === 'video'
    ? `<video class="post-media" src="${escapeAttr(p.media_url)}" controls preload="metadata"></video>`
    : `<img class="post-media" src="${escapeAttr(p.media_url)}" loading="lazy" alt="Publicación de ${escapeAttr(p.username)}">`) : '';
  const privacy = p.visibility === 'followers' ? ' · 👥' : '';
  return `<article class="card post" data-post="${p.id}">
    <div class="post-head">
      <button class="person-link" onclick="openProfile('${escapeAttr(p.username)}')">${avatar(p)}<span><b>${escapeHtml(p.name)}</b><small>@${escapeHtml(p.username)} · ${timeAgo(p.created_at)}${privacy}</small></span></button>
      ${p.own ? `<button class="icon-btn danger-hover" title="Eliminar" onclick="deletePost(${p.id})">•••</button>` : ''}
    </div>
    ${p.text ? `<div class="post-text">${formatText(p.text)}</div>` : ''}
    ${media}
    <div class="post-actions">
      <button class="action ${p.liked ? 'liked' : ''}" onclick="likePost(${p.id})"><span>${p.liked ? '♥' : '♡'}</span><b>${p.likes_count}</b></button>
      <button class="action" onclick="openComments(${p.id})"><span>◌</span><b>${p.comments_count}</b></button>
      <button class="action push ${p.saved ? 'saved' : ''}" onclick="savePost(${p.id})"><span>${p.saved ? '▰' : '▱'}</span></button>
    </div>
  </article>`;
}

async function renderFeed() {
  const [rows, stories] = await Promise.all([api('/api/feed'), api('/api/stories')]);
  $('#main').innerHTML = `${pageHeader('Inicio','Publicaciones tuyas y de las personas que sigues')}${storyStrip(stories)}${composer()}<div class="post-list">${rows.length ? rows.map(postHtml).join('') : `<div class="card empty"><div class="empty-icon">👋</div><h3>Tu feed está empezando</h3><p>Sigue a algunas personas desde Descubrir o publica algo tú.</p><button class="btn primary" onclick="go('discover')">Descubrir comunidad</button></div>`}</div>`;
}

async function renderDiscover() {
  const rows = await api('/api/discover');
  $('#main').innerHTML = `${pageHeader('Descubrir','Contenido público con más conversación en la comunidad')}<div class="post-list">${rows.length ? rows.map(postHtml).join('') : `<div class="card empty"><h3>Aún no hay contenido público</h3></div>`}</div>`;
}

async function renderBookmarks() {
  const rows = await api('/api/bookmarks');
  $('#main').innerHTML = `${pageHeader('Guardados','Solo tú puedes ver lo que guardas')}<div class="post-list">${rows.length ? rows.map(postHtml).join('') : `<div class="card empty"><div class="empty-icon">▱</div><h3>No has guardado nada todavía</h3><p>Usa el icono de marcador de cualquier publicación.</p></div>`}</div>`;
}

window.likePost = async (id) => {
  try { await api(`/api/posts/${id}/like`, { method:'POST' }); await renderView(); await refreshMe(false); }
  catch (e) { toast(e.message, 'error'); }
};

window.savePost = async (id) => {
  try { const d = await api(`/api/posts/${id}/bookmark`, { method:'POST' }); toast(d.saved ? 'Guardado' : 'Eliminado de guardados'); await renderView(); }
  catch (e) { toast(e.message, 'error'); }
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
      <div class="comment-compose"><input id="commentText" maxlength="1000" placeholder="Escribe un comentario…" onkeydown="if(event.key==='Enter')sendComment(${postId})"><button class="btn primary compact" onclick="sendComment(${postId})">Enviar</button></div>`);
    setTimeout(() => $('#commentText')?.focus(), 50);
  } catch (e) { toast(e.message, 'error'); }
};

function commentHtml(c) {
  return `<div class="comment">${avatar(c, 'small')}<div class="comment-bubble"><div><button class="inline-person" onclick="closeModal();openProfile('${escapeAttr(c.username)}')"><b>${escapeHtml(c.name)}</b> <span>@${escapeHtml(c.username)}</span></button></div><p>${formatText(c.text)}</p><small>${timeAgo(c.created_at)}</small></div>${c.own ? `<button class="icon-btn tiny-btn" onclick="deleteComment(${c.id},${c.post_id})">×</button>` : ''}</div>`;
}

window.sendComment = async (postId) => {
  const input = $('#commentText'); const text = input?.value.trim(); if (!text) return;
  try { await api(`/api/posts/${postId}/comments`, { method:'POST', body:JSON.stringify({ text }) }); await openComments(postId); await refreshMe(false); }
  catch (e) { toast(e.message, 'error'); }
};
window.deleteComment = async (id, postId) => {
  try { await api(`/api/comments/${id}`, { method:'DELETE' }); await openComments(postId); }
  catch (e) { toast(e.message, 'error'); }
};

async function renderSearch() {
  $('#main').innerHTML = `${pageHeader('Buscar','Encuentra personas, publicaciones y hashtags')}
    <div class="card search-card"><div class="search-box"><span>⌕</span><input id="searchInput" value="${escapeAttr(state.search)}" placeholder="Buscar en OmniSocial" onkeydown="if(event.key==='Enter')runSearch()"><button class="btn primary compact" onclick="runSearch()">Buscar</button></div></div>
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
  return `<div class="user-row"><button class="person-link" onclick="openProfile('${escapeAttr(u.username)}')">${avatar(u)}<span><b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.username)}</small>${u.bio ? `<em>${escapeHtml(u.bio).slice(0,90)}</em>` : ''}</span></button><button class="btn ${u.following ? 'ghost' : 'primary'} compact follow-btn" onclick="toggleFollow(${u.id},'${escapeAttr(u.username)}')">${u.following ? 'Siguiendo' : 'Seguir'}</button></div>`;
}

window.openProfile = async (username) => { if (state.messagePoll) { clearInterval(state.messagePoll); state.messagePoll = null; } state.view = 'profile'; state.profile = username; layout(); await renderProfile(username); };

async function renderProfile(username) {
  const [u, posts] = await Promise.all([
    api('/api/users/' + encodeURIComponent(username)),
    api('/api/users/' + encodeURIComponent(username) + '/posts')
  ]);
  const website = u.website ? `<a class="profile-link" href="${escapeAttr(normalizeUrl(u.website))}" target="_blank" rel="noopener">↗ ${escapeHtml(u.website)}</a>` : '';
  $('#main').innerHTML = `<section class="card profile-card">
    <div class="profile-top">${avatar(u, 'xl')}<div class="profile-cta">${u.own ? `<button class="btn ghost compact" onclick="editProfile()">Editar perfil</button>` : `<button class="btn ghost compact" onclick="startMessage(${u.id})">Mensaje</button><button class="btn ${u.following ? 'ghost' : 'primary'} compact" onclick="toggleFollow(${u.id},'${escapeAttr(u.username)}')">${u.following ? 'Siguiendo' : 'Seguir'}</button>`}</div></div>
    <h2>${escapeHtml(u.name)}</h2><div class="handle">@${escapeHtml(u.username)}</div>
    ${u.bio ? `<p class="profile-bio">${formatText(u.bio)}</p>` : ''}
    <div class="profile-meta">${u.location ? `<span>⌖ ${escapeHtml(u.location)}</span>` : ''}${website}</div>
    <div class="profile-stats"><span><b>${u.posts_count}</b> publicaciones</span><span><b>${u.followers_count}</b> seguidores</span><span><b>${u.following_count}</b> siguiendo</span></div>
  </section>
  <div class="profile-section-title">Publicaciones</div>
  <div class="post-list">${posts.length ? posts.map(postHtml).join('') : `<div class="card empty"><h3>Sin publicaciones todavía</h3></div>`}</div>`;
}

function normalizeUrl(url) { return /^https?:\/\//i.test(url) ? url : `https://${url}`; }

window.toggleFollow = async (id, username = '') => {
  try { await api(`/api/users/${id}/follow`, { method:'POST' }); await refreshMe(false); if (state.view === 'profile' && username) await renderProfile(username); else await renderView(); }
  catch (e) { toast(e.message, 'error'); }
};

window.editProfile = () => {
  const u = state.me;
  modal(`<div class="modal-head"><h3>Editar perfil</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="edit-profile">
      <div class="edit-avatar-row">${avatar(u, 'large')}<label class="btn ghost compact">Cambiar foto<input type="file" id="avatarFile" accept="image/*" hidden></label></div>
      <label>Nombre<input id="editName" value="${escapeAttr(u.name)}" maxlength="100"></label>
      <label>Biografía<textarea id="editBio" maxlength="500" rows="4">${escapeHtml(u.bio || '')}</textarea></label>
      <label>Ubicación<input id="editLocation" value="${escapeAttr(u.location || '')}" maxlength="120" placeholder="Valencia, España"></label>
      <label>Web<input id="editWebsite" value="${escapeAttr(u.website || '')}" maxlength="500" placeholder="tusitio.com"></label>
      <button class="btn primary" onclick="saveProfile()">Guardar cambios</button>
    </div>`);
};

window.saveProfile = async () => {
  try {
    let avatarUrl = state.me.avatar || '';
    const file = $('#avatarFile')?.files?.[0];
    if (file) { const fd = new FormData(); fd.append('file', file); const up = await api('/api/upload', { method:'POST', body:fd }); avatarUrl = up.url; }
    await api('/api/me', { method:'PATCH', body:JSON.stringify({ name:$('#editName').value, bio:$('#editBio').value, location:$('#editLocation').value, website:$('#editWebsite').value, avatar:avatarUrl }) });
    closeModal(); await refreshMe(); state.profile = state.me.username; await renderProfile(state.me.username); toast('Perfil actualizado');
  } catch (e) { toast(e.message, 'error'); }
};

async function renderNotifications() {
  const rows = await api('/api/notifications');
  $('#main').innerHTML = `${pageHeader('Actividad','Lo que está pasando alrededor de tu perfil')}<div class="card notification-list">${rows.length ? rows.map(notificationHtml).join('') : `<div class="empty"><div class="empty-icon">♡</div><h3>Aún no hay actividad</h3><p>Cuando alguien te siga, dé like o comente, aparecerá aquí.</p></div>`}</div>`;
  await api('/api/notifications/read', { method:'POST' });
  state.me.unread_notifications = 0;
  setTimeout(() => { if (state.view === 'notifications') layoutNavOnly(); }, 100);
}

function notificationHtml(n) {
  const action = n.type === 'follow' ? 'ha empezado a seguirte' : n.type === 'like' ? 'ha indicado que le gusta tu publicación' : 'ha comentado tu publicación';
  return `<button class="notification ${n.read_at ? '' : 'unread'}" onclick="${n.type === 'follow' ? `openProfile('${escapeAttr(n.username)}')` : `openComments(${Number(n.post_id)})`}">${avatar(n,'small')}<span><b>${escapeHtml(n.name || n.username || 'Alguien')}</b> ${action}${n.type === 'comment' && n.text ? `<em>“${escapeHtml(n.text).slice(0,100)}”</em>` : ''}<small>${timeAgo(n.created_at)}</small></span></button>`;
}

function layoutNavOnly() {
  const desktop = $('#desktopNav');
  if (desktop) desktop.innerHTML = `${navButton('feed','⌂','Inicio')}${navButton('reels','▶','Reels')}${navButton('discover','✦','Descubrir')}${navButton('search','⌕','Buscar')}${navButton('messages','✉','Mensajes')}${navButton('notifications','♡','Actividad')}${navButton('bookmarks','▱','Guardados')}<button class="nav-item ${state.view === 'profile' ? 'active' : ''}" onclick="openProfile('${escapeAttr(state.me.username)}')"><span class="nav-icon">◎</span><span>Perfil</span></button>`;
}

async function loadRightbar() {
  const box = $('#rightbar'); if (!box) return;
  try {
    const [people, tags] = await Promise.all([api('/api/users'), api('/api/trending')]);
    const suggestions = people.slice(0, 4);
    box.innerHTML = `<div class="card side-card"><div class="side-title">Tu perfil</div><button class="profile-summary" onclick="openProfile('${escapeAttr(state.me.username)}')">${avatar(state.me)}<span><b>${escapeHtml(state.me.name)}</b><small>@${escapeHtml(state.me.username)}</small></span></button><div class="mini-stats"><span><b>${state.me.posts_count || 0}</b>posts</span><span><b>${state.me.followers_count || 0}</b>seguidores</span><span><b>${state.me.following_count || 0}</b>siguiendo</span></div></div>
      <div class="card side-card"><div class="side-title">Personas que descubrir</div>${suggestions.length ? suggestions.map(u => `<div class="side-user"><button onclick="openProfile('${escapeAttr(u.username)}')">${avatar(u,'small')}<span><b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.username)}</small></span></button><button class="text-btn" onclick="toggleFollow(${u.id})">${u.following ? 'Siguiendo' : 'Seguir'}</button></div>`).join('') : '<p class="muted">La comunidad acaba de empezar.</p>'}</div>
      <div class="card side-card"><div class="side-title">Tendencias</div>${tags.length ? tags.map(t => `<button class="trend" onclick="searchTag('${escapeAttr(t.tag)}')"><b>${escapeHtml(t.tag)}</b><small>${t.count} publicaciones</small></button>`).join('') : '<p class="muted">Los hashtags aparecerán aquí cuando se usen.</p>'}</div>
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

async function showStory() {
  clearTimeout(showStory.timer);
  const viewer = state.storyViewer; if (!viewer) return;
  const s = viewer.items[viewer.index]; if (!s) return closeStoryViewer();
  if (!s.own) api(`/api/stories/${s.id}/view`, { method:'POST' }).catch(()=>{});
  const media = s.media_type === 'video'
    ? `<video id="storyMedia" class="story-media" src="${escapeAttr(s.media_url)}" autoplay playsinline controls onended="nextStory(1)"></video>`
    : `<img class="story-media" src="${escapeAttr(s.media_url)}" alt="Story">`;
  $('#modal-root').innerHTML = `<div class="story-backdrop"><div class="story-viewer">
    <div class="story-progress">${viewer.items.map((_,i)=>`<span class="${i <= viewer.index ? 'done' : ''}"></span>`).join('')}</div>
    <div class="story-head"><button class="person-link" onclick="closeStoryViewer();openProfile('${escapeAttr(s.username)}')">${avatar(s,'small')}<span><b>${escapeHtml(s.name)}</b><small>@${escapeHtml(s.username)} · ${timeAgo(s.created_at)}</small></span></button><button class="story-close" onclick="closeStoryViewer()">×</button></div>
    <div class="story-stage">${media}${s.text ? `<div class="story-caption">${formatText(s.text)}</div>` : ''}<button class="story-prev" onclick="nextStory(-1)">‹</button><button class="story-next" onclick="nextStory(1)">›</button></div>
    ${s.own ? `<div class="story-owner-tools"><button onclick="showStoryViewers(${s.id})">👁 ${s.views_count || 0} visualizaciones</button><button class="danger-text" onclick="deleteStory(${s.id})">Eliminar</button></div>` : ''}
  </div></div>`;
  if (s.media_type === 'image') showStory.timer = setTimeout(() => nextStory(1), 6000);
}

window.nextStory = (delta) => {
  if (!state.storyViewer) return;
  const next = state.storyViewer.index + delta;
  if (next < 0) return;
  if (next >= state.storyViewer.items.length) return closeStoryViewer();
  state.storyViewer.index = next; showStory();
};

window.closeStoryViewer = () => { clearTimeout(showStory.timer); state.storyViewer = null; closeModal(); if (state.view === 'feed') renderFeed().catch(()=>{}); };

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
    <div class="reel-actions"><button class="reel-action ${p.liked?'liked':''}" onclick="likePost(${p.id})"><span>${p.liked?'♥':'♡'}</span><b>${p.likes_count}</b></button><button class="reel-action" onclick="openComments(${p.id})"><span>◌</span><b>${p.comments_count}</b></button><button class="reel-action ${p.saved?'saved':''}" onclick="savePost(${p.id})"><span>${p.saved?'▰':'▱'}</span></button></div>
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

// --- V0.5: Mensajes privados ----------------------------------------------
async function renderMessages() {
  const conversations = await api('/api/conversations');
  const isMobile = matchMedia('(max-width:860px)').matches;
  if (!state.activeConversation && !isMobile && conversations[0]) state.activeConversation = Number(conversations[0].id);
  const active = conversations.find(c => Number(c.id) === Number(state.activeConversation));
  let messages = [];
  if (active) messages = await api(`/api/conversations/${active.id}/messages`);
  $('#main').innerHTML = `${pageHeader('Mensajes','Conversaciones privadas dentro de OmniSocial')}
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
    if (state.messagePoll) clearInterval(state.messagePoll);
    state.messagePoll = setInterval(refreshActiveConversation, 5000);
  }
}

function conversationRow(c) {
  const preview = c.last_message ? c.last_message : c.last_media_type === 'image' ? '📷 Foto' : c.last_media_type === 'video' ? '🎬 Vídeo' : 'Nueva conversación';
  return `<button class="conversation-row ${Number(c.id)===Number(state.activeConversation)?'active':''}" onclick="openConversation(${c.id})">${avatar(c,'small')}<span class="conversation-copy"><b>${escapeHtml(c.name)}</b><small>${escapeHtml(preview).slice(0,65)}</small></span><span class="conversation-meta"><small>${c.last_message_at?timeAgo(c.last_message_at):''}</small>${Number(c.unread_count)>0?`<i>${Math.min(99,c.unread_count)}</i>`:''}</span></button>`;
}

function chatPanelHtml(c, messages, isMobile) {
  return `<div class="chat-header">${isMobile?`<button class="icon-btn chat-back" onclick="closeConversation()">‹</button>`:''}<button class="person-link" onclick="openProfile('${escapeAttr(c.username)}')">${avatar(c,'small')}<span><b>${escapeHtml(c.name)}</b><small>@${escapeHtml(c.username)}</small></span></button><button class="icon-btn" onclick="renderMessages()" title="Actualizar">↻</button></div>
    <div class="message-stream" id="messageStream">${messages.length ? messages.map(messageHtml).join('') : `<div class="chat-first"><b>Empieza la conversación con ${escapeHtml(c.name)}</b><span>Los mensajes son privados entre vosotros.</span></div>`}</div>
    <div id="messageMediaPreview"></div>
    <div class="message-compose"><label class="attach-btn">＋<input id="messageFile" type="file" accept="image/*,video/*" onchange="previewMessageFile(this)" hidden></label><textarea id="messageText" rows="1" maxlength="4000" placeholder="Escribe un mensaje…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage(${c.id})}"></textarea><button class="btn primary compact" onclick="sendMessage(${c.id})">Enviar</button></div>`;
}

function messageHtml(m) {
  const media = m.media_url ? (m.media_type === 'video' ? `<video class="message-media" src="${escapeAttr(m.media_url)}" controls></video>` : `<img class="message-media" src="${escapeAttr(m.media_url)}" alt="">`) : '';
  return `<div class="message ${m.own?'mine':'theirs'}"><div class="message-bubble">${m.text?`<p>${formatText(m.text)}</p>`:''}${media}<small>${timeAgo(m.created_at)}</small></div></div>`;
}

window.openConversation = async (id) => { state.activeConversation = Number(id); await renderMessages(); };
window.closeConversation = async () => { state.activeConversation = null; if(state.messagePoll){clearInterval(state.messagePoll);state.messagePoll=null;} await renderMessages(); };

window.startMessage = async (userId) => {
  try { const d = await api(`/api/conversations/direct/${userId}`, { method:'POST' }); state.view='messages'; state.activeConversation=Number(d.id); layout(); await renderMessages(); }
  catch(e){ toast(e.message,'error'); }
};

window.newMessage = async () => {
  try {
    const users = await api('/api/users');
    modal(`<div class="modal-head"><h3>Nuevo mensaje</h3><button class="icon-btn" onclick="closeModal()">×</button></div><div class="new-message-list">${users.length ? users.map(u=>`<button class="person-link new-message-user" onclick="closeModal();startMessage(${u.id})">${avatar(u,'small')}<span><b>${escapeHtml(u.name)}</b><small>@${escapeHtml(u.username)}</small></span><i>›</i></button>`).join('') : '<div class="empty compact-empty">No hay más usuarios todavía.</div>'}</div>`);
  } catch(e){ toast(e.message,'error'); }
};

window.previewMessageFile = (input) => {
  const f=input.files?.[0], box=$('#messageMediaPreview'); if(!f||!box) return;
  const url=URL.createObjectURL(f); box.innerHTML=`<div class="message-preview">${f.type.startsWith('video/')?`<video src="${url}" controls></video>`:`<img src="${url}" alt="">`}<button onclick="clearMessageFile()">×</button></div>`;
};
window.clearMessageFile = () => { if($('#messageFile')) $('#messageFile').value=''; if($('#messageMediaPreview')) $('#messageMediaPreview').innerHTML=''; };

window.sendMessage = async (conversationId) => {
  const input=$('#messageText'); const text=input?.value.trim()||''; const file=$('#messageFile')?.files?.[0];
  if(!text&&!file) return;
  try {
    let media_id=null;
    if(file){ const fd=new FormData(); fd.append('file',file); const up=await api('/api/upload',{method:'POST',body:fd}); media_id=up.media_id; }
    await api(`/api/conversations/${conversationId}/messages`,{method:'POST',body:JSON.stringify({text,media_id})});
    if(input) input.value=''; clearMessageFile(); await renderMessages();
  } catch(e){ toast(e.message,'error'); }
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

async function refreshMe(rebuild = true) {
  state.me = await api('/api/me');
  if (rebuild) layout();
  else loadRightbar();
}

async function init() {
  if (!state.token) return authScreen();
  try {
    state.me = await api('/api/me');
    layout();
    await renderView();
  } catch {
    logout();
  }
}

init();
