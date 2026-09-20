const state = {
  token: localStorage.getItem('token') || '',
  me: null,
  view: 'feed',
  profile: null,
  search: '',
  busy: false
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
  const badge = view === 'notifications' && Number(state.me?.unread_notifications) > 0 ? `<span class="nav-badge">${Math.min(99, state.me.unread_notifications)}</span>` : '';
  return `<button class="nav-item ${active}" onclick="go('${view}')"><span class="nav-icon">${icon}</span><span>${label}</span>${badge}</button>`;
}

function layout() {
  $('#app').innerHTML = `
    <header class="topbar">
      <button class="brand-button brand" onclick="go('feed')">OmniSocial</button>
      <button class="top-avatar" onclick="openProfile('${escapeAttr(state.me.username)}')">${avatar(state.me, 'small')}</button>
    </header>
    <div class="shell">
      <aside class="left-col">
        <div class="left-sticky">
          <button class="brand-button brand desktop-brand" onclick="go('feed')">OmniSocial</button>
          <nav class="nav" id="desktopNav">
            ${navButton('feed','⌂','Inicio')}
            ${navButton('discover','✦','Descubrir')}
            ${navButton('search','⌕','Buscar')}
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
      ${navButton('discover','✦','Descubrir')}
      ${navButton('search','⌕','Buscar')}
      ${navButton('notifications','♡','Actividad')}
      <button class="nav-item ${state.view === 'profile' ? 'active' : ''}" onclick="openProfile('${escapeAttr(state.me.username)}')"><span class="nav-icon">◎</span><span>Perfil</span></button>
    </nav>`;
  loadRightbar();
}

window.logout = () => {
  localStorage.removeItem('token'); state.token = ''; state.me = null; state.view = 'feed'; authScreen();
};

window.go = async (view) => {
  state.view = view;
  if (view !== 'profile') state.profile = null;
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
    if (state.view === 'discover') return renderDiscover();
    if (state.view === 'search') return renderSearch();
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
  const rows = await api('/api/feed');
  $('#main').innerHTML = `${pageHeader('Inicio','Publicaciones tuyas y de las personas que sigues')}${composer()}<div class="post-list">${rows.length ? rows.map(postHtml).join('') : `<div class="card empty"><div class="empty-icon">👋</div><h3>Tu feed está empezando</h3><p>Sigue a algunas personas desde Descubrir o publica algo tú.</p><button class="btn primary" onclick="go('discover')">Descubrir comunidad</button></div>`}</div>`;
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

window.openProfile = async (username) => { state.view = 'profile'; state.profile = username; layout(); await renderProfile(username); };

async function renderProfile(username) {
  const [u, posts] = await Promise.all([
    api('/api/users/' + encodeURIComponent(username)),
    api('/api/users/' + encodeURIComponent(username) + '/posts')
  ]);
  const website = u.website ? `<a class="profile-link" href="${escapeAttr(normalizeUrl(u.website))}" target="_blank" rel="noopener">↗ ${escapeHtml(u.website)}</a>` : '';
  $('#main').innerHTML = `<section class="card profile-card">
    <div class="profile-top">${avatar(u, 'xl')}<div class="profile-cta">${u.own ? `<button class="btn ghost compact" onclick="editProfile()">Editar perfil</button>` : `<button class="btn ${u.following ? 'ghost' : 'primary'} compact" onclick="toggleFollow(${u.id},'${escapeAttr(u.username)}')">${u.following ? 'Siguiendo' : 'Seguir'}</button>`}</div></div>
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
  if (desktop) desktop.innerHTML = `${navButton('feed','⌂','Inicio')}${navButton('discover','✦','Descubrir')}${navButton('search','⌕','Buscar')}${navButton('notifications','♡','Actividad')}${navButton('bookmarks','▱','Guardados')}<button class="nav-item ${state.view === 'profile' ? 'active' : ''}" onclick="openProfile('${escapeAttr(state.me.username)}')"><span class="nav-icon">◎</span><span>Perfil</span></button>`;
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
