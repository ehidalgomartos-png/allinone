const crypto = require('crypto');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');

const cleanHost = value => String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/,'');
const cleanBase = value => String(value || '').trim().replace(/\/+$/,'');

function cloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_URL);
}

function bunnyStorageConfigured() {
  return Boolean(process.env.BUNNY_STORAGE_ZONE && process.env.BUNNY_STORAGE_KEY && process.env.BUNNY_CDN_HOST && process.env.BUNNY_CDN_TOKEN_KEY);
}

function bunnyStreamConfigured() {
  return Boolean(process.env.BUNNY_STREAM_LIBRARY_ID && process.env.BUNNY_STREAM_API_KEY && process.env.BUNNY_STREAM_CDN_HOST && process.env.BUNNY_STREAM_TOKEN_KEY);
}

function cloudinaryUploadFallbackAllowed() {
  return cloudinaryConfigured() && String(process.env.ALLOW_CLOUDINARY_UPLOAD_FALLBACK || 'false').toLowerCase() === 'true';
}

function imageUploadConfigured() {
  return bunnyStorageConfigured() || cloudinaryUploadFallbackAllowed();
}

function videoUploadConfigured() {
  return bunnyStreamConfigured() || cloudinaryUploadFallbackAllowed();
}

function configured() {
  return imageUploadConfigured() || videoUploadConfigured() || cloudinaryConfigured();
}

function providerSummary() {
  return {
    configured: configured(),
    images: bunnyStorageConfigured() ? 'bunny_storage' : (cloudinaryUploadFallbackAllowed() ? 'cloudinary_fallback' : 'not-configured'),
    videos: bunnyStreamConfigured() ? 'bunny_stream' : (cloudinaryUploadFallbackAllowed() ? 'cloudinary_fallback' : 'not-configured'),
    legacy_cloudinary: cloudinaryConfigured(),
    cloudinary_upload_fallback: cloudinaryUploadFallbackAllowed()
  };
}

function resourceTypeFromMime(mime='') {
  return String(mime).startsWith('video/') ? 'video' : 'image';
}

function safeExt(originalName='', mimeType='') {
  const ext = path.extname(String(originalName || '')).toLowerCase().replace(/[^.a-z0-9]/g,'');
  if (ext && ext.length <= 10) return ext;
  const mime = String(mimeType || '').toLowerCase();
  const map = {
    'image/jpeg':'.jpg','image/jpg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif','image/avif':'.avif',
    'video/mp4':'.mp4','video/webm':'.webm','video/quicktime':'.mov','video/x-m4v':'.m4v'
  };
  return map[mime] || '';
}

function bunnyStorageEndpoint() {
  const configuredEndpoint = cleanBase(process.env.BUNNY_STORAGE_ENDPOINT);
  if (configuredEndpoint) return configuredEndpoint;
  return `https://storage.bunnycdn.com/${encodeURIComponent(String(process.env.BUNNY_STORAGE_ZONE || '').trim())}`;
}

function bunnyCdnBase() {
  const host = cleanHost(process.env.BUNNY_CDN_HOST);
  return host ? `https://${host}` : '';
}

function bunnyStreamCdnBase() {
  const host = cleanHost(process.env.BUNNY_STREAM_CDN_HOST);
  return host ? `https://${host}` : '';
}

function bunnyStreamApiBase() {
  return `https://video.bunnycdn.com/library/${encodeURIComponent(String(process.env.BUNNY_STREAM_LIBRARY_ID || '').trim())}`;
}

function base64Url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

// Compatible con el firmador oficial Bunny Token Authentication (HS256).
function signBunnyUrl(url, securityKey, { ttlSeconds=300, isDirectory=false, pathAllowed='' } = {}) {
  if (!securityKey) throw new Error('Falta la clave de Token Authentication de Bunny');
  const parsed = new URL(url);
  const expires = String(Math.floor(Date.now() / 1000) + Math.max(30, Number(ttlSeconds) || 300));
  const parameters = {};
  if (pathAllowed) parameters.token_path = pathAllowed;
  const sortedEntries = Object.entries(parameters).sort(([a],[b]) => a.localeCompare(b));
  const signingData = sortedEntries.map(([k,v]) => `${k}=${v}`).join('&');
  const urlData = sortedEntries.map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const signaturePath = pathAllowed || parsed.pathname;
  const hmac = crypto.createHmac('sha256', securityKey);
  hmac.update(signaturePath);
  hmac.update(expires);
  hmac.update(Buffer.alloc(0));
  hmac.update(signingData);
  const token = `HS256-${base64Url(hmac.digest())}`;
  const base = `${parsed.protocol}//${parsed.host}`;
  const tail = urlData ? `&${urlData}` : '';
  if (isDirectory) return `${base}/bcdn_token=${token}${tail}&expires=${expires}${parsed.pathname}`;
  return `${base}${parsed.pathname}?token=${token}${tail}&expires=${expires}`;
}

async function bunnyStorageUpload(buffer, { mimeType='', originalName='', userId } = {}) {
  if (!bunnyStorageConfigured()) throw new Error('Bunny Storage no está configurado');
  const ext = safeExt(originalName, mimeType) || '.bin';
  const remotePath = `users/${Number(userId) || 0}/images/${crypto.randomUUID()}${ext}`;
  const endpoint = `${bunnyStorageEndpoint()}/${remotePath.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(endpoint, {
    method:'PUT',
    headers:{
      AccessKey:String(process.env.BUNNY_STORAGE_KEY),
      'Content-Type': mimeType || 'application/octet-stream'
    },
    body:buffer
  });
  if (!response.ok) {
    const body = await response.text().catch(()=>'');
    throw new Error(`Bunny Storage upload ${response.status}: ${body.slice(0,300)}`);
  }
  return {
    provider:'bunny_storage',
    providerId:remotePath,
    secureUrl:`${bunnyCdnBase()}/${remotePath}`,
    resourceType:'image',
    deliveryType:'token',
    width:null,
    height:null,
    durationSeconds:null,
    format:ext.replace(/^\./,''),
    sizeBytes:Number(buffer.length || 0),
    providerStatus:'ready'
  };
}

async function bunnyStreamUpload(buffer, { mimeType='', originalName='', userId } = {}) {
  if (!bunnyStreamConfigured()) throw new Error('Bunny Stream no está configurado');
  const apiBase = bunnyStreamApiBase();
  const title = String(originalName || `instant-admirers-${Date.now()}`).slice(0,200);
  const create = await fetch(`${apiBase}/videos`, {
    method:'POST',
    headers:{ AccessKey:String(process.env.BUNNY_STREAM_API_KEY), 'Content-Type':'application/json' },
    body:JSON.stringify({ title })
  });
  if (!create.ok) {
    const body = await create.text().catch(()=>'');
    throw new Error(`Bunny Stream create ${create.status}: ${body.slice(0,300)}`);
  }
  const created = await create.json();
  const guid = String(created.guid || created.videoId || '').trim();
  if (!guid) throw new Error('Bunny Stream no devolvió el GUID del vídeo');
  try {
    const upload = await fetch(`${apiBase}/videos/${encodeURIComponent(guid)}`, {
      method:'PUT',
      headers:{ AccessKey:String(process.env.BUNNY_STREAM_API_KEY), 'Content-Type':'application/octet-stream' },
      body:buffer
    });
    if (!upload.ok) {
      const body = await upload.text().catch(()=>'');
      throw new Error(`Bunny Stream upload ${upload.status}: ${body.slice(0,300)}`);
    }
  } catch (err) {
    await fetch(`${apiBase}/videos/${encodeURIComponent(guid)}`, { method:'DELETE', headers:{AccessKey:String(process.env.BUNNY_STREAM_API_KEY)} }).catch(()=>{});
    throw err;
  }
  return {
    provider:'bunny_stream',
    providerId:guid,
    secureUrl:`${bunnyStreamCdnBase()}/${guid}/playlist.m3u8`,
    resourceType:'video',
    deliveryType:'hls',
    width:null,
    height:null,
    durationSeconds:null,
    format:'hls',
    sizeBytes:Number(buffer.length || 0),
    providerStatus:'processing'
  };
}

function uploadCloudinary(buffer, { mimeType='', originalName='', userId, privateDelivery=false } = {}) {
  if (!cloudinaryConfigured()) throw new Error('Cloudinary no está configurado');
  const resourceType = resourceTypeFromMime(mimeType);
  const folder = `instant-admirers/${resourceType}s/user_${userId}`;
  const deliveryType = privateDelivery ? 'authenticated' : 'upload';
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      resource_type: resourceType,
      type: deliveryType,
      folder,
      use_filename: false,
      unique_filename: true,
      overwrite: false,
      tags: ['instant-admirers', `user_${userId}`],
      context: originalName ? { original_name: String(originalName).slice(0,255) } : undefined
    }, (err, result) => {
      if (err) return reject(err);
      resolve({
        provider:'cloudinary', providerId:result.public_id, secureUrl:result.secure_url,
        resourceType:result.resource_type || resourceType, deliveryType:result.type || deliveryType,
        width:Number.isFinite(result.width) ? result.width : null,
        height:Number.isFinite(result.height) ? result.height : null,
        durationSeconds:Number.isFinite(result.duration) ? result.duration : null,
        format:result.format || '', sizeBytes:Number(result.bytes || buffer.length || 0), providerStatus:'ready'
      });
    });
    stream.end(buffer);
  });
}

async function uploadBuffer(buffer, options={}) {
  const resourceType = resourceTypeFromMime(options.mimeType);
  if (resourceType === 'video' && bunnyStreamConfigured()) return bunnyStreamUpload(buffer, options);
  if (resourceType === 'image' && bunnyStorageConfigured()) return bunnyStorageUpload(buffer, options);
  if (cloudinaryUploadFallbackAllowed()) return uploadCloudinary(buffer, options);
  throw new Error(resourceType === 'video' ? 'No hay proveedor de vídeo configurado' : 'No hay proveedor de imágenes configurado');
}

function cloudinaryDeliveryUrl({ provider, provider_id, resource_type, delivery_type='upload', secure_url='', format='' } = {}) {
  if (provider !== 'cloudinary' || !provider_id || !cloudinaryConfigured()) return String(secure_url || '');
  const type = String(delivery_type || 'upload');
  if (type === 'upload') return String(secure_url || cloudinary.url(provider_id, { secure:true, resource_type:resource_type === 'video' ? 'video':'image', type:'upload', format:format || undefined }));
  return cloudinary.url(provider_id, { secure:true, sign_url:true, resource_type:resource_type === 'video' ? 'video':'image', type, format:format || undefined });
}

function bunnyStorageDeliveryUrl(item, ttlSeconds=300) {
  if (item?.provider !== 'bunny_storage' || !item.provider_id || !bunnyStorageConfigured()) return '';
  const raw = `${bunnyCdnBase()}/${String(item.provider_id).replace(/^\/+/, '')}`;
  return signBunnyUrl(raw, String(process.env.BUNNY_CDN_TOKEN_KEY), { ttlSeconds });
}

function bunnyStreamDeliveryUrl(item, ttlSeconds=300) {
  if (item?.provider !== 'bunny_stream' || !item.provider_id || !bunnyStreamConfigured()) return '';
  const guid = String(item.provider_id).trim();
  const raw = `${bunnyStreamCdnBase()}/${guid}/playlist.m3u8`;
  return signBunnyUrl(raw, String(process.env.BUNNY_STREAM_TOKEN_KEY), {
    ttlSeconds,
    isDirectory:true,
    pathAllowed:`/${guid}/`
  });
}

function deliveryUrl(item={}, ttlSeconds=300) {
  if (item.provider === 'bunny_storage') return bunnyStorageDeliveryUrl(item, ttlSeconds);
  if (item.provider === 'bunny_stream') return bunnyStreamDeliveryUrl(item, ttlSeconds);
  return cloudinaryDeliveryUrl(item);
}

async function getBunnyStreamVideo(providerId) {
  if (!bunnyStreamConfigured() || !providerId) return null;
  const response = await fetch(`${bunnyStreamApiBase()}/videos/${encodeURIComponent(String(providerId))}`, {
    headers:{ AccessKey:String(process.env.BUNNY_STREAM_API_KEY) }
  });
  if (!response.ok) return null;
  return response.json();
}

async function hardenAsset({ provider, provider_id, resource_type, delivery_type='upload' } = {}) {
  if (provider !== 'cloudinary' || !provider_id || !cloudinaryConfigured()) return null;
  const currentType = String(delivery_type || 'upload');
  if (currentType === 'authenticated') return { providerId:provider_id, deliveryType:'authenticated' };
  const resourceType = resource_type === 'video' ? 'video' : 'image';
  const result = await cloudinary.uploader.rename(provider_id, provider_id, {
    resource_type:resourceType, type:currentType, to_type:'authenticated', overwrite:false, invalidate:true
  });
  return {
    providerId:result.public_id || provider_id, secureUrl:result.secure_url || '',
    resourceType:result.resource_type || resourceType, deliveryType:result.type || 'authenticated', format:result.format || ''
  };
}

async function destroyAsset({ provider, provider_id, resource_type, delivery_type='upload' } = {}) {
  if (!provider_id) return false;
  try {
    if (provider === 'bunny_storage' && bunnyStorageConfigured()) {
      const endpoint = `${bunnyStorageEndpoint()}/${String(provider_id).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}`;
      const response = await fetch(endpoint, { method:'DELETE', headers:{AccessKey:String(process.env.BUNNY_STORAGE_KEY)} });
      return response.ok || response.status === 404;
    }
    if (provider === 'bunny_stream' && bunnyStreamConfigured()) {
      const response = await fetch(`${bunnyStreamApiBase()}/videos/${encodeURIComponent(String(provider_id))}`, {
        method:'DELETE', headers:{AccessKey:String(process.env.BUNNY_STREAM_API_KEY)}
      });
      return response.ok || response.status === 404;
    }
    if (provider === 'cloudinary' && cloudinaryConfigured()) {
      await cloudinary.uploader.destroy(provider_id, {
        resource_type:resource_type === 'video' ? 'video':'image', type:String(delivery_type || 'upload'), invalidate:true
      });
      return true;
    }
  } catch (err) {
    console.error(`${provider || 'Media'} destroy:`, err.message);
  }
  return false;
}

module.exports = {
  configured,
  cloudinaryConfigured,
  cloudinaryUploadFallbackAllowed,
  imageUploadConfigured,
  videoUploadConfigured,
  bunnyStorageConfigured,
  bunnyStreamConfigured,
  providerSummary,
  uploadBuffer,
  deliveryUrl,
  cloudinaryDeliveryUrl,
  bunnyStorageDeliveryUrl,
  bunnyStreamDeliveryUrl,
  getBunnyStreamVideo,
  hardenAsset,
  destroyAsset,
  resourceTypeFromMime,
  signBunnyUrl
};
