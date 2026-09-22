const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEMO_PROFILE_COUNT = 24;
const DEMO_POSTS_PER_PROFILE = 6;
const DEMO_REELS = 18;
const DEMO_STORIES = 12;

const demoNames = [
  ['Alba','Valencia'],['Bruno','Sevilla'],['Carla','Madrid'],['Dani','Alicante'],['Elena','Bilbao'],['Fabio','Málaga'],
  ['Gala','Murcia'],['Hugo','Zaragoza'],['Irene','Granada'],['Joel','Vigo'],['Kiara','Palma'],['Leo','Córdoba'],
  ['Mara','A Coruña'],['Nico','Valladolid'],['Olivia','Gijón'],['Pablo','Torrent'],['Rocío','Paterna'],['Saúl','Sagunto'],
  ['Tania','Castellón'],['Uri','Tarragona'],['Vera','Salamanca'],['Willy','Santander'],['Xenia','Pamplona'],['Yago','Toledo']
];

const postTexts = [
  'Probando el nuevo feed de Instant Admirers ✨ #InstantAdmirers #Prueba',
  'Un rincón para compartir, descubrir y conversar. Contenido de prueba 🚀 #Comunidad',
  '¿Foto, vídeo o conversación? Hoy toca probarlo todo 😄 #Prueba #Social',
  'Publicación automática del laboratorio para comprobar el scroll infinito. #Test',
  'Explorando perfiles y recomendaciones antes del lanzamiento. #InstantAdmirers',
  'Este contenido es de prueba y se puede eliminar desde Administración. #Demo',
  'Probando hashtags, comentarios y reacciones en el feed. #Prueba #Comunidad',
  'Un poco de contenido para verificar que móvil y escritorio cargan igual. #Test',
  'Probando recomendaciones y descubrimiento con actividad simulada. #Demo',
  'Feed de prueba listo para hacer scroll, abrir perfiles y cambiar de vista. #Prueba'
];

const headlines = [
  'Cuenta de prueba · fotografía y planes', 'Cuenta de prueba · música y viajes', 'Cuenta de prueba · cine y conversación',
  'Cuenta de prueba · deporte y escapadas', 'Cuenta de prueba · diseño y creatividad', 'Cuenta de prueba · tecnología y ocio'
];

function fileSize(rel) {
  try { return fs.statSync(path.join(__dirname, '..', 'public', rel.replace(/^\//,''))).size; }
  catch { return 0; }
}

async function createDemoEnvironment(client, adminUserId) {
  const existing = await client.query(`SELECT COUNT(*)::int AS count FROM users WHERE is_demo=TRUE`);
  if (existing.rows[0].count > 0) {
    const err = new Error('Ya existe un entorno de prueba. Elimínalo antes de generar otro.');
    err.statusCode = 409;
    throw err;
  }

  const batch = `demo-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 8);
  const demoUsers = [];

  for (let i = 0; i < DEMO_PROFILE_COUNT; i += 1) {
    const [baseName, location] = demoNames[i % demoNames.length];
    const username = `test_${baseName.toLowerCase()}_${batch.slice(-4)}`;
    const avatarIndex = (i % 8) + 1;
    const avatar = `/assets/demo/demo-${avatarIndex}.png`;
    const cover = `/assets/demo/demo-${((i + 3) % 8) + 1}.png`;
    const inviteCode = `t${crypto.randomBytes(7).toString('hex').slice(0,15)}`;
    const { rows } = await client.query(`
      INSERT INTO users (
        username,name,email,password_hash,bio,avatar,website,location,headline,interests,cover,
        role,account_status,onboarding_completed,age_confirmed_at,terms_accepted_at,terms_version,
        email_verified_at,invite_code,is_demo,demo_batch,created_at,last_seen_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,'',$7,$8,$9,$10,
        'user','active',TRUE,NOW(),NOW(),'2026-09-20',NOW(),$11,TRUE,$12,
        NOW()-($13::int * INTERVAL '3 hours'),NOW()-($14::int * INTERVAL '15 minutes')
      ) RETURNING id,username,name
    `, [
      username,
      `TEST · ${baseName}`,
      `${username}@example.invalid`,
      unusablePassword,
      'Cuenta sintética creada por el laboratorio de pruebas de Instant Admirers. No representa a una persona real.',
      avatar,
      location,
      headlines[i % headlines.length],
      'música, viajes, fotografía, cine, conversación',
      cover,
      inviteCode,
      batch,
      i,
      i % 10
    ]);
    demoUsers.push(rows[0]);
  }

  const mediaByUser = new Map();
  for (let i = 0; i < demoUsers.length; i += 1) {
    const user = demoUsers[i];
    const imageIdx = (i % 8) + 1;
    const videoIdx = (i % 4) + 1;
    const imagePath = `/assets/demo/demo-${imageIdx}.png`;
    const videoPath = `/assets/demo/demo-video-${videoIdx}.mp4`;
    const imageRow = await client.query(`
      INSERT INTO media (user_id,mime_type,original_name,size_bytes,data,provider,provider_id,secure_url,resource_type,width,height,format,migrated_at)
      VALUES ($1,'image/png',$2,$3,NULL,'demo',$4,$5,'image',1080,1080,'png',NOW()) RETURNING id
    `,[user.id,`demo-${imageIdx}.png`,fileSize(imagePath),`${batch}-img-${user.id}`,imagePath]);
    const videoRow = await client.query(`
      INSERT INTO media (user_id,mime_type,original_name,size_bytes,data,provider,provider_id,secure_url,resource_type,width,height,duration_seconds,format,migrated_at)
      VALUES ($1,'video/mp4',$2,$3,NULL,'demo',$4,$5,'video',540,960,4,'mp4',NOW()) RETURNING id
    `,[user.id,`demo-video-${videoIdx}.mp4`,fileSize(videoPath),`${batch}-vid-${user.id}`,videoPath]);
    mediaByUser.set(Number(user.id), { image: imageRow.rows[0].id, video: videoRow.rows[0].id });
  }

  const posts = [];
  let reelCount = 0;
  let postSeq = 0;
  for (let i = 0; i < demoUsers.length; i += 1) {
    const user = demoUsers[i];
    const media = mediaByUser.get(Number(user.id));
    for (let j = 0; j < DEMO_POSTS_PER_PROFILE; j += 1) {
      const shouldVideo = reelCount < DEMO_REELS && (j === 1 || (i % 4 === 0 && j === 4));
      const shouldImage = !shouldVideo && j % 2 === 0;
      const mediaId = shouldVideo ? media.video : (shouldImage ? media.image : null);
      const mediaType = shouldVideo ? 'video' : (shouldImage ? 'image' : 'none');
      if (shouldVideo) reelCount += 1;
      const hoursAgo = (postSeq * 2) + (i % 3);
      const { rows } = await client.query(`
        INSERT INTO posts (user_id,text,media_id,media_type,source,external_url,visibility,created_at)
        VALUES ($1,$2,$3,$4,'native','','public',NOW()-($5::int * INTERVAL '1 hour'))
        RETURNING id,user_id
      `,[user.id,`${postTexts[(i+j)%postTexts.length]} · ${postSeq+1}`,mediaId,mediaType,hoursAgo]);
      posts.push(rows[0]);
      postSeq += 1;
    }
  }

  // El administrador sigue varias cuentas demo para que "Siguiendo" tenga contenido.
  for (const user of demoUsers.slice(0, 14)) {
    if (Number(user.id) !== Number(adminUserId)) {
      await client.query(`INSERT INTO follows(follower_id,followed_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[adminUserId,user.id]);
    }
  }

  // Red de seguimiento entre cuentas demo para alimentar recomendaciones.
  for (let i = 0; i < demoUsers.length; i += 1) {
    const from = demoUsers[i];
    for (let step = 1; step <= 3; step += 1) {
      const to = demoUsers[(i + step) % demoUsers.length];
      await client.query(`INSERT INTO follows(follower_id,followed_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[from.id,to.id]);
    }
  }

  // Likes y comentarios sobre contenido demo.
  for (let i = 0; i < posts.length; i += 1) {
    const post = posts[i];
    const likerA = demoUsers[(i + 3) % demoUsers.length];
    const likerB = demoUsers[(i + 7) % demoUsers.length];
    await client.query(`INSERT INTO likes(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[likerA.id,post.id]);
    if (i % 2 === 0) await client.query(`INSERT INTO likes(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[likerB.id,post.id]);
    if (i % 5 === 0) {
      await client.query(`INSERT INTO comments(post_id,user_id,text,created_at) VALUES($1,$2,$3,NOW()-INTERVAL '20 minutes')`,[
        post.id, likerB.id, 'Comentario automático de prueba para revisar la conversación.'
      ]);
    }
  }

  // Stories activas.
  for (let i = 0; i < Math.min(DEMO_STORIES, demoUsers.length); i += 1) {
    const user = demoUsers[i];
    const media = mediaByUser.get(Number(user.id));
    const useVideo = i % 4 === 0;
    await client.query(`
      INSERT INTO stories(user_id,media_id,media_type,text,visibility,created_at,expires_at)
      VALUES($1,$2,$3,'Story de prueba','public',NOW()-($4::int * INTERVAL '12 minutes'),NOW()+INTERVAL '20 hours')
    `,[user.id,useVideo?media.video:media.image,useVideo?'video':'image',i]);
  }

  // Conversaciones de prueba con la cuenta administradora.
  for (const [idx, user] of demoUsers.slice(0,3).entries()) {
    const a = Math.min(Number(adminUserId), Number(user.id));
    const b = Math.max(Number(adminUserId), Number(user.id));
    const conv = await client.query(`
      INSERT INTO conversations(user1_id,user2_id,updated_at) VALUES($1,$2,NOW())
      ON CONFLICT(user1_id,user2_id) DO UPDATE SET updated_at=EXCLUDED.updated_at RETURNING id
    `,[a,b]);
    const conversationId = conv.rows[0].id;
    await client.query(`INSERT INTO messages(conversation_id,sender_id,text,created_at) VALUES($1,$2,$3,NOW()-INTERVAL '10 minutes')`,[
      conversationId,user.id,`Mensaje automático de prueba ${idx+1}. Puedes eliminar todo el laboratorio desde Administración.`
    ]);
  }

  return {
    batch,
    profiles: demoUsers.length,
    posts: posts.length,
    reels: reelCount,
    stories: Math.min(DEMO_STORIES, demoUsers.length)
  };
}

async function demoStatus(pool) {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE is_demo=TRUE) AS profiles,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=TRUE) AS posts,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_demo=TRUE AND p.media_type='video') AS reels,
      (SELECT COUNT(*)::int FROM stories s JOIN users u ON u.id=s.user_id WHERE u.is_demo=TRUE AND s.expires_at>NOW()) AS stories,
      (SELECT COUNT(*)::int FROM comments c JOIN users u ON u.id=c.user_id WHERE u.is_demo=TRUE) AS comments,
      (SELECT COUNT(*)::int FROM likes l JOIN users u ON u.id=l.user_id WHERE u.is_demo=TRUE) AS likes,
      (SELECT COUNT(*)::int FROM messages m JOIN users u ON u.id=m.sender_id WHERE u.is_demo=TRUE) AS messages,
      (SELECT MAX(demo_batch) FROM users WHERE is_demo=TRUE) AS batch
  `);
  const item = rows[0];
  return { ...item, active: Number(item.profiles || 0) > 0 };
}

async function clearDemoEnvironment(client) {
  const before = await client.query(`SELECT COUNT(*)::int AS count FROM users WHERE is_demo=TRUE`);
  const count = before.rows[0].count;
  if (!count) return { deleted_profiles:0 };
  await client.query(`DELETE FROM users WHERE is_demo=TRUE`);
  return { deleted_profiles:count };
}

module.exports = {
  createDemoEnvironment,
  clearDemoEnvironment,
  demoStatus,
  DEMO_PROFILE_COUNT,
  DEMO_POSTS_PER_PROFILE
};
