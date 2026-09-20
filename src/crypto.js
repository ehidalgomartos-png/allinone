const crypto = require('crypto');

const rawKey = process.env.TOKEN_ENCRYPTION_KEY || '';
if (process.env.NODE_ENV === 'production' && !rawKey) {
  throw new Error('En producción debes definir TOKEN_ENCRYPTION_KEY.');
}

const key = crypto.createHash('sha256').update(rawKey || 'dev-token-key-change-me').digest();

function encrypt(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

function decrypt(payload) {
  if (!payload) return '';
  const [iv64, tag64, data64] = String(payload).split('.');
  if (!iv64 || !tag64 || !data64) throw new Error('Token cifrado inválido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data64, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

module.exports = { encrypt, decrypt };
