const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const MAX_ARCHIVE_ENTRIES = 500;
const MAX_ARCHIVE_UNCOMPRESSED = 300 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PROFILES_PER_ARCHIVE = 10;
const SUPPORTED_IMAGE_EXTS = new Set(['.jpg','.jpeg','.png','.webp']);
const REQUIRED_KINDS = ['avatar','cover','post','post','post','post'];

function importError(message, code='VIRTUAL_PACK_INVALID') {
  const err = new Error(message);
  err.code = code;
  err.status = 400;
  return err;
}

function normalizeZipPath(value='') {
  const raw = String(value || '').replace(/\\/g,'/').replace(/^\/+/, '');
  if (!raw || raw.includes('\0')) throw importError('El ZIP contiene una ruta no válida.');
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length || parts.some(p => p === '..' || p === '.')) throw importError(`Ruta insegura dentro del ZIP: ${raw}`);
  return parts.join('/');
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50;
  const min = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset;
  }
  throw importError('El archivo no parece ser un ZIP válido.', 'VIRTUAL_PACK_BAD_ZIP');
}

function parseZipDirectory(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw importError('ZIP vacío o incompleto.', 'VIRTUAL_PACK_BAD_ZIP');
  const eocd = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (totalEntries > MAX_ARCHIVE_ENTRIES) throw importError(`El ZIP contiene demasiados archivos (${totalEntries}). Máximo ${MAX_ARCHIVE_ENTRIES}.`);
  if (centralOffset + centralSize > buffer.length) throw importError('Directorio central ZIP incompleto.', 'VIRTUAL_PACK_BAD_ZIP');
  const entries = new Map();
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw importError('Entrada ZIP dañada.', 'VIRTUAL_PACK_BAD_ZIP');
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    if (flags & 0x0001) throw importError('No se admiten ZIP protegidos con contraseña.');
    if (![0,8].includes(method)) throw importError('El ZIP usa una compresión no compatible. Usa ZIP normal (Deflate).');
    const rawName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8');
    const name = normalizeZipPath(rawName);
    const isDirectory = rawName.endsWith('/');
    if (!isDirectory) {
      totalUncompressed += uncompressedSize;
      if (totalUncompressed > MAX_ARCHIVE_UNCOMPRESSED) throw importError('El ZIP descomprimido supera 300 MB.');
      entries.set(name, { name, method, compressedSize, uncompressedSize, localOffset });
    }
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function extractZipEntry(archive, entry) {
  const offset = Number(entry.localOffset);
  if (archive.readUInt32LE(offset) !== 0x04034b50) throw importError(`Cabecera ZIP dañada: ${entry.name}`, 'VIRTUAL_PACK_BAD_ZIP');
  const fileNameLength = archive.readUInt16LE(offset + 26);
  const extraLength = archive.readUInt16LE(offset + 28);
  const start = offset + 30 + fileNameLength + extraLength;
  const end = start + Number(entry.compressedSize);
  if (start < 0 || end > archive.length) throw importError(`Contenido ZIP incompleto: ${entry.name}`, 'VIRTUAL_PACK_BAD_ZIP');
  const compressed = archive.subarray(start, end);
  const data = entry.method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed, { maxOutputLength: Math.max(1, Number(entry.uncompressedSize) + 1024) });
  if (data.length !== Number(entry.uncompressedSize)) throw importError(`Tamaño incorrecto al extraer ${entry.name}.`, 'VIRTUAL_PACK_BAD_ZIP');
  return data;
}

function joinZipPath(base, file) {
  const candidate = base ? `${base}/${String(file || '')}` : String(file || '');
  return normalizeZipPath(candidate);
}

function dirnameZip(file) {
  const idx = file.lastIndexOf('/');
  return idx >= 0 ? file.slice(0, idx) : '';
}

function jsonEntry(archive, entry) {
  const data = extractZipEntry(archive, entry);
  if (data.length > 1024 * 1024) throw importError(`Manifest demasiado grande: ${entry.name}`);
  try { return JSON.parse(data.toString('utf8')); }
  catch { throw importError(`JSON inválido en ${entry.name}.`); }
}

function safeUsername(value='') {
  const username = String(value || '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_.]{3,30}$/.test(username)) throw importError(`Username inválido en manifest: ${value}`);
  return username;
}

function imageMimeFromBuffer(buffer, fileName='') {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTS.has(ext)) throw importError(`Formato no admitido: ${fileName}. Usa JPG, PNG o WEBP.`);
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff && ['.jpg','.jpeg'].includes(ext)) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) && ext === '.png') return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP' && ext === '.webp') return 'image/webp';
  throw importError(`El contenido de ${fileName} no coincide con un JPG, PNG o WEBP válido.`);
}

function normalizeTags(value) {
  let list = value;
  if (typeof list === 'string') list = list.split(',');
  if (!Array.isArray(list)) list = [];
  return [...new Set(list.map(v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().slice(0,40)).filter(Boolean))].slice(0,20);
}

function normalizeImageSpec(raw, baseDir, username, index) {
  const kind = String(raw?.kind || '').toLowerCase();
  if (!['avatar','cover','post'].includes(kind)) throw importError(`@${username}: kind no válido en imagen ${index + 1}. Usa avatar, cover o post.`);
  const file = joinZipPath(baseDir, raw?.file || '');
  return {
    file,
    kind,
    label:String(raw?.label || (kind === 'avatar' ? 'Avatar principal' : kind === 'cover' ? 'Portada principal' : `Foto ${index + 1}`)).trim().slice(0,120),
    tags:normalizeTags(raw?.tags || []),
    alt_text:String(raw?.alt_text || '').trim().slice(0,300),
    featured:Boolean(raw?.featured),
    sort_order:Number.isFinite(Number(raw?.sort_order)) ? Math.max(0, Math.min(10000, Number(raw.sort_order))) : (kind === 'avatar' ? 0 : kind === 'cover' ? 1 : 10 + index)
  };
}

function normalizeProfileManifest(raw, baseDir='') {
  const username = safeUsername(raw?.username);
  if (!Array.isArray(raw?.images)) throw importError(`@${username}: falta el array images.`);
  const images = raw.images.map((img,index)=>normalizeImageSpec(img,baseDir,username,index));
  if (images.length !== 6) throw importError(`@${username}: cada pack debe contener exactamente 6 imágenes (avatar + portada + 4 posts).`);
  const kinds = images.map(x=>x.kind).sort();
  const required = [...REQUIRED_KINDS].sort();
  if (kinds.join('|') !== required.join('|')) throw importError(`@${username}: el pack debe tener 1 avatar, 1 portada y 4 imágenes kind=post.`);
  if (new Set(images.map(x=>x.file)).size !== images.length) throw importError(`@${username}: hay archivos repetidos en el manifest.`);
  return { username, identity_version:String(raw?.identity_version || 'v1').slice(0,40), images };
}

function parseRealisticPackArchive(buffer) {
  const entries = parseZipDirectory(buffer);
  const rootManifestEntry = entries.get('manifest.json');
  let batch='';
  let profiles=[];
  if (rootManifestEntry) {
    const root = jsonEntry(buffer, rootManifestEntry);
    if (!Array.isArray(root?.profiles)) throw importError('manifest.json debe contener un array profiles.');
    batch = String(root.batch || root.pack_version || '').trim().slice(0,80);
    profiles = root.profiles.map(p=>normalizeProfileManifest(p,''));
  } else {
    const manifests = [...entries.values()].filter(e=>/(^|\/)manifest\.json$/i.test(e.name));
    if (!manifests.length) throw importError('No se encontró manifest.json en el ZIP.');
    profiles = manifests.map(entry=>normalizeProfileManifest(jsonEntry(buffer,entry),dirnameZip(entry.name)));
  }
  if (!profiles.length) throw importError('El ZIP no contiene perfiles para importar.');
  if (profiles.length > MAX_PROFILES_PER_ARCHIVE) throw importError(`Máximo ${MAX_PROFILES_PER_ARCHIVE} perfiles por ZIP.`);
  const usernames = profiles.map(p=>p.username);
  if (new Set(usernames).size !== usernames.length) throw importError('El ZIP contiene usernames duplicados.');
  for (const profile of profiles) {
    for (const image of profile.images) {
      const entry = entries.get(image.file);
      if (!entry) throw importError(`@${profile.username}: no se encontró ${image.file}.`);
      if (entry.uncompressedSize > MAX_IMAGE_BYTES) throw importError(`${image.file} supera 10 MB.`);
      const ext = path.extname(image.file).toLowerCase();
      if (!SUPPORTED_IMAGE_EXTS.has(ext)) throw importError(`${image.file}: usa JPG, PNG o WEBP.`);
    }
  }
  return { batch:batch || `realistic-${Date.now()}`, profiles, entries };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},()=>run()));
  return results;
}

async function ensureImportedMedia(db,{user, image, buffer, mimeType, adminId, batch, archiveName, uploadMediaBuffer, imageUploadConfigured}) {
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const existing = await db.query(`
    SELECT id FROM media
     WHERE user_id=$1
       AND provider_meta->>'realistic_sha256'=$2
       AND COALESCE(provider_meta->>'realistic_pack','false')='true'
     ORDER BY id DESC LIMIT 1
  `,[user.id,sha256]);
  if (existing.rowCount) return {mediaId:Number(existing.rows[0].id), reused:true, sha256};
  const originalName=path.posix.basename(image.file).slice(0,255);
  const meta={virtual:true,synthetic:true,uploaded_by_admin:Number(adminId),image_system:'1.12.26',realistic_pack:true,realistic_pack_batch:batch,realistic_sha256:sha256,username:user.username,kind:image.kind,source_archive:String(archiveName||'').slice(0,180)};
  if (imageUploadConfigured()) {
    const uploaded=await uploadMediaBuffer(buffer,{mimeType,originalName,userId:Number(user.id),privateDelivery:true});
    const inserted=await db.query(`
      INSERT INTO media(user_id,mime_type,original_name,size_bytes,data,provider,provider_id,secure_url,resource_type,delivery_type,width,height,duration_seconds,format,migrated_at,provider_status,provider_meta)
      VALUES($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),$14,$15::jsonb) RETURNING id
    `,[user.id,mimeType,originalName,uploaded.sizeBytes||buffer.length,uploaded.provider,uploaded.providerId,uploaded.secureUrl,uploaded.resourceType,uploaded.deliveryType||'',uploaded.width,uploaded.height,uploaded.durationSeconds,uploaded.format,uploaded.providerStatus||'ready',JSON.stringify(meta)]);
    return {mediaId:Number(inserted.rows[0].id), reused:false, sha256};
  }
  const inserted=await db.query(`
    INSERT INTO media(user_id,mime_type,original_name,size_bytes,data,provider,provider_status,provider_meta,resource_type)
    VALUES($1,$2,$3,$4,$5,'postgresql','ready',$6::jsonb,'image') RETURNING id
  `,[user.id,mimeType,originalName,buffer.length,buffer,JSON.stringify(meta)]);
  return {mediaId:Number(inserted.rows[0].id), reused:false, sha256};
}

async function importRealisticPackArchive({db, withTransaction, archiveBuffer, archiveName, adminId, uploadMediaBuffer, imageUploadConfigured}) {
  const parsed = parseRealisticPackArchive(archiveBuffer);
  const archiveSha256 = crypto.createHash('sha256').update(archiveBuffer).digest('hex');
  const users = await db.query(`SELECT id,username,name,avatar,cover FROM users WHERE is_virtual=TRUE AND LOWER(username)=ANY($1::text[])`,[parsed.profiles.map(p=>p.username)]);
  const byUsername = new Map(users.rows.map(u=>[String(u.username).toLowerCase(),u]));
  const missing = parsed.profiles.filter(p=>!byUsername.has(p.username)).map(p=>p.username);
  if (missing.length) throw importError(`No existen como perfiles virtuales: ${missing.map(x=>'@'+x).join(', ')}.`,'VIRTUAL_PACK_PROFILE_NOT_FOUND');

  const report={batch:parsed.batch,archive_sha256:archiveSha256,profiles_requested:parsed.profiles.length,profiles_imported:0,images_requested:parsed.profiles.length*6,images_imported:0,images_reused:0,base_images_archived:0,realistic_images_archived:0,profiles:[],errors:[]};

  for (const profile of parsed.profiles) {
    const user=byUsername.get(profile.username);
    try {
      const prepared=profile.images.map(image=>({image,entry:parsed.entries.get(image.file)}));
      const uploaded=await mapLimit(prepared,3,async({image,entry})=>{
        const buffer=extractZipEntry(archiveBuffer,entry);
        if (buffer.length > MAX_IMAGE_BYTES) throw importError(`${image.file} supera 10 MB.`);
        const mimeType=imageMimeFromBuffer(buffer,image.file);
        const media=await ensureImportedMedia(db,{user,image,buffer,mimeType,adminId,batch:parsed.batch,archiveName,uploadMediaBuffer,imageUploadConfigured});
        return {...media,image};
      });
      const currentMediaIds=uploaded.map(x=>x.mediaId);
      const result=await withTransaction(async client=>{
        const baseArchived=await client.query(`
          UPDATE virtual_profile_media vpm SET active=FALSE,archived_at=COALESCE(vpm.archived_at,NOW()),updated_at=NOW()
            FROM media m
           WHERE vpm.media_id=m.id AND vpm.user_id=$1 AND vpm.active=TRUE
             AND (m.provider='virtual_local' OR m.provider_meta->>'pack_stage'='base')
        `,[user.id]);
        const previousArchived=await client.query(`
          UPDATE virtual_profile_media vpm SET active=FALSE,archived_at=COALESCE(vpm.archived_at,NOW()),updated_at=NOW()
            FROM media m
           WHERE vpm.media_id=m.id AND vpm.user_id=$1 AND vpm.active=TRUE
             AND COALESCE(m.provider_meta->>'realistic_pack','false')='true'
             AND NOT (vpm.media_id=ANY($2::bigint[]))
        `,[user.id,currentMediaIds]);
        let avatarId=null,coverId=null;
        for (const item of uploaded) {
          const image=item.image;
          await client.query(`
            INSERT INTO virtual_profile_media(user_id,media_id,label,kind,tags,alt_text,active,featured,sort_order,updated_at)
            VALUES($1,$2,$3,$4,$5::jsonb,$6,TRUE,$7,$8,NOW())
            ON CONFLICT(user_id,media_id) DO UPDATE SET label=EXCLUDED.label,kind=EXCLUDED.kind,tags=EXCLUDED.tags,alt_text=EXCLUDED.alt_text,active=TRUE,featured=EXCLUDED.featured,sort_order=EXCLUDED.sort_order,archived_at=NULL,updated_at=NOW()
          `,[user.id,item.mediaId,image.label,image.kind,JSON.stringify(image.tags),image.alt_text||`${user.name} · ${image.label}`,Boolean(image.featured),image.sort_order]);
          if(image.kind==='avatar') avatarId=item.mediaId;
          if(image.kind==='cover') coverId=item.mediaId;
        }
        if(!avatarId||!coverId) throw importError(`@${profile.username}: faltan avatar o portada.`);
        await client.query(`UPDATE users SET avatar=$2,cover=$3 WHERE id=$1 AND is_virtual=TRUE`,[user.id,`/media/${avatarId}`,`/media/${coverId}`]);
        return {baseArchived:baseArchived.rowCount||0,previousArchived:previousArchived.rowCount||0,avatarId,coverId};
      });
      const imported=uploaded.filter(x=>!x.reused).length;
      const reused=uploaded.filter(x=>x.reused).length;
      report.profiles_imported+=1;report.images_imported+=imported;report.images_reused+=reused;report.base_images_archived+=result.baseArchived;report.realistic_images_archived+=result.previousArchived;
      report.profiles.push({username:profile.username,user_id:Number(user.id),images:6,uploaded:imported,reused,avatar_media_id:result.avatarId,cover_media_id:result.coverId,status:'imported'});
    } catch (err) {
      report.errors.push({username:profile.username,error:String(err?.message||err).slice(0,500),code:err?.code||'IMPORT_FAILED'});
    }
  }
  report.partial=report.errors.length>0;
  report.ok=report.profiles_imported>0 && !report.partial;
  return report;
}

module.exports={
  MAX_ARCHIVE_ENTRIES,MAX_ARCHIVE_UNCOMPRESSED,MAX_IMAGE_BYTES,MAX_PROFILES_PER_ARCHIVE,
  parseRealisticPackArchive,importRealisticPackArchive
};
