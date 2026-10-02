const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const MAX_ARCHIVE_ENTRIES = 2600;
const MAX_ARCHIVE_UNCOMPRESSED = 2 * 1024 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGES_TOTAL = 2000;
const MAX_IMAGES_PER_PROFILE = 30;
const MIN_IMAGES_PER_PROFILE = 3;
const EXPECTED_PROFILE_COUNT = 100;
const SUPPORTED_IMAGE_EXTS = new Set(['.jpg','.jpeg','.png','.webp']);
const COMMON_UNSUPPORTED_IMAGE_EXTS = new Set(['.gif','.heic','.heif','.bmp','.tif','.tiff','.avif']);
const ACTIVE_JOB_STATUSES = new Set(['uploaded','validating','staging','ready','committing','rolling_back','cancelling']);
const MASS_IMPORT_ADVISORY_LOCK = 112400;

function jobError(message, code='VIRTUAL_MASS_IMPORT_INVALID', status=400) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function normalizeZipPath(value='') {
  const raw = String(value || '').replace(/\\/g,'/').replace(/^\/+/, '');
  if (!raw || raw.includes('\0')) throw jobError('El ZIP contiene una ruta no válida.');
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length || parts.some(p => p === '..' || p === '.')) throw jobError(`Ruta insegura dentro del ZIP: ${raw}`);
  return parts.join('/');
}

function normalizeKey(value='') {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function naturalCompare(a,b) {
  return String(a).localeCompare(String(b),'es',{numeric:true,sensitivity:'base'});
}

async function mapLimit(items,limit,worker){
  const results=new Array(items.length);let cursor=0;
  async function run(){while(true){const index=cursor++;if(index>=items.length)return;results[index]=await worker(items[index],index);}}
  await Promise.all(Array.from({length:Math.min(Math.max(1,Number(limit)||1),items.length)},()=>run()));
  return results;
}

async function readAt(handle, position, length) {
  const buffer = Buffer.alloc(length);
  const {bytesRead} = await handle.read(buffer,0,length,position);
  return bytesRead === length ? buffer : buffer.subarray(0,bytesRead);
}

async function parseZipDirectoryFile(filePath) {
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile() || stat.size < 22) throw jobError('ZIP vacío o incompleto.','VIRTUAL_MASS_BAD_ZIP');
  const handle = await fs.promises.open(filePath,'r');
  try {
    const tailLength = Math.min(stat.size,65557);
    const tail = await readAt(handle,stat.size-tailLength,tailLength);
    const signature = 0x06054b50;
    let rel = -1;
    for (let i=tail.length-22;i>=0;i-=1) {
      if (tail.readUInt32LE(i) === signature) { rel=i; break; }
    }
    if (rel < 0) throw jobError('El archivo no parece ser un ZIP válido.','VIRTUAL_MASS_BAD_ZIP');
    const totalEntries = tail.readUInt16LE(rel+10);
    const centralSize = tail.readUInt32LE(rel+12);
    const centralOffset = tail.readUInt32LE(rel+16);
    if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw jobError('ZIP64 no está admitido. Crea un ZIP estándar menor de 4 GB.','VIRTUAL_MASS_ZIP64');
    if (totalEntries > MAX_ARCHIVE_ENTRIES) throw jobError(`El ZIP contiene demasiadas entradas (${totalEntries}). Máximo ${MAX_ARCHIVE_ENTRIES}.`);
    if (centralOffset + centralSize > stat.size) throw jobError('Directorio central ZIP incompleto.','VIRTUAL_MASS_BAD_ZIP');
    if (centralSize > 64 * 1024 * 1024) throw jobError('El índice interno del ZIP es demasiado grande.');
    const central = await readAt(handle,centralOffset,centralSize);
    const entries = [];
    let offset=0,totalUncompressed=0;
    for (let i=0;i<totalEntries;i+=1) {
      if (offset+46 > central.length || central.readUInt32LE(offset)!==0x02014b50) throw jobError('Entrada ZIP dañada.','VIRTUAL_MASS_BAD_ZIP');
      const flags=central.readUInt16LE(offset+8);
      const method=central.readUInt16LE(offset+10);
      const compressedSize=central.readUInt32LE(offset+20);
      const uncompressedSize=central.readUInt32LE(offset+24);
      const fileNameLength=central.readUInt16LE(offset+28);
      const extraLength=central.readUInt16LE(offset+30);
      const commentLength=central.readUInt16LE(offset+32);
      const localOffset=central.readUInt32LE(offset+42);
      if(flags & 0x0001) throw jobError('No se admiten ZIP protegidos con contraseña.');
      if(![0,8].includes(method)) throw jobError('El ZIP usa una compresión no compatible. Usa ZIP normal (Deflate).');
      const endName=offset+46+fileNameLength;
      if(endName>central.length) throw jobError('Nombre de entrada ZIP incompleto.','VIRTUAL_MASS_BAD_ZIP');
      const rawName=central.subarray(offset+46,endName).toString('utf8');
      const isDirectory=rawName.endsWith('/');
      if(!isDirectory){
        const name=normalizeZipPath(rawName);
        totalUncompressed += uncompressedSize;
        if(totalUncompressed>MAX_ARCHIVE_UNCOMPRESSED) throw jobError('El ZIP descomprimido supera 2 GB.');
        entries.push({name,method,compressedSize,uncompressedSize,localOffset});
      }
      offset += 46+fileNameLength+extraLength+commentLength;
    }
    return {entries,totalEntries,totalUncompressed,archiveBytes:stat.size};
  } finally { await handle.close(); }
}

async function extractZipEntryFile(filePath,entry) {
  const handle=await fs.promises.open(filePath,'r');
  try{
    const header=await readAt(handle,Number(entry.localOffset),30);
    if(header.length<30 || header.readUInt32LE(0)!==0x04034b50) throw jobError(`Cabecera ZIP dañada: ${entry.name}`,'VIRTUAL_MASS_BAD_ZIP');
    const fileNameLength=header.readUInt16LE(26);
    const extraLength=header.readUInt16LE(28);
    const start=Number(entry.localOffset)+30+fileNameLength+extraLength;
    if(Number(entry.compressedSize)>MAX_IMAGE_BYTES*2+1024*1024) throw jobError(`${entry.name} usa un tamaño comprimido no razonable.`);
    const compressed=await readAt(handle,start,Number(entry.compressedSize));
    if(compressed.length!==Number(entry.compressedSize)) throw jobError(`Contenido ZIP incompleto: ${entry.name}`,'VIRTUAL_MASS_BAD_ZIP');
    const data=entry.method===0?Buffer.from(compressed):zlib.inflateRawSync(compressed,{maxOutputLength:Math.max(1,Number(entry.uncompressedSize)+1024)});
    if(data.length!==Number(entry.uncompressedSize)) throw jobError(`Tamaño incorrecto al extraer ${entry.name}.`,'VIRTUAL_MASS_BAD_ZIP');
    return data;
  } finally { await handle.close(); }
}

function imageMimeFromBuffer(buffer,fileName='') {
  const ext=path.extname(String(fileName||'')).toLowerCase();
  if(!SUPPORTED_IMAGE_EXTS.has(ext)) throw jobError(`Formato no admitido: ${fileName}. Usa JPG, PNG o WEBP.`);
  if(buffer.length>=3 && buffer[0]===0xff && buffer[1]===0xd8 && buffer[2]===0xff && ['.jpg','.jpeg'].includes(ext)) return 'image/jpeg';
  if(buffer.length>=8 && buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) && ext==='.png') return 'image/png';
  if(buffer.length>=12 && buffer.toString('ascii',0,4)==='RIFF' && buffer.toString('ascii',8,12)==='WEBP' && ext==='.webp') return 'image/webp';
  throw jobError(`El contenido de ${fileName} no coincide con un JPG, PNG o WEBP válido.`,'VIRTUAL_MASS_BAD_IMAGE');
}

async function sha256File(filePath) {
  return new Promise((resolve,reject)=>{
    const hash=crypto.createHash('sha256');
    const stream=fs.createReadStream(filePath);
    stream.on('data',chunk=>hash.update(chunk));
    stream.on('error',reject);
    stream.on('end',()=>resolve(hash.digest('hex')));
  });
}

function profileIndex(profile,ordinal) {
  const raw=String(profile.persona_key||'');
  const m=raw.match(/(\d{1,3})/);
  const n=m?Number(m[1]):NaN;
  return Number.isFinite(n)&&n>=1&&n<=999?n:ordinal+1;
}

function buildProfileResolver(profiles) {
  const byIndex=new Map();
  const aliasCandidates=new Map();
  const prepared=profiles.map((p,i)=>({...p,_index:profileIndex(p,i)}));
  const addAlias=(alias,profile)=>{
    const key=normalizeKey(alias);
    if(!key)return;
    // Un mismo perfil puede producir el mismo alias por varias rutas
    // (username literal y username con ._- sustituidos). Eso NO es una
    // ambigüedad: solo lo es cuando el mismo alias apunta a perfiles distintos.
    if(!aliasCandidates.has(key))aliasCandidates.set(key,new Map());
    aliasCandidates.get(key).set(Number(profile.id),profile);
  };
  for(const p of prepared){
    byIndex.set(Number(p._index),p);
    addAlias(p.username,p);
    addAlias(p.name,p);
    addAlias(String(p.username||'').replace(/[._-]+/g,' '),p);
  }
  const aliases=new Map(
    [...aliasCandidates]
      .filter(([,profilesById])=>profilesById.size===1)
      .map(([key,profilesById])=>[key,[...profilesById.values()][0]])
  );
  function resolveToken(token,{allowBareNumber=true}={}){
    const raw=String(token||'');
    const key=normalizeKey(raw);
    if(aliases.has(key)) return aliases.get(key);
    let m=key.match(/^(?:perfil|profile|p)?\s*0*(\d{1,3})(?:\s|$)/);
    if(!m && allowBareNumber) m=key.match(/^0*(\d{1,3})(?:\s|$)/);
    if(m && byIndex.has(Number(m[1]))) return byIndex.get(Number(m[1]));
    for(const [alias,p] of aliases){
      if(alias.length>=5 && (key===alias || key.startsWith(alias+' '))) return p;
    }
    return null;
  }
  function resolveEntry(entryName){
    const parts=String(entryName||'').split('/').filter(Boolean);
    const dirs=parts.slice(0,-1).reverse();
    for(const segment of dirs){
      const found=resolveToken(segment,{allowBareNumber:true});
      if(found)return found;
    }
    const stem=path.posix.basename(parts[parts.length-1]||'').replace(/\.[^.]+$/,'');
    const explicit=resolveToken(stem,{allowBareNumber:false});
    if(explicit)return explicit;
    const numberMatch=normalizeKey(stem).match(/^0*(\d{3})(?:\s|$)/);
    if(numberMatch && byIndex.has(Number(numberMatch[1]))) return byIndex.get(Number(numberMatch[1]));
    return null;
  }
  return {prepared,resolveEntry};
}

function inferRoles(entries,username) {
  const sorted=[...entries].sort((a,b)=>naturalCompare(a.name,b.name));
  const roleWord=e=>normalizeKey(path.posix.basename(e.name).replace(/\.[^.]+$/,''));
  const avatars=sorted.filter(e=>/(^|\s)(avatar|profile|perfil|retrato|principal)(\s|$)/.test(roleWord(e)));
  const covers=sorted.filter(e=>/(^|\s)(cover|portada|banner|cabecera)(\s|$)/.test(roleWord(e)));
  const warnings=[];
  if(avatars.length>1) warnings.push(`@${username}: hay ${avatars.length} archivos con nombre de avatar; se usará ${path.posix.basename(avatars[0].name)}.`);
  if(covers.length>1) warnings.push(`@${username}: hay ${covers.length} archivos con nombre de portada; se usará ${path.posix.basename(covers[0].name)}.`);
  let avatar=avatars[0]||sorted[0];
  if(!avatars.length) warnings.push(`@${username}: avatar inferido automáticamente desde ${path.posix.basename(avatar.name)}.`);
  let cover=covers.find(x=>x!==avatar)||sorted.find(x=>x!==avatar);
  if(!cover) throw jobError(`@${username}: no hay suficientes imágenes para avatar y portada.`);
  if(!covers.length) warnings.push(`@${username}: portada inferida automáticamente desde ${path.posix.basename(cover.name)}.`);
  const posts=sorted.filter(x=>x!==avatar&&x!==cover);
  const specs=[
    {...avatar,kind:'avatar',sort_order:0,featured:true},
    {...cover,kind:'cover',sort_order:1,featured:false},
    ...posts.map((x,i)=>({...x,kind:'post',sort_order:11+i,featured:i===0}))
  ];
  return {specs,warnings};
}

async function loadVirtualProfiles(db) {
  const {rows}=await db.query(`
    SELECT u.id,u.username,u.name,u.avatar,u.cover,u.account_status,u.social_hidden,
           vp.persona_key,vp.status
      FROM users u
      JOIN virtual_profiles vp ON vp.user_id=u.id
     WHERE u.is_virtual=TRUE
     ORDER BY u.id
  `);
  return rows;
}

async function buildMassImportPlan({db,archivePath,onProgress=async()=>{}}) {
  const profiles=await loadVirtualProfiles(db);
  if(profiles.length!==EXPECTED_PROFILE_COUNT) throw jobError(`La base debe contener exactamente ${EXPECTED_PROFILE_COUNT} perfiles virtuales y ahora contiene ${profiles.length}.`,'VIRTUAL_MASS_PROFILE_COUNT');
  const parsed=await parseZipDirectoryFile(archivePath);
  const imageEntries=[];
  const unsupported=[];
  for(const entry of parsed.entries){
    if(entry.name.startsWith('__MACOSX/') || /(^|\/)\.DS_Store$/i.test(entry.name)) continue;
    const ext=path.extname(entry.name).toLowerCase();
    if(SUPPORTED_IMAGE_EXTS.has(ext)) imageEntries.push(entry);
    else if(COMMON_UNSUPPORTED_IMAGE_EXTS.has(ext)) unsupported.push(entry.name);
  }
  if(unsupported.length) throw jobError(`Hay imágenes en formatos no admitidos: ${unsupported.slice(0,8).join(', ')}${unsupported.length>8?'…':''}. Convierte todo a JPG, PNG o WEBP.`,'VIRTUAL_MASS_UNSUPPORTED_IMAGES');
  if(!imageEntries.length) throw jobError('El ZIP no contiene imágenes JPG, PNG o WEBP.');
  if(imageEntries.length>MAX_IMAGES_TOTAL) throw jobError(`El ZIP contiene ${imageEntries.length} imágenes. Máximo ${MAX_IMAGES_TOTAL}.`);
  const resolver=buildProfileResolver(profiles);
  const groups=new Map(resolver.prepared.map(p=>[Number(p.id),{profile:p,entries:[]}])) ;
  const unassigned=[];
  for(const entry of imageEntries){
    if(entry.uncompressedSize<=0 || entry.uncompressedSize>MAX_IMAGE_BYTES) throw jobError(`${entry.name} supera el máximo de 15 MB o está vacío.`);
    const p=resolver.resolveEntry(entry.name);
    if(!p) unassigned.push(entry.name);
    else groups.get(Number(p.id)).entries.push(entry);
  }
  if(unassigned.length) throw jobError(`No se pudo asignar ${unassigned.length} imagen(es) a un perfil. Ejemplos: ${unassigned.slice(0,8).join(', ')}. Usa carpetas 001–100 o el username del perfil.`,'VIRTUAL_MASS_UNASSIGNED');
  const missing=[...groups.values()].filter(g=>!g.entries.length);
  if(missing.length) throw jobError(`Faltan fotos para ${missing.length} perfiles: ${missing.slice(0,12).map(g=>`@${g.profile.username}`).join(', ')}${missing.length>12?'…':''}. El lote debe cubrir los 100 perfiles.`,'VIRTUAL_MASS_MISSING_PROFILES');
  const warnings=[];
  const planned=[];
  let totalImages=0;
  for(const {profile,entries} of groups.values()){
    if(entries.length<MIN_IMAGES_PER_PROFILE) throw jobError(`@${profile.username}: solo hay ${entries.length} imágenes. Mínimo ${MIN_IMAGES_PER_PROFILE}.`);
    if(entries.length>MAX_IMAGES_PER_PROFILE) throw jobError(`@${profile.username}: hay ${entries.length} imágenes. Máximo ${MAX_IMAGES_PER_PROFILE}.`);
    const roles=inferRoles(entries,profile.username);
    warnings.push(...roles.warnings);
    totalImages += roles.specs.length;
    planned.push({user_id:Number(profile.id),username:profile.username,name:profile.name,index:Number(profile._index),images:roles.specs.map(s=>({file:s.name,kind:s.kind,sort_order:s.sort_order,featured:s.featured,size_bytes:Number(s.uncompressedSize),_entry:s}))});
  }
  if(totalImages!==imageEntries.length) throw jobError('El recuento de imágenes asignadas no coincide con el contenido del ZIP.');
  // Validación binaria completa ANTES de subir o sustituir nada.
  let checked=0;
  const globalHashes=new Map();
  const duplicateWarnings=[];
  for(const profile of planned){
    const profileHashes=new Map();
    for(const image of profile.images){
      const buffer=await extractZipEntryFile(archivePath,image._entry);
      const mime=imageMimeFromBuffer(buffer,image.file);
      const sha256=crypto.createHash('sha256').update(buffer).digest('hex');
      image.mime_type=mime; image.sha256=sha256;
      const localSeen=profileHashes.get(sha256);
      if(localSeen) throw jobError(`@${profile.username}: ${image.file} duplica exactamente ${localSeen}. Elimina duplicados dentro del mismo perfil antes de confirmar el lote.`,'VIRTUAL_MASS_DUPLICATE_PROFILE_IMAGE');
      profileHashes.set(sha256,image.file);
      const seen=globalHashes.get(sha256);
      if(seen) duplicateWarnings.push(`${image.file} duplica ${seen}`); else globalHashes.set(sha256,image.file);
      delete image._entry;
      checked+=1;
      if(checked===1 || checked%10===0 || checked===totalImages) await onProgress({phase:'validating',processed:checked,total:totalImages,message:`Validando ${checked}/${totalImages}`});
    }
  }
  if(duplicateWarnings.length) warnings.push(`Se detectaron ${duplicateWarnings.length} imágenes duplicadas exactas en el ZIP. Se conservarán según su asignación.`);
  return {profiles:planned,total_profiles:planned.length,total_images:totalImages,warnings,archive_bytes:parsed.archiveBytes,uncompressed_bytes:parsed.totalUncompressed};
}

async function insertJob({db,adminId,archiveName,archivePath,archiveBytes}) {
  const {rows}=await db.query(`
    INSERT INTO virtual_media_import_jobs(admin_id,archive_name,temp_path,archive_bytes,status,phase,total_profiles,total_images,processed_images,progress_percent,summary,created_at,updated_at)
    VALUES($1,$2,$3,$4,'uploaded','upload',0,0,0,0,'{}'::jsonb,NOW(),NOW()) RETURNING id
  `,[Number(adminId),String(archiveName||'virtual-media.zip').slice(0,180),String(archivePath||'').slice(0,800),Number(archiveBytes||0)]);
  return Number(rows[0].id);
}

async function updateJobProgress(db,jobId,{status,phase,processed,total,message,error,summary,archiveSha256}={}) {
  const fields=[]; const values=[Number(jobId)];
  const add=(sql,val)=>{values.push(val);fields.push(`${sql}=$${values.length}`);};
  if(status!==undefined)add('status',status);
  if(phase!==undefined)add('phase',phase);
  if(processed!==undefined)add('processed_images',Number(processed));
  if(total!==undefined)add('total_images',Number(total));
  if(total!==undefined || processed!==undefined){
    const t=Number(total||0),p=Number(processed||0);add('progress_percent',t>0?Math.min(100,Math.max(0,Math.round(p*100/t))):0);
  }
  if(message!==undefined)add('progress_message',String(message||'').slice(0,500));
  if(error!==undefined)add('error_message',String(error||'').slice(0,2000));
  if(summary!==undefined)add('summary',JSON.stringify(summary||{}));
  if(archiveSha256!==undefined)add('archive_sha256',String(archiveSha256||'').slice(0,64));
  fields.push('updated_at=NOW()');
  await db.query(`UPDATE virtual_media_import_jobs SET ${fields.join(',')} WHERE id=$1`,values);
}

async function ensureStagedMedia(db,{jobId,user,image,buffer,adminId,archiveName,uploadMediaBuffer,imageUploadConfigured}) {
  if(!imageUploadConfigured()) throw jobError('La importación masiva requiere almacenamiento remoto de imágenes (Bunny Storage) configurado.','VIRTUAL_MASS_STORAGE_REQUIRED',503);
  const existing=await db.query(`
    SELECT id FROM media
     WHERE user_id=$1
       AND (provider_meta->>'mass_import_sha256'=$2 OR provider_meta->>'realistic_sha256'=$2)
       AND provider_status='ready'
     ORDER BY id DESC LIMIT 1
  `,[Number(user.id),image.sha256]);
  if(existing.rowCount) return {mediaId:Number(existing.rows[0].id),reused:true};
  const uploaded=await uploadMediaBuffer(buffer,{mimeType:image.mime_type,originalName:path.posix.basename(image.file).slice(0,255),userId:Number(user.id),privateDelivery:true});
  const meta={virtual:true,synthetic:true,uploaded_by_admin:Number(adminId),image_system:'1.12.41',mass_virtual_import:true,mass_import_job_id:Number(jobId),mass_import_stage:'staged',mass_import_sha256:image.sha256,realistic_pack:true,realistic_sha256:image.sha256,source_archive:String(archiveName||'').slice(0,180),username:user.username,kind:image.kind};
  const inserted=await db.query(`
    INSERT INTO media(user_id,mime_type,original_name,size_bytes,data,provider,provider_id,secure_url,resource_type,delivery_type,width,height,duration_seconds,format,migrated_at,provider_status,provider_meta)
    VALUES($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),$14,$15::jsonb) RETURNING id
  `,[Number(user.id),image.mime_type,path.posix.basename(image.file).slice(0,255),uploaded.sizeBytes||buffer.length,uploaded.provider,uploaded.providerId,uploaded.secureUrl,uploaded.resourceType,uploaded.deliveryType||'',uploaded.width,uploaded.height,uploaded.durationSeconds,uploaded.format,uploaded.providerStatus||'ready',JSON.stringify(meta)]);
  return {mediaId:Number(inserted.rows[0].id),reused:false};
}

async function stageMassImportJob({db,jobId,adminId,archivePath,archiveName,uploadMediaBuffer,imageUploadConfigured,onProgress=async()=>{}}) {
  const archiveSha256=await sha256File(archivePath);
  await updateJobProgress(db,jobId,{status:'validating',phase:'validating',processed:0,total:0,message:'Analizando estructura del ZIP…',archiveSha256});
  const progress=async p=>{
    await updateJobProgress(db,jobId,{status:p.phase==='validating'?'validating':'staging',phase:p.phase,processed:p.processed,total:p.total,message:p.message});
    await onProgress({jobId,...p});
  };
  const plan=await buildMassImportPlan({db,archivePath,onProgress:progress});
  await db.query(`UPDATE virtual_media_import_jobs SET total_profiles=$2,total_images=$3,summary=$4::jsonb,phase='staging',status='staging',processed_images=0,progress_percent=0,progress_message='Subiendo fotos a staging…',updated_at=NOW() WHERE id=$1`,[jobId,plan.total_profiles,plan.total_images,JSON.stringify({warnings:plan.warnings,archive_bytes:plan.archive_bytes,uncompressed_bytes:plan.uncompressed_bytes})]);
  const users=await loadVirtualProfiles(db); const byId=new Map(users.map(u=>[Number(u.id),u]));
  const directory=await parseZipDirectoryFile(archivePath);
  const entryByName=new Map(directory.entries.map(e=>[e.name,e]));
  let staged=0,reused=0,uploaded=0;
  const tasks=plan.profiles.flatMap(profile=>profile.images.map(image=>({profile,image})));
  await mapLimit(tasks,3,async({profile,image})=>{
    const user=byId.get(Number(profile.user_id));
    const entry=entryByName.get(image.file);
    if(!entry) throw jobError(`No se pudo volver a localizar ${image.file} durante staging.`);
    const buffer=await extractZipEntryFile(archivePath,entry);
    const mime=imageMimeFromBuffer(buffer,image.file);
    const sha=crypto.createHash('sha256').update(buffer).digest('hex');
    if(sha!==image.sha256 || mime!==image.mime_type) throw jobError(`La validación cambió inesperadamente para ${image.file}.`,'VIRTUAL_MASS_CHANGED_ARCHIVE');
    const media=await ensureStagedMedia(db,{jobId,user,image,buffer,adminId,archiveName,uploadMediaBuffer,imageUploadConfigured});
    await db.query(`
      INSERT INTO virtual_media_import_items(job_id,user_id,username,source_path,kind,sort_order,featured,size_bytes,mime_type,sha256,media_id,reused,status,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ready',NOW())
      ON CONFLICT(job_id,user_id,source_path) DO UPDATE SET media_id=EXCLUDED.media_id,reused=EXCLUDED.reused,status='ready',error_message=''
    `,[jobId,Number(user.id),user.username,image.file,image.kind,Number(image.sort_order),Boolean(image.featured),Number(image.size_bytes),image.mime_type,image.sha256,media.mediaId,Boolean(media.reused)]);
    staged+=1;if(media.reused)reused+=1;else uploaded+=1;
    if(staged===1 || staged%5===0 || staged===plan.total_images) await progress({phase:'staging',processed:staged,total:plan.total_images,message:`Preparando preview ${staged}/${plan.total_images}`});
  });
  const summary={warnings:plan.warnings,profiles:plan.total_profiles,images:plan.total_images,uploaded,reused,archive_bytes:plan.archive_bytes,uncompressed_bytes:plan.uncompressed_bytes};
  await db.query(`UPDATE virtual_media_import_jobs SET status='ready',phase='preview',processed_images=total_images,progress_percent=100,progress_message='Validación completa. Revisa el preview antes de confirmar.',summary=$2::jsonb,temp_path='',ready_at=NOW(),updated_at=NOW() WHERE id=$1`,[jobId,JSON.stringify(summary)]);
  await fs.promises.unlink(archivePath).catch(()=>{});
  await onProgress({jobId,phase:'preview',processed:plan.total_images,total:plan.total_images,message:'Preview listo'});
  return summary;
}

async function cleanupStagedJobMedia({db,jobId,destroyAsset}) {
  const {rows}=await db.query(`
    SELECT DISTINCT m.id,m.provider,m.provider_id,m.secure_url,m.resource_type,m.delivery_type,m.provider_meta
      FROM virtual_media_import_items i JOIN media m ON m.id=i.media_id
     WHERE i.job_id=$1 AND i.reused=FALSE
       AND COALESCE(m.provider_meta->>'mass_import_job_id','')=$2
       AND COALESCE(m.provider_meta->>'mass_import_stage','') IN ('staged','rolled_back')
  `,[Number(jobId),String(Number(jobId))]);
  let deleted=0;
  for(const item of rows){
    const refs=await db.query(`SELECT (SELECT COUNT(*) FROM virtual_profile_media WHERE media_id=$1)+(SELECT COUNT(*) FROM posts WHERE media_id=$1)+(SELECT COUNT(*) FROM stories WHERE media_id=$1) AS refs`,[item.id]);
    if(Number(refs.rows[0]?.refs||0)>0) continue;
    try{if(destroyAsset)await destroyAsset(item);}catch(_){/* DB cleanup still attempted only when remote destroy succeeds? keep conservative */ continue;}
    await db.query(`DELETE FROM media WHERE id=$1`,[item.id]);deleted+=1;
  }
  return deleted;
}

async function failMassImportJob({db,jobId,error,archivePath,destroyAsset}) {
  await updateJobProgress(db,jobId,{status:'failed',phase:'failed',message:'La importación se ha detenido.',error:String(error?.message||error)}).catch(()=>{});
  if(archivePath) await fs.promises.unlink(archivePath).catch(()=>{});
  await cleanupStagedJobMedia({db,jobId,destroyAsset}).catch(()=>{});
}

async function commitMassImportJob({db,withTransaction,jobId,adminId}) {
  const result=await withTransaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock($1)',[MASS_IMPORT_ADVISORY_LOCK]);
    const lock=await client.query(`SELECT * FROM virtual_media_import_jobs WHERE id=$1 FOR UPDATE`,[Number(jobId)]);
    const job=lock.rows[0];
    if(!job) throw jobError('Importación no encontrada.','VIRTUAL_MASS_NOT_FOUND',404);
    if(String(job.status)!=='ready') throw jobError(`La importación no está lista para confirmar (estado: ${job.status}).`,'VIRTUAL_MASS_NOT_READY',409);
    const {rows:items}=await client.query(`SELECT * FROM virtual_media_import_items WHERE job_id=$1 AND status='ready' ORDER BY user_id,sort_order,id`,[Number(jobId)]);
    if(!items.length || items.length!==Number(job.total_images)) throw jobError('El staging está incompleto. No se realizará ningún reemplazo.','VIRTUAL_MASS_STAGING_INCOMPLETE',409);
    const userIds=[...new Set(items.map(x=>Number(x.user_id)))];
    if(userIds.length!==EXPECTED_PROFILE_COUNT) throw jobError(`El staging solo contiene ${userIds.length} perfiles. Se necesitan ${EXPECTED_PROFILE_COUNT}.`,'VIRTUAL_MASS_STAGING_INCOMPLETE',409);
    await client.query(`UPDATE virtual_media_import_jobs SET status='committing',phase='commit',progress_message='Aplicando reemplazo atómico…',updated_at=NOW() WHERE id=$1`,[jobId]);
    await client.query(`
      INSERT INTO virtual_media_import_profile_snapshots(job_id,user_id,avatar,cover,created_at)
      SELECT $1,u.id,u.avatar,u.cover,NOW() FROM users u WHERE u.id=ANY($2::bigint[])
      ON CONFLICT(job_id,user_id) DO NOTHING
    `,[jobId,userIds]);
    await client.query(`
      INSERT INTO virtual_media_import_pool_snapshots(job_id,pool_id,user_id,media_id,label,kind,tags,alt_text,active,featured,sort_order,times_used,last_used_at,archived_at,created_at,updated_at)
      SELECT $1,vpm.id,vpm.user_id,vpm.media_id,vpm.label,vpm.kind,vpm.tags,vpm.alt_text,vpm.active,vpm.featured,vpm.sort_order,vpm.times_used,vpm.last_used_at,vpm.archived_at,vpm.created_at,vpm.updated_at
        FROM virtual_profile_media vpm WHERE vpm.user_id=ANY($2::bigint[])
      ON CONFLICT(job_id,pool_id) DO NOTHING
    `,[jobId,userIds]);

    let oldArchived=0,refsChanged=0;
    for(const userId of userIds){
      const pItems=items.filter(x=>Number(x.user_id)===userId);
      const newIds=pItems.map(x=>Number(x.media_id));
      // Incluye también pools históricos ya archivados: puede haber posts/Stories que todavía
      // apunten a una foto de un pack anterior. El rollback registra cada referencia exacta.
      const oldPosts=await client.query(`SELECT id,media_id,sort_order FROM virtual_profile_media WHERE user_id=$1 AND kind='post' AND NOT (media_id=ANY($2::bigint[])) ORDER BY sort_order,id`,[userId,newIds]);
      const archived=await client.query(`UPDATE virtual_profile_media SET active=FALSE,archived_at=COALESCE(archived_at,NOW()),updated_at=NOW() WHERE user_id=$1 AND active=TRUE AND NOT (media_id=ANY($2::bigint[]))`,[userId,newIds]);
      oldArchived+=archived.rowCount||0;
      for(const item of pItems){
        const label=item.kind==='avatar'?'Avatar principal':item.kind==='cover'?'Portada principal':`Foto ${Math.max(1,Number(item.sort_order)-10)}`;
        await client.query(`
          INSERT INTO virtual_profile_media(user_id,media_id,label,kind,tags,alt_text,active,featured,sort_order,updated_at)
          VALUES($1,$2,$3,$4,'[]'::jsonb,$5,TRUE,$6,$7,NOW())
          ON CONFLICT(user_id,media_id) DO UPDATE SET label=EXCLUDED.label,kind=EXCLUDED.kind,active=TRUE,featured=EXCLUDED.featured,sort_order=EXCLUDED.sort_order,archived_at=NULL,updated_at=NOW()
        `,[userId,Number(item.media_id),label,item.kind,`${item.username} · ${label}`,Boolean(item.featured),Number(item.sort_order)]);
      }
      const avatar=pItems.find(x=>x.kind==='avatar'); const cover=pItems.find(x=>x.kind==='cover');
      if(!avatar||!cover) throw jobError(`Faltan avatar o portada para @${pItems[0]?.username||userId}.`,'VIRTUAL_MASS_STAGING_INCOMPLETE');
      await client.query(`UPDATE users SET avatar=$2,cover=$3 WHERE id=$1 AND is_virtual=TRUE`,[userId,`/media/${Number(avatar.media_id)}`,`/media/${Number(cover.media_id)}`]);
      const newPosts=pItems.filter(x=>x.kind==='post').sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));
      const newPostsByOrder=new Map(newPosts.map(x=>[Number(x.sort_order),x]));
      for(let i=0;i<oldPosts.rows.length;i+=1){
        const old=oldPosts.rows[i];
        const replacement=newPostsByOrder.get(Number(old.sort_order)) || newPosts[i%Math.max(1,newPosts.length)];
        if(!replacement || Number(old.media_id)===Number(replacement.media_id)) continue;
        const posts=await client.query(`SELECT id FROM posts WHERE user_id=$1 AND media_id=$2 FOR UPDATE`,[userId,Number(old.media_id)]);
        for(const row of posts.rows){
          await client.query(`INSERT INTO virtual_media_import_refs(job_id,ref_type,ref_id,user_id,old_media_id,new_media_id) VALUES($1,'post',$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[jobId,Number(row.id),userId,Number(old.media_id),Number(replacement.media_id)]);
          await client.query(`UPDATE posts SET media_id=$2 WHERE id=$1`,[Number(row.id),Number(replacement.media_id)]); refsChanged+=1;
        }
        const stories=await client.query(`SELECT id FROM stories WHERE user_id=$1 AND media_id=$2 FOR UPDATE`,[userId,Number(old.media_id)]);
        for(const row of stories.rows){
          await client.query(`INSERT INTO virtual_media_import_refs(job_id,ref_type,ref_id,user_id,old_media_id,new_media_id) VALUES($1,'story',$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[jobId,Number(row.id),userId,Number(old.media_id),Number(replacement.media_id)]);
          await client.query(`UPDATE stories SET media_id=$2 WHERE id=$1`,[Number(row.id),Number(replacement.media_id)]); refsChanged+=1;
        }
      }
    }
    await client.query(`UPDATE media SET provider_meta=jsonb_set(jsonb_set(COALESCE(provider_meta,'{}'::jsonb),'{mass_import_stage}','"active"'::jsonb,true),'{mass_import_committed_at}',to_jsonb(NOW()::text),true) WHERE id IN (SELECT media_id FROM virtual_media_import_items WHERE job_id=$1) AND COALESCE(provider_meta->>'mass_import_job_id','')=$2`,[jobId,String(Number(jobId))]);
    await client.query(`UPDATE virtual_media_import_jobs SET status='completed',phase='completed',progress_percent=100,progress_message='Importación aplicada correctamente.',old_images_archived=$2,refs_relinked=$3,committed_at=NOW(),updated_at=NOW() WHERE id=$1`,[jobId,oldArchived,refsChanged]);
    return {profiles:userIds.length,images:items.length,old_images_archived:oldArchived,refs_relinked:refsChanged};
  });
  await db.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'virtual_mass_media_commit',$2)`,[Number(adminId),JSON.stringify({job_id:Number(jobId),...result}).slice(0,1000)]).catch(()=>{});
  return result;
}

async function rollbackMassImportJob({db,withTransaction,jobId,adminId}) {
  const result=await withTransaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock($1)',[MASS_IMPORT_ADVISORY_LOCK]);
    const lock=await client.query(`SELECT * FROM virtual_media_import_jobs WHERE id=$1 FOR UPDATE`,[Number(jobId)]);
    const job=lock.rows[0];
    if(!job) throw jobError('Importación no encontrada.','VIRTUAL_MASS_NOT_FOUND',404);
    if(String(job.status)!=='completed') throw jobError('Solo se puede hacer rollback de una importación completada.','VIRTUAL_MASS_ROLLBACK_UNAVAILABLE',409);
    const newer=await client.query(`SELECT id,status FROM virtual_media_import_jobs WHERE id<>$1 AND ((id>$1 AND status='completed') OR status=ANY($2::varchar[])) ORDER BY id DESC LIMIT 1 FOR UPDATE`,[Number(jobId),['uploaded','validating','staging','ready','committing','rolling_back','cancelling']]);
    if(newer.rowCount) throw jobError(`No se puede revertir esta importación mientras la #${newer.rows[0].id} está activa o aplicada. Revierte primero la más reciente.`, 'VIRTUAL_MASS_ROLLBACK_SUPERSEDED',409);
    const {rows:profiles}=await client.query(`SELECT * FROM virtual_media_import_profile_snapshots WHERE job_id=$1 ORDER BY user_id`,[jobId]);
    if(!profiles.length) throw jobError('No existe snapshot para esta importación.','VIRTUAL_MASS_ROLLBACK_UNAVAILABLE',409);
    const userIds=profiles.map(x=>Number(x.user_id));
    // V1.12.41: un rollback masivo no puede pisar ajustes visuales individuales
    // realizados después de la importación. Primero deben deshacerse desde el editor.
    const manual=await client.query(`
      SELECT id,user_id,action_type,created_at
        FROM virtual_visual_actions
       WHERE user_id=ANY($1::bigint[]) AND status='applied' AND created_at>COALESCE($2,NOW())
       ORDER BY id DESC LIMIT 1
    `,[userIds,job.committed_at]);
    if(manual.rowCount) throw jobError(`Hay cambios visuales individuales posteriores a esta importación (acción #${manual.rows[0].id}). Deshazlos primero desde Gestión visual.`, 'VIRTUAL_MASS_ROLLBACK_HAS_MANUAL_CHANGES',409);
    await client.query(`UPDATE virtual_media_import_jobs SET status='rolling_back',phase='rollback',progress_message='Restaurando snapshot anterior…',updated_at=NOW() WHERE id=$1`,[jobId]);
    // Oculta el lote nuevo y restaura exactamente el estado previo del pool.
    await client.query(`UPDATE virtual_profile_media SET active=FALSE,archived_at=COALESCE(archived_at,NOW()),updated_at=NOW() WHERE user_id=ANY($1::bigint[])`,[userIds]);
    const {rows:snapshots}=await client.query(`SELECT * FROM virtual_media_import_pool_snapshots WHERE job_id=$1 ORDER BY pool_id`,[jobId]);
    for(const s of snapshots){
      await client.query(`
        INSERT INTO virtual_profile_media(id,user_id,media_id,label,kind,tags,alt_text,active,featured,sort_order,times_used,last_used_at,archived_at,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,media_id=EXCLUDED.media_id,label=EXCLUDED.label,kind=EXCLUDED.kind,tags=EXCLUDED.tags,alt_text=EXCLUDED.alt_text,active=EXCLUDED.active,featured=EXCLUDED.featured,sort_order=EXCLUDED.sort_order,times_used=EXCLUDED.times_used,last_used_at=EXCLUDED.last_used_at,archived_at=EXCLUDED.archived_at,updated_at=NOW()
      `,[Number(s.pool_id),Number(s.user_id),Number(s.media_id),s.label,s.kind,JSON.stringify(s.tags||[]),s.alt_text,Boolean(s.active),Boolean(s.featured),Number(s.sort_order),Number(s.times_used||0),s.last_used_at,s.archived_at,s.created_at,s.updated_at]);
    }
    for(const p of profiles) await client.query(`UPDATE users SET avatar=$2,cover=$3 WHERE id=$1 AND is_virtual=TRUE`,[Number(p.user_id),p.avatar,p.cover]);
    const {rows:refs}=await client.query(`SELECT * FROM virtual_media_import_refs WHERE job_id=$1 ORDER BY id`,[jobId]);
    let restoredRefs=0;
    for(const ref of refs){
      if(ref.ref_type==='post'){
        const q=await client.query(`UPDATE posts SET media_id=$2 WHERE id=$1 AND media_id=$3`,[Number(ref.ref_id),Number(ref.old_media_id),Number(ref.new_media_id)]);restoredRefs+=q.rowCount||0;
      } else if(ref.ref_type==='story'){
        const q=await client.query(`UPDATE stories SET media_id=$2 WHERE id=$1 AND media_id=$3`,[Number(ref.ref_id),Number(ref.old_media_id),Number(ref.new_media_id)]);restoredRefs+=q.rowCount||0;
      }
    }
    await client.query(`UPDATE media SET provider_meta=jsonb_set(COALESCE(provider_meta,'{}'::jsonb),'{mass_import_stage}','"rolled_back"'::jsonb,true) WHERE id IN (SELECT media_id FROM virtual_media_import_items WHERE job_id=$1) AND COALESCE(provider_meta->>'mass_import_job_id','')=$2`,[jobId,String(Number(jobId))]);
    await client.query(`UPDATE virtual_media_import_jobs SET status='rolled_back',phase='rolled_back',progress_percent=100,progress_message='Rollback completado.',rolled_back_at=NOW(),updated_at=NOW() WHERE id=$1`,[jobId]);
    return {profiles:userIds.length,restored_pool_items:snapshots.length,restored_refs:restoredRefs};
  });
  await db.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'virtual_mass_media_rollback',$2)`,[Number(adminId),JSON.stringify({job_id:Number(jobId),...result}).slice(0,1000)]).catch(()=>{});
  return result;
}

async function cancelMassImportJob({db,jobId,adminId,destroyAsset}) {
  // Reclama el trabajo de forma atómica para que Confirmar no pueda competir con Cancelar.
  const claimed=await db.query(`
    UPDATE virtual_media_import_jobs
       SET status='cancelling',phase='cancelling',progress_message='Limpiando staging…',updated_at=NOW()
     WHERE id=$1 AND status=ANY($2::varchar[])
     RETURNING *
  `,[Number(jobId),['failed','ready']]);
  if(!claimed.rowCount){
    const current=await db.query(`SELECT status FROM virtual_media_import_jobs WHERE id=$1`,[Number(jobId)]);
    if(!current.rowCount) throw jobError('Importación no encontrada.','VIRTUAL_MASS_NOT_FOUND',404);
    throw jobError('Esta importación todavía está procesándose o ya fue aplicada; espera a que termine la preparación.','VIRTUAL_MASS_CANNOT_CANCEL',409);
  }
  const job=claimed.rows[0];
  if(job.temp_path) await fs.promises.unlink(String(job.temp_path)).catch(()=>{});
  const deleted=await cleanupStagedJobMedia({db,jobId,destroyAsset});
  await db.query(`UPDATE virtual_media_import_jobs SET status='cancelled',phase='cancelled',progress_message='Importación cancelada.',temp_path='',updated_at=NOW() WHERE id=$1 AND status='cancelling'`,[Number(jobId)]);
  await db.query(`INSERT INTO moderation_actions(admin_id,action,note) VALUES($1,'virtual_mass_media_cancel',$2)`,[Number(adminId),JSON.stringify({job_id:Number(jobId),staged_media_deleted:deleted}).slice(0,1000)]).catch(()=>{});
  return {deleted};
}

async function massImportJobDetail(db,jobId) {
  const {rows}=await db.query(`SELECT id,admin_id,archive_name,archive_sha256,archive_bytes,status,phase,total_profiles,total_images,processed_images,progress_percent,progress_message,error_message,summary,old_images_archived,refs_relinked,created_at,updated_at,ready_at,committed_at,rolled_back_at FROM virtual_media_import_jobs WHERE id=$1`,[Number(jobId)]);
  const job=rows[0]; if(!job)return null;
  let rollbackAvailable=false,rollbackBlockReason='';
  if(String(job.status)==='completed'){
    const blocker=await db.query(`SELECT id,status FROM virtual_media_import_jobs WHERE id<>$1 AND ((id>$1 AND status='completed') OR status=ANY($2::varchar[])) ORDER BY id DESC LIMIT 1`,[Number(jobId),['uploaded','validating','staging','ready','committing','rolling_back','cancelling']]);
    rollbackAvailable=!blocker.rowCount;
    if(blocker.rowCount) rollbackBlockReason=`La importación #${blocker.rows[0].id} es posterior o está activa.`;
  }
  const items=await db.query(`SELECT id,user_id,username,source_path,kind,sort_order,featured,size_bytes,mime_type,sha256,media_id,reused,status,error_message FROM virtual_media_import_items WHERE job_id=$1 ORDER BY user_id,sort_order,id`,[Number(jobId)]);
  const profileMap=new Map();
  for(const item of items.rows){
    if(!profileMap.has(Number(item.user_id)))profileMap.set(Number(item.user_id),{user_id:Number(item.user_id),username:item.username,images:[]});
    profileMap.get(Number(item.user_id)).images.push({...item,media_id:item.media_id?Number(item.media_id):null});
  }
  return {...job,id:Number(job.id),rollback_available:rollbackAvailable,rollback_block_reason:rollbackBlockReason,profiles:[...profileMap.values()]};
}

async function massImportHistory(db,{limit=20}={}) {
  const safe=Math.min(50,Math.max(1,Number(limit)||20));
  const {rows}=await db.query(`SELECT id,archive_name,archive_sha256,archive_bytes,status,phase,total_profiles,total_images,processed_images,progress_percent,progress_message,error_message,summary,old_images_archived,refs_relinked,created_at,ready_at,committed_at,rolled_back_at FROM virtual_media_import_jobs ORDER BY id DESC LIMIT $1`,[safe]);
  return rows.map(x=>({...x,id:Number(x.id)}));
}

async function recoverInterruptedMassImports(db) {
  const {rows}=await db.query(`UPDATE virtual_media_import_jobs SET status='failed',phase='failed',error_message='Proceso interrumpido por reinicio del servidor. Vuelve a subir el ZIP.',progress_message='Importación interrumpida.',updated_at=NOW() WHERE status=ANY($1::varchar[]) RETURNING id,temp_path`,[[...ACTIVE_JOB_STATUSES].filter(x=>x!=='ready')]);
  for(const row of rows) if(row.temp_path) await fs.promises.unlink(String(row.temp_path)).catch(()=>{});
  return rows.length;
}

module.exports={
  MAX_ARCHIVE_ENTRIES,MAX_ARCHIVE_UNCOMPRESSED,MAX_IMAGE_BYTES,MAX_IMAGES_TOTAL,MAX_IMAGES_PER_PROFILE,MIN_IMAGES_PER_PROFILE,EXPECTED_PROFILE_COUNT,MASS_IMPORT_ADVISORY_LOCK,
  insertJob,stageMassImportJob,failMassImportJob,commitMassImportJob,rollbackMassImportJob,cancelMassImportJob,massImportJobDetail,massImportHistory,recoverInterruptedMassImports,
  parseZipDirectoryFile,extractZipEntryFile,buildMassImportPlan
};
