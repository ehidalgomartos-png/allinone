const { v2: cloudinary } = require('cloudinary');

const configured = () => Boolean(process.env.CLOUDINARY_URL);

function resourceTypeFromMime(mime='') {
  return String(mime).startsWith('video/') ? 'video' : 'image';
}

function uploadBuffer(buffer, { mimeType='', originalName='', userId }) {
  if (!configured()) throw new Error('Cloudinary no está configurado');
  const resourceType = resourceTypeFromMime(mimeType);
  const folder = `instant-admirers/${resourceType}s/user_${userId}`;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      resource_type: resourceType,
      folder,
      use_filename: false,
      unique_filename: true,
      overwrite: false,
      tags: ['instant-admirers', `user_${userId}`],
      context: originalName ? { original_name: String(originalName).slice(0, 255) } : undefined
    }, (err, result) => {
      if (err) return reject(err);
      resolve({
        provider: 'cloudinary',
        providerId: result.public_id,
        secureUrl: result.secure_url,
        resourceType: result.resource_type || resourceType,
        width: Number.isFinite(result.width) ? result.width : null,
        height: Number.isFinite(result.height) ? result.height : null,
        durationSeconds: Number.isFinite(result.duration) ? result.duration : null,
        format: result.format || '',
        sizeBytes: Number(result.bytes || buffer.length || 0)
      });
    });
    stream.end(buffer);
  });
}

async function destroyAsset({ provider, provider_id, resource_type }) {
  if (provider !== 'cloudinary' || !provider_id || !configured()) return false;
  try {
    await cloudinary.uploader.destroy(provider_id, {
      resource_type: resource_type === 'video' ? 'video' : 'image',
      invalidate: true
    });
    return true;
  } catch (err) {
    console.error('Cloudinary destroy:', err.message);
    return false;
  }
}

module.exports = { configured, uploadBuffer, destroyAsset, resourceTypeFromMime };
