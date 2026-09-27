const fs = require('fs');
const path = require('path');

const IMAGE_KINDS = new Set(['avatar','cover','post','story','teaser','gallery']);

function normalizeText(value='') {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function normalizeTags(value) {
  let raw=value;
  if (typeof raw === 'string') {
    try { raw=JSON.parse(raw); }
    catch { raw=raw.split(','); }
  }
  if (!Array.isArray(raw)) raw=[];
  return [...new Set(raw.map(v=>normalizeText(v).slice(0,40)).filter(Boolean))].slice(0,20);
}

function safeKind(value='post') {
  const kind=String(value || 'post').toLowerCase();
  return IMAGE_KINDS.has(kind) ? kind : 'post';
}

async function listVirtualProfileMedia(db,userId,{includeArchived=true}={}) {
  const params=[Number(userId)];
  const archiveClause=includeArchived ? '' : 'AND vpm.archived_at IS NULL AND vpm.active=TRUE';
  const {rows}=await db.query(`
    SELECT vpm.id,vpm.user_id,vpm.media_id,vpm.label,vpm.kind,vpm.tags,vpm.alt_text,vpm.active,vpm.featured,
           vpm.sort_order,vpm.times_used,vpm.last_used_at,vpm.archived_at,vpm.created_at,vpm.updated_at,
           m.mime_type,m.original_name,m.provider,m.provider_id,m.secure_url,m.provider_status,m.width,m.height,m.format,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object('usage_type',hist.usage_type,'post_id',hist.post_id,'story_id',hist.story_id,'used_at',hist.used_at) ORDER BY hist.used_at DESC)
               FROM (SELECT usage_type,post_id,story_id,used_at FROM virtual_profile_media_usage vpu WHERE vpu.virtual_profile_media_id=vpm.id ORDER BY used_at DESC LIMIT 8) hist
           ),'[]'::jsonb) AS recent_usage
      FROM virtual_profile_media vpm
      JOIN media m ON m.id=vpm.media_id
     WHERE vpm.user_id=$1 ${archiveClause}
     ORDER BY vpm.archived_at NULLS FIRST,
              CASE vpm.kind WHEN 'avatar' THEN 0 WHEN 'cover' THEN 1 WHEN 'teaser' THEN 2 WHEN 'post' THEN 3 WHEN 'story' THEN 4 ELSE 5 END,
              vpm.sort_order,vpm.id
  `,params);
  return rows.map(row=>({...row,tags:Array.isArray(row.tags)?row.tags:normalizeTags(row.tags)}));
}

function scoreCandidate(row,text,usageType) {
  const normalized=normalizeText(text);
  const tags=Array.isArray(row.tags)?row.tags:normalizeTags(row.tags);
  let score=0;
  if (usageType==='story' && row.kind==='story') score+=36;
  if (usageType==='post' && row.kind==='post') score+=32;
  if (row.kind==='gallery') score+=18;
  if (row.kind==='teaser') score+=8;
  for (const tag of tags) if (tag && normalized.includes(tag)) score+=28;
  const used=Number(row.times_used||0);
  score-=Math.min(60,used*6);
  if (!row.last_used_at) score+=45;
  else {
    const ageDays=Math.max(0,(Date.now()-new Date(row.last_used_at).getTime())/86400000);
    score+=Math.min(35,ageDays*5);
    if (ageDays<5) score-=28;
  }
  score-=Math.max(0,Number(row.sort_order||0))*0.05;
  return score;
}

async function selectVirtualProfileMedia(db,{userId,text='',usageType='post'}={}) {
  const allowed=usageType==='story' ? ['story','post','gallery'] : ['post','gallery','teaser'];
  const {rows}=await db.query(`
    SELECT vpm.*,m.provider_status,m.resource_type
      FROM virtual_profile_media vpm
      JOIN media m ON m.id=vpm.media_id
     WHERE vpm.user_id=$1
       AND vpm.active=TRUE
       AND vpm.archived_at IS NULL
       AND vpm.kind=ANY($2::varchar[])
       AND m.provider_status='ready'
       AND COALESCE(m.resource_type,'image') IN ('','image')
  `,[Number(userId),allowed]);
  if (!rows.length) return null;
  const ranked=rows.map(row=>({...row,tags:Array.isArray(row.tags)?row.tags:normalizeTags(row.tags),_score:scoreCandidate(row,text,usageType)}))
    .sort((a,b)=>b._score-a._score || Number(a.times_used||0)-Number(b.times_used||0) || Number(a.id)-Number(b.id));
  return ranked[0] || null;
}

async function recordVirtualProfileMediaUsage(db,{poolId,userId,postId=null,storyId=null,usageType='post'}={}) {
  if (!poolId) return;
  await db.query(`
    UPDATE virtual_profile_media
       SET times_used=times_used+1,last_used_at=NOW(),updated_at=NOW()
     WHERE id=$1 AND user_id=$2
  `,[Number(poolId),Number(userId)]);
  await db.query(`
    INSERT INTO virtual_profile_media_usage(virtual_profile_media_id,user_id,post_id,story_id,usage_type,used_at)
    VALUES($1,$2,$3,$4,$5,NOW())
  `,[Number(poolId),Number(userId),postId||null,storyId||null,String(usageType||'post').slice(0,24)]);
}

const PILOT_ASSETS=[
  {key:'lucia-v1-avatar',file:'lucia-v1-avatar.jpg',kind:'avatar',label:'Avatar principal realista',tags:['retrato','interior','casual'],alt:'Retrato de Lucía V., anfitriona virtual de Instant Admirers',featured:true,width:1000,height:1000},
  {key:'lucia-v1-cover',file:'lucia-v1-cover.jpg',kind:'cover',label:'Portada Málaga al atardecer',tags:['malaga','atardecer','terraza','viajes'],alt:'Lucía V. en una terraza de Málaga al atardecer',featured:false,width:1600,height:900},
  {key:'lucia-v1-cafe',file:'lucia-v1-cafe.jpg',kind:'post',label:'Café en Málaga',tags:['cafe','malaga','paseos','gastronomia'],alt:'Lucía V. tomando café en Málaga',featured:true,width:1080,height:1350},
  {key:'lucia-v1-costa',file:'lucia-v1-costa.jpg',kind:'post',label:'Paseo por la costa',tags:['playa','costa','paseos','viajes','malaga'],alt:'Lucía V. paseando junto al mar en Málaga',featured:false,width:1080,height:1350},
  {key:'lucia-v1-cine',file:'lucia-v1-cine.jpg',kind:'post',label:'Noche de cine',tags:['cine','series','casa','palomitas'],alt:'Lucía V. disfrutando de una noche de cine en casa',featured:false,width:1080,height:1350},
  {key:'lucia-v1-tapas',file:'lucia-v1-tapas.jpg',kind:'post',label:'Tapas y gastronomía',tags:['gastronomia','tapas','restaurantes','malaga'],alt:'Lucía V. disfrutando de tapas en Málaga',featured:false,width:1080,height:1350}
];

async function syncPilotVirtualImages(db) {
  const found=await db.query(`SELECT id,username,avatar,cover FROM users WHERE LOWER(username)=LOWER('lucia.vidal.01') AND is_virtual=TRUE LIMIT 1`);
  const user=found.rows[0];
  if (!user) return {installed:false,reason:'profile-not-created'};
  const currentAvatar=String(user.avatar||'');
  const isSeedAvatar=!currentAvatar || currentAvatar.startsWith('/assets/virtual/avatar-');
  if (!isSeedAvatar) return {installed:true,added:0,user_id:Number(user.id),reason:'already-initialized-or-customized'};
  const publicDir=path.join(__dirname,'..','public','assets','virtual');
  let added=0;
  const ids={};
  for (const asset of PILOT_ASSETS) {
    const rel=`/assets/virtual/${asset.file}`;
    const abs=path.join(publicDir,asset.file);
    if (!fs.existsSync(abs)) continue;
    let media=(await db.query(`SELECT id FROM media WHERE user_id=$1 AND provider='virtual_local' AND provider_id=$2 LIMIT 1`,[user.id,asset.key])).rows[0];
    if (!media) {
      const inserted=await db.query(`
        INSERT INTO media(user_id,mime_type,original_name,size_bytes,data,provider,provider_id,secure_url,resource_type,delivery_type,width,height,format,migrated_at,provider_status,provider_meta)
        VALUES($1,'image/jpeg',$2,$3,NULL,'virtual_local',$4,$5,'image','upload',$6,$7,'jpg',NOW(),'ready',$8::jsonb)
        RETURNING id
      `,[user.id,asset.file,fs.statSync(abs).size,asset.key,rel,asset.width,asset.height,JSON.stringify({virtual:true,synthetic:true,pilot:'v1.12.24',identity:'lucia.vidal.01'})]);
      media=inserted.rows[0]; added+=1;
    }
    ids[asset.kind]=ids[asset.kind]||Number(media.id);
    await db.query(`
      INSERT INTO virtual_profile_media(user_id,media_id,label,kind,tags,alt_text,active,featured,sort_order,times_used,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5::jsonb,$6,TRUE,$7,$8,0,NOW(),NOW())
      ON CONFLICT(user_id,media_id) DO UPDATE SET label=EXCLUDED.label,kind=EXCLUDED.kind,tags=EXCLUDED.tags,alt_text=EXCLUDED.alt_text,active=TRUE,featured=EXCLUDED.featured,archived_at=NULL,updated_at=NOW()
    `,[user.id,media.id,asset.label,asset.kind,JSON.stringify(asset.tags),asset.alt,Boolean(asset.featured),asset.kind==='avatar'?0:asset.kind==='cover'?1:10]);
  }
  // El piloto realista sustituye solo las cuatro escenas SVG iniciales de Lucía.
  // Se archivan (no se borran) para conservar cualquier referencia histórica.
  await db.query(`
    UPDATE virtual_profile_media vpm
       SET active=FALSE,archived_at=COALESCE(archived_at,NOW()),updated_at=NOW()
      FROM media m
     WHERE vpm.media_id=m.id AND vpm.user_id=$1
       AND m.provider='virtual_local' AND m.secure_url LIKE '/assets/virtual/scene-001-%'
  `,[user.id]);
  if (ids.avatar) await db.query(`UPDATE users SET avatar=$2 WHERE id=$1 AND (COALESCE(NULLIF(TRIM(avatar),''),'')='' OR avatar LIKE '/assets/virtual/avatar-%' OR avatar=$2)`,[user.id,`/media/${ids.avatar}`]);
  if (ids.cover) await db.query(`UPDATE users SET cover=$2 WHERE id=$1 AND (COALESCE(NULLIF(TRIM(cover),''),'')='' OR cover LIKE '/assets/virtual/cover-%' OR cover=$2)`,[user.id,`/media/${ids.cover}`]);
  return {installed:true,added,user_id:Number(user.id),avatar_media_id:ids.avatar||null,cover_media_id:ids.cover||null};
}

module.exports={IMAGE_KINDS,normalizeTags,safeKind,listVirtualProfileMedia,selectVirtualProfileMedia,recordVirtualProfileMediaUsage,syncPilotVirtualImages};
