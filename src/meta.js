const { encrypt, decrypt } = require('./crypto');

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v26.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function configured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

function metaError(data, fallback = 'Error de Meta') {
  const err = new Error(data?.error?.message || fallback);
  err.meta = data?.error || null;
  err.status = 502;
  return err;
}

async function graphGet(path, params = {}) {
  const url = new URL(`${GRAPH_BASE}/${String(path).replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw metaError(data);
  return data;
}

async function graphPost(path, params = {}, headers = {}) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) body.set(key, String(value));
  }
  const response = await fetch(`${GRAPH_BASE}/${String(path).replace(/^\//, '')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw metaError(data);
  return data;
}

async function exchangeCode({ code, redirectUri }) {
  const shortToken = await graphGet('oauth/access_token', {
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri: redirectUri,
    code
  });

  // Cambiamos a token de usuario de larga duración cuando Meta lo permite.
  try {
    const longToken = await graphGet('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      fb_exchange_token: shortToken.access_token
    });
    return longToken;
  } catch {
    return shortToken;
  }
}

async function listManagedPages(userAccessToken) {
  const result = await graphGet('me/accounts', {
    fields: 'id,name,access_token,tasks,instagram_business_account',
    limit: '100',
    access_token: userAccessToken
  });

  const pages = [];
  for (const item of result.data || []) {
    let instagram = null;
    const igId = item.instagram_business_account?.id;
    if (igId) {
      try {
        const ig = await graphGet(igId, {
          fields: 'id,username,name,profile_picture_url',
          access_token: item.access_token
        });
        instagram = {
          id: ig.id,
          username: ig.username || '',
          name: ig.name || '',
          profile_picture_url: ig.profile_picture_url || ''
        };
      } catch {
        instagram = { id: igId, username: '', name: '', profile_picture_url: '' };
      }
    }
    pages.push({
      id: item.id,
      name: item.name || '',
      access_token_enc: encrypt(item.access_token),
      tasks: Array.isArray(item.tasks) ? item.tasks : [],
      instagram
    });
  }
  return pages;
}

function absoluteBaseUrl() {
  return String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
}

async function publishFacebook({ account, post }) {
  const pageToken = decrypt(account.access_token_enc);
  const pageId = account.external_id;
  if (!pageToken || !pageId) throw new Error('Facebook no está conectado correctamente');

  if (post.media_type === 'image' && post.media_id) {
    const baseUrl = absoluteBaseUrl();
    if (!baseUrl) throw new Error('Falta PUBLIC_BASE_URL para publicar archivos');
    const data = await graphPost(`${pageId}/photos`, {
      url: `${baseUrl}/media/${post.media_id}`,
      caption: post.text || '',
      access_token: pageToken
    });
    const targetId = data.post_id || data.id || '';
    let permalink = '';
    if (targetId) {
      try {
        const info = await graphGet(targetId, { fields: 'permalink_url', access_token: pageToken });
        permalink = info.permalink_url || '';
      } catch {}
    }
    return { id: targetId, url: permalink };
  }

  if (post.media_type === 'video' && post.media_id) {
    return publishFacebookReel({ pageToken, post });
  }

  const data = await graphPost(`${pageId}/feed`, {
    message: post.text || '',
    access_token: pageToken
  });
  let permalink = '';
  if (data.id) {
    try {
      const info = await graphGet(data.id, { fields: 'permalink_url', access_token: pageToken });
      permalink = info.permalink_url || '';
    } catch {}
  }
  return { id: data.id || '', url: permalink };
}

async function publishFacebookReel({ pageToken, post }) {
  const baseUrl = absoluteBaseUrl();
  if (!baseUrl) throw new Error('Falta PUBLIC_BASE_URL para publicar vídeos');
  const start = await graphPost('me/video_reels', {
    access_token: pageToken,
    upload_phase: 'start'
  });
  if (!start.video_id || !start.upload_url) throw new Error('Meta no devolvió sesión de vídeo');

  const upload = await fetch(start.upload_url, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${pageToken}`,
      file_url: `${baseUrl}/media/${post.media_id}`
    }
  });
  const uploadData = await upload.json().catch(() => ({}));
  if (!upload.ok || uploadData.success !== true) throw metaError(uploadData, 'No se pudo subir el Reel a Facebook');

  const finish = await graphPost('me/video_reels', {
    access_token: pageToken,
    video_id: start.video_id,
    upload_phase: 'finish',
    video_state: 'PUBLISHED',
    description: post.text || ''
  });
  if (finish.success !== true) throw new Error('Facebook no confirmó la publicación del Reel');
  return { id: start.video_id, url: '' };
}

async function waitForInstagramContainer(containerId, pageToken) {
  for (let i = 0; i < 20; i += 1) {
    const status = await graphGet(containerId, {
      fields: 'status_code,status',
      access_token: pageToken
    });
    if (status.status_code === 'FINISHED') return status;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error(status.status || `Instagram devolvió ${status.status_code}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error('Instagram sigue procesando el vídeo. Reintenta en unos minutos.');
}

async function publishInstagram({ account, post }) {
  const pageToken = decrypt(account.access_token_enc);
  const igId = account.external_id;
  if (!pageToken || !igId) throw new Error('Instagram no está conectado correctamente');
  if (!post.media_id || post.media_type === 'none') {
    throw new Error('Instagram necesita una imagen o vídeo para esta publicación');
  }
  const baseUrl = absoluteBaseUrl();
  if (!baseUrl) throw new Error('Falta PUBLIC_BASE_URL para publicar archivos');

  const params = {
    caption: post.text || '',
    access_token: pageToken
  };
  if (post.media_type === 'video') {
    params.media_type = 'REELS';
    params.video_url = `${baseUrl}/media/${post.media_id}`;
    params.share_to_feed = 'true';
  } else {
    params.image_url = `${baseUrl}/media/${post.media_id}`;
  }

  const container = await graphPost(`${igId}/media`, params);
  if (!container.id) throw new Error('Instagram no devolvió un contenedor de publicación');
  if (post.media_type === 'video') await waitForInstagramContainer(container.id, pageToken);

  const published = await graphPost(`${igId}/media_publish`, {
    creation_id: container.id,
    access_token: pageToken
  });
  let permalink = '';
  if (published.id) {
    try {
      const info = await graphGet(published.id, { fields: 'permalink', access_token: pageToken });
      permalink = info.permalink || '';
    } catch {}
  }
  return { id: published.id || '', url: permalink };
}

module.exports = {
  configured,
  GRAPH_VERSION,
  exchangeCode,
  listManagedPages,
  publishFacebook,
  publishInstagram
};
