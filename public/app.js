const state = { token: localStorage.getItem('token') || '', me: null, view: 'feed' };
const $ = (s) => document.querySelector(s);

async function api(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const r = await fetch(url, { ...opts, headers });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Error');
  return data;
}

function escapeHtml(t = '') {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function av(u) {
  return `<div class="avatar">${u.avatar ? `<img src="${escapeHtml(u.avatar)}">` : (u.name || u.username || '?').slice(0, 1).toUpperCase()}</div>`;
}

function authScreen() {
  $('#app').innerHTML = `<div class="auth-wrap card"><div class="brand">OmniSocial</div><p class="muted">Tu comunidad. Todas tus redes. Un solo lugar.</p><div class="tabs"><button class="btn primary" onclick="showAuth('login')">Entrar</button><button class="btn" onclick="showAuth('register')">Crear cuenta</button></div><div id="authbox"></div></div>`;
  showAuth('login');
}

window.showAuth = (mode) => {
  $('#authbox').innerHTML = mode === 'login'
    ? `<div class="auth"><input id="loginid" placeholder="Email o usuario"><input id="loginpass" type="password" placeholder="Contraseña"><button class="btn primary" onclick="login()">Entrar</button></div>`
    : `<div class="auth"><input id="regname" placeholder="Nombre"><input id="reguser" placeholder="Usuario"><input id="regemail" placeholder="Email"><input id="regpass" type="password" placeholder="Contraseña"><button class="btn primary" onclick="register()">Crear cuenta</button></div>`;
};

window.login = async () => {
  try {
    const d = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ emailOrUsername: $('#loginid').value, password: $('#loginpass').value }) });
    state.token = d.token;
    localStorage.setItem('token', d.token);
    init();
  } catch (e) { alert(e.message); }
};

window.register = async () => {
  try {
    const d = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: $('#regname').value, username: $('#reguser').value, email: $('#regemail').value, password: $('#regpass').value }) });
    state.token = d.token;
    localStorage.setItem('token', d.token);
    init();
  } catch (e) { alert(e.message); }
};

function layout() {
  $('#app').innerHTML = `<div class="topbar"><div class="brand">OmniSocial</div><button class="btn" style="width:auto" onclick="logout()">Salir</button></div><div class="shell"><aside class="left"><div class="card"><div class="brand">OmniSocial</div><p class="muted">@${escapeHtml(state.me.username)}</p><div class="nav"><button onclick="go('feed')">🏠 Inicio</button><button onclick="go('discover')">🌍 Descubrir</button><button onclick="go('people')">👥 Personas</button><button onclick="go('networks')">🔗 Mis redes</button><button onclick="go('status')">🚀 Distribución</button><button onclick="logout()">↪ Salir</button></div></div></aside><main class="main" id="main"></main><aside class="right"><div class="card"><div class="row">${av(state.me)}<div><b>${escapeHtml(state.me.name)}</b><div class="muted">@${escapeHtml(state.me.username)}</div></div></div><p>${escapeHtml(state.me.bio || 'Tu perfil está listo para empezar.')}</p><span class="badge">V0.3</span></div><div class="card" style="margin-top:14px"><b>Meta real</b><p class="muted">Facebook Pages e Instagram profesional ya pueden conectarse mediante OAuth y recibir tus publicaciones.</p></div></aside></div><nav class="mobile-dock"><button onclick="go('feed')">🏠<span>Inicio</span></button><button onclick="go('discover')">🌍<span>Descubrir</span></button><button onclick="go('people')">👥<span>Personas</span></button><button onclick="go('networks')">🔗<span>Redes</span></button><button onclick="go('status')">🚀<span>Estado</span></button></nav>`;
}

window.go = (v) => { state.view = v; renderView(); };
window.logout = () => { localStorage.removeItem('token'); state.token = ''; state.me = null; authScreen(); };

async function renderView() {
  if (state.view === 'feed') return feed(false);
  if (state.view === 'discover') return feed(true);
  if (state.view === 'people') return people();
  if (state.view === 'networks') return networks();
  if (state.view === 'status') return status();
}

async function feed(discover) {
  const networks = await api('/api/social-accounts');
  const real = networks.filter(n => ['facebook', 'instagram'].includes(n.provider));
  $('#main').innerHTML = `<div class="card composer"><div class="row">${av(state.me)}<div><b>Crear publicación</b><div class="muted">Se publica siempre en OmniSocial. Elige también tus redes conectadas.</div></div></div><textarea id="posttext" rows="3" placeholder="¿Qué quieres compartir?"></textarea><input type="file" id="media" accept="image/*,video/*"><div class="checks">${real.map(n => `<label class="check ${n.status !== 'connected' ? 'disabled' : ''}"><input type="checkbox" value="${n.provider}" ${n.status !== 'connected' ? 'disabled' : ''}> ${n.provider === 'facebook' ? '🔵 Facebook' : '📸 Instagram'} ${n.status === 'connected' ? '✓' : ''}</label>`).join('')}</div><div class="muted tiny">Instagram necesita foto o vídeo. Los vídeos se publican como Reels.</div><button class="btn primary" onclick="createPost()">Publicar ahora</button></div><div id="posts"></div>`;
  const rows = await api(discover ? '/api/discover' : '/api/feed');
  $('#posts').innerHTML = rows.length ? rows.map(postHtml).join('') : `<div class="card" style="margin-top:14px"><b>Aún no hay publicaciones.</b><p class="muted">Crea la primera o sigue a otras personas.</p></div>`;
}

function postHtml(p) {
  const media = p.media_url ? (p.media_type === 'video' ? `<video class="post-media" src="${p.media_url}" controls></video>` : `<img class="post-media" src="${p.media_url}">`) : '';
  return `<article class="card post"><div class="row">${av(p)}<div><b>${escapeHtml(p.name)}</b><div class="muted">@${escapeHtml(p.username)} · ${p.source === 'native' ? 'OmniSocial' : escapeHtml(p.source)}</div></div></div><p>${escapeHtml(p.text)}</p>${media}<div class="post-actions"><button onclick="like(${p.id})">${p.liked ? '❤️' : '🤍'} ${p.likes_count}</button><button onclick="comment(${p.id})">💬 ${p.comments_count}</button></div></article>`;
}

window.createPost = async () => {
  try {
    let media_id = null, media_type = 'none';
    const f = $('#media').files[0];
    if (f) {
      const fd = new FormData();
      fd.append('file', f);
      const up = await api('/api/upload', { method: 'POST', body: fd });
      media_id = up.media_id;
      media_type = up.mime.startsWith('video/') ? 'video' : 'image';
    }
    const publish_to = [...document.querySelectorAll('.check input:checked')].map(x => x.value);
    const result = await api('/api/posts', { method: 'POST', body: JSON.stringify({ text: $('#posttext').value, media_id, media_type, publish_to }) });
    if (result.queued?.length) alert(`Publicado en OmniSocial. Enviando también a: ${result.queued.join(', ')}.`);
    await feed(state.view === 'discover');
  } catch (e) { alert(e.message); }
};

window.like = async (id) => { await api(`/api/posts/${id}/like`, { method: 'POST' }); renderView(); };
window.comment = async (id) => { const text = prompt('Comentario:'); if (!text) return; await api(`/api/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) }); renderView(); };

async function people() {
  const rows = await api('/api/users');
  $('#main').innerHTML = `<div class="card"><b>Descubrir personas</b><p class="muted">Sigue usuarios para llenar tu feed.</p>${rows.map(u => `<div class="user-item"><div class="row">${av(u)}<div><b>${escapeHtml(u.name)}</b><div class="muted">@${escapeHtml(u.username)}</div></div></div><button class="btn" style="width:auto" onclick="follow(${u.id})">Seguir / dejar</button></div>`).join('') || '<p class="muted">No hay más usuarios todavía.</p>'}</div>`;
}
window.follow = async (id) => { await api(`/api/users/${id}/follow`, { method: 'POST' }); people(); };

const providerInfo = {
  facebook: ['🔵', 'Facebook Page'],
  instagram: ['📸', 'Instagram profesional'],
  tiktok: ['🎵', 'TikTok'],
  youtube: ['▶️', 'YouTube'],
  x: ['𝕏', 'X']
};

async function networks() {
  const [rows, config, pages] = await Promise.all([
    api('/api/social-accounts'),
    api('/api/meta/config'),
    api('/api/meta/pages')
  ]);
  const metaRows = rows.filter(n => ['facebook', 'instagram'].includes(n.provider));
  const laterRows = rows.filter(n => !['facebook', 'instagram'].includes(n.provider));

  const pageChooser = pages.length > 1 ? `<div class="section-box"><b>Elige la Página de Facebook que usará OmniSocial</b><p class="muted">Si tiene una cuenta profesional de Instagram vinculada, conectaremos las dos.</p>${pages.map(p => `<div class="page-choice ${p.selected ? 'selected' : ''}"><div><b>${escapeHtml(p.page_name)}</b><div class="muted">${p.instagram_id ? `Instagram: @${escapeHtml(p.instagram_username || p.instagram_name || 'vinculado')}` : 'Sin Instagram profesional vinculado'}</div></div><button class="btn" style="width:auto" onclick="selectMetaPage('${escapeHtml(p.page_id)}')">${p.selected ? 'Seleccionada' : 'Usar esta'}</button></div>`).join('')}</div>` : '';

  $('#main').innerHTML = `<div class="card"><div class="network-head"><div><b>Mis redes</b><p class="muted">Conecta Meta una sola vez para publicar desde OmniSocial hacia Facebook Pages e Instagram profesional.</p></div><button class="btn primary" style="width:auto" onclick="connectMeta()">${metaRows.some(n => n.status === 'connected') ? 'Reconectar Meta' : 'Conectar Meta'}</button></div>${!config.configured ? `<div class="notice warn"><b>Falta configurar Meta en Render.</b><br>Añade META_APP_ID y META_APP_SECRET. Callback OAuth: <code>${escapeHtml(config.redirect_uri)}</code></div>` : `<div class="notice ok">Meta preparado · Graph API ${escapeHtml(config.graph_version)}</div>`}${pageChooser}<div class="network-grid">${metaRows.map(networkCard).join('')}</div><h3>Próximas conexiones</h3>${laterRows.map(n => `<div class="network"><div><b>${providerInfo[n.provider]?.[0] || ''} ${providerInfo[n.provider]?.[1] || n.provider}</b><div class="muted">Próximamente</div></div><span class="badge">V0.4+</span></div>`).join('')}</div>`;
}

function networkCard(n) {
  const info = providerInfo[n.provider] || ['', n.provider];
  const connected = n.status === 'connected';
  const label = n.provider === 'instagram' && n.external_username ? `@${n.external_username}` : (n.external_name || n.external_username || 'Sin conectar');
  return `<div class="network-card"><div class="row"><div class="network-icon">${info[0]}</div><div><b>${info[1]}</b><div class="muted">${escapeHtml(label)}</div></div></div><div class="connection-state"><span class="dot ${connected ? 'on' : ''}"></span>${connected ? 'Conectado' : 'Desconectado'}</div>${n.last_error ? `<div class="tiny error-text">${escapeHtml(n.last_error)}</div>` : ''}${connected ? `<button class="btn ghost" onclick="disconnectNetwork('${n.provider}')">Desconectar</button>` : ''}</div>`;
}

window.connectMeta = async () => {
  try {
    const d = await api('/api/meta/oauth/start');
    window.location.href = d.url;
  } catch (e) { alert(e.message); }
};
window.selectMetaPage = async (page_id) => {
  try { await api('/api/meta/select-page', { method: 'POST', body: JSON.stringify({ page_id }) }); await networks(); }
  catch (e) { alert(e.message); }
};
window.disconnectNetwork = async (provider) => {
  if (!confirm(`¿Desconectar ${provider}?`)) return;
  await api(`/api/social-accounts/${provider}/disconnect`, { method: 'POST' });
  networks();
};

const statusText = { queued: 'Pendiente', publishing: 'Publicando…', published: 'Publicado', error: 'Error' };
async function status() {
  const rows = await api('/api/cross-posts');
  $('#main').innerHTML = `<div class="card"><b>Distribución multired</b><p class="muted">Aquí ves el resultado real de cada envío a Facebook e Instagram.</p>${rows.map(r => `<div class="distribution"><div><b>${r.provider === 'facebook' ? '🔵 FACEBOOK' : '📸 INSTAGRAM'}</b><div class="muted">${escapeHtml(r.text).slice(0, 90) || (r.media_type === 'video' ? 'Vídeo' : 'Imagen')}</div>${r.error ? `<div class="error-text tiny">${escapeHtml(r.error)}</div>` : ''}</div><div class="distribution-actions"><span class="badge status-${r.status}">${statusText[r.status] || escapeHtml(r.status)}</span>${r.external_url ? `<a class="btn ghost mini" href="${escapeHtml(r.external_url)}" target="_blank" rel="noopener">Ver post</a>` : ''}${r.status === 'error' ? `<button class="btn mini" onclick="retryCrossPost(${r.id})">Reintentar</button>` : ''}</div></div>`).join('') || '<p class="muted">Aún no has enviado ningún post a otras redes.</p>'}</div>`;
}
window.retryCrossPost = async (id) => { await api(`/api/cross-posts/${id}/retry`, { method: 'POST' }); status(); };

function oauthMessage() {
  const params = new URLSearchParams(location.search);
  const meta = params.get('meta');
  if (!meta) return;
  if (meta === 'connected') alert('Meta conectado correctamente. Facebook e Instagram ya están listos si la página tiene Instagram profesional vinculado.');
  if (meta === 'choose') { state.view = 'networks'; alert('Meta conectado. Elige ahora qué Página de Facebook quieres utilizar.'); }
  if (meta === 'no_pages') { state.view = 'networks'; alert('Meta no devolvió ninguna Página administrada por esta cuenta.'); }
  if (meta === 'error') { state.view = 'networks'; alert('No se pudo conectar Meta: ' + (params.get('message') || 'error desconocido')); }
  history.replaceState({}, '', location.pathname);
}

async function init() {
  if (!state.token) return authScreen();
  try {
    state.me = await api('/api/me');
    oauthMessage();
    layout();
    renderView();
  } catch { logout(); }
}
init();
