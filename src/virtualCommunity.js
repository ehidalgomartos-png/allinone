const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { selectVirtualProfileMedia, recordVirtualProfileMediaUsage } = require('./virtualImageSystem');

const VIRTUAL_PROFILE_COUNT = 100;
const VIRTUAL_WOMEN = 50;
const VIRTUAL_MEN = 50;

const women = ['Lucía','Sofía','Paula','Marta','Laura','Claudia','Irene','Carla','Elena','Nerea','Alba','Sara','Noelia','Andrea','Marina','Aitana','Alicia','Julia','Celia','Natalia','Eva','Rocío','Cristina','Inés','Lola','Silvia','Teresa','Beatriz','Raquel','Patricia','Ángela','Diana','Vera','Mónica','Lorena','Miriam','Carmen','Nuria','Adriana','Valeria','Emma','Daniela','Olivia','Ariadna','Leire','Amaia','Candela','Mireia','Elsa','Gabriela'];
const men = ['Hugo','Daniel','Pablo','Álvaro','Javier','David','Mario','Sergio','Adrián','Marcos','Carlos','Alejandro','Diego','Rubén','Víctor','Iván','Raúl','Óscar','Bruno','Leo','Mateo','Lucas','Gonzalo','Álex','Jorge','Miguel','Andrés','Fernando','Nicolás','Samuel','Eric','Iker','Borja','Guillermo','Martín','Rodrigo','Jaime','Jon','Manuel','Ángel','Gabriel','Thiago','Antonio','Fran','Saúl','Enzo','Héctor','Dani','Ismael','Nacho'];
const surnames = ['Moreno','Navarro','Soler','Vidal','Serra','Campos','Ríos','Molina','Ortega','Ferrer','Giménez','Pastor','Costa','Cano','Mora','Sáez','Pardo','Lozano','Reyes','Blasco','Crespo','Vega','Domínguez','Gallego','Prieto','Santos','Cabrera','Fuentes','Aguilar','Nieto','Peña','Iglesias','Marín','Benito','Calvo','Núñez','Esteban','Ramos','Herrero','Cortés','Méndez','Suárez','Moya','Arias','León','Carmona','Valero','Caballero','Pascual','Merino'];
const cities = ['Valencia','Madrid','Barcelona','Sevilla','Málaga','Alicante','Zaragoza','Bilbao','Murcia','Granada','Palma','Vigo','A Coruña','Córdoba','Valladolid','Gijón','Castellón','Tarragona','Salamanca','Santander','Pamplona','Toledo','Torrent','Paterna','Sagunto'];
const professions = ['Diseño gráfico','Marketing','Fotografía','Educación','Salud y bienestar','Tecnología','Hostelería','Administración','Arquitectura','Comercio','Comunicación','Moda','Deporte','Música','Turismo','Cocina','Logística','Arte','Finanzas','Eventos'];
const interestBundles = [
  ['viajes','fotografía','cafés','música'], ['cine','series','gastronomía','paseos'], ['deporte','senderismo','playa','viajes'],
  ['música','conciertos','festivales','amigos'], ['lectura','arte','museos','café'], ['fitness','nutrición','naturaleza','perros'],
  ['tecnología','gaming','cine','escapadas'], ['moda','fotografía','brunch','viajes'], ['cocina','restaurantes','mercados','playa'],
  ['running','montaña','fotografía','podcasts'], ['baile','música','viajes','terraza'], ['diseño','arquitectura','arte','ciudad'],
  ['fútbol','música','barbacoa','viajes'], ['yoga','bienestar','lectura','naturaleza'], ['motor','viajes','fotografía','gastronomía'],
  ['idiomas','viajes','cine','cultura'], ['animales','naturaleza','cocina','series'], ['surf','playa','música','deporte'],
  ['teatro','arte','vino','escapadas'], ['bicicleta','montaña','tecnología','cafés']
];
const headlineTemplates = [
  '{age} · {job} · siempre con un plan pendiente',
  '{age} · {job} · café, música y conversación',
  '{age} · {job} · descubriendo sitios nuevos',
  '{age} · {job} · más de planes improvisados que de agendas',
  '{age} · {job} · buen rollo y curiosidad',
  '{age} · {job} · buscando gente con cosas que contar',
  '{age} · {job} · de {i1}, {i2} y planes tranquilos',
  '{age} · {job} · viviendo {city} sin demasiada prisa',
  '{age} · {job} · siempre guardando el próximo sitio',
  '{age} · {job} · conversación, humor y ganas de descubrir',
  '{age} · {job} · mejor en persona que por bio',
  '{age} · {job} · coleccionando buenos planes, no cosas'
];
const bioTemplates = [
  'Me gustan los planes sencillos que terminan siendo los mejores. {i1}, {i2} y descubrir rincones nuevos. Si tienes una recomendación, te leo.',
  'Entre semana voy con mil cosas y el finde intento desconectar. Me pierdo fácil hablando de {i1}, {i2} y próximos viajes.',
  'Soy de conversación larga, humor fácil y planes sin demasiada complicación. Últimamente disfruto mucho de {i1} y {i2}.',
  'Siempre guardando sitios para visitar y canciones para escuchar. Me encontrarás entre {i1}, {i2} y alguna escapada improvisada.',
  'Me gusta conocer gente diferente, aprender cosas nuevas y no repetir siempre el mismo plan. Fan de {i1}, {i2} y las sobremesas largas.',
  'Prefiero una buena charla a veinte mensajes vacíos. Me interesan {i1}, {i2}, la gente curiosa y los planes que salen sin avisar.',
  'Vivo en {city} y todavía me quedan muchos rincones por descubrir. Si el plan incluye {i1} o {i2}, probablemente me apunto.',
  'Trabajo en {job}, pero fuera de ahí intento no hablar demasiado de trabajo. Me ganan {i1}, {i2} y un buen plan de última hora.',
  'Mi semana mejora bastante si hay algo de {i1}, tiempo para {i2} y gente con sentido del humor.',
  'No busco coleccionar conversaciones: prefiero conocer a poca gente pero de verdad. Suelo caer si aparece {i1} por medio.',
  'Tengo una lista demasiado larga de sitios pendientes en {city}. Entre eso, {i1} y {i2}, siempre encuentro alguna excusa para salir.',
  'Bastante normal: trabajo, amigos, planes, días de sofá y ganas de viajar más. Ahora mismo muy de {i1} y {i2}.',
  'Me gusta la gente que pregunta, escucha y se ríe de sí misma. Si además compartimos {i1}, ya tenemos tema.',
  'Intentando hacer más planes fuera de la pantalla. {i1}, {i2}, paseos largos y descubrir sitios donde se come bien.',
  'No soy demasiado de definirme en tres líneas. Pregunta por {i1}, {i2} o por el último sitio que me ha sorprendido en {city}.'
];
const postTemplates = [
  'Hoy necesitaba un rato de {i1}. A veces el mejor plan es el más sencillo ✨',
  'He añadido otro sitio a mi lista de “volver pronto”. ¿Vosotros sois de repetir o siempre buscáis algo nuevo?',
  'Plan improvisado y cero arrepentimiento. Así sí 😄',
  'Pequeñas cosas que arreglan el día: buena música, algo rico y tiempo sin mirar el reloj.',
  'Pregunta seria: ¿plan tranquilo o escapada de última hora este fin de semana?',
  'Últimamente estoy redescubriendo {i2}. Se aceptan recomendaciones 👀',
  'Un poco de aire, caminar sin prisa y volver con la cabeza más despejada.',
  'Hay conversaciones que empiezan con una tontería y terminan arreglando la semana.',
  'Hoy toca modo desconexión. Mañana ya veremos 😌',
  'Guardando ideas para el próximo plan. Si conocéis un sitio especial por {city}, contadme.',
  'Día de esos en los que apetece cambiar de escenario aunque sea solo un rato.',
  'Me he propuesto hacer más cosas que me apetecen y menos cosas “porque toca”. Vamos viendo.',
  'Necesito recomendaciones de {i1} por {city}. Seguro que se me están escapando sitios buenos.',
  'No esperaba gran cosa del plan de hoy y ha terminado siendo de los que se recuerdan.',
  '¿Qué canción tenéis ahora mismo en bucle? Necesito renovar un poco la lista 🎧',
  'Me quedo con los sitios donde puedes hablar sin mirar la hora. Cada vez valoro más eso.',
  'Un día normal, pero con un rato para {i2}. Ya cuenta como victoria.',
  '¿Sois de organizar el finde el lunes o decidirlo cuando ya es viernes por la tarde?',
  'Hoy he cambiado el camino de siempre solo por no repetir. Pequeño gesto, bastante buena idea.',
  'Tengo pendiente probar algo nuevo relacionado con {i1}. Acepto sugerencias de nivel principiante 😄',
  'Café largo, paseo y ninguna prisa. No necesito mucho más algunos días.',
  'Si alguien tiene un rincón favorito de {city} que no salga en todas las guías, escucho recomendaciones.',
  'Plan de hoy: móvil un poco más lejos y cabeza un poco más tranquila.',
  'He vuelto a {i2} después de bastante tiempo y no sé por qué lo había dejado.',
  '¿Qué preferís para conocer a alguien: café, paseo, cena o algo con un poco más de aventura?',
  'El mejor momento del día ha sido uno que ni siquiera estaba planeado.',
  'Hay semanas para hacer mil cosas y otras para bajar un poco el ritmo. Esta toca lo segundo.',
  'Me apetece descubrir algún plan diferente en {city}. Nada de lo de siempre, por favor 😄',
  'Una conversación interesante mejora cualquier sitio. Incluso el más normal.',
  'Entre {i1} y {i2} se me van demasiadas horas, pero no pienso quejarme.',
  'Hoy ha ganado el “vamos y ya vemos”. Debería usar esa estrategia más a menudo.',
  '¿Tenéis algún pequeño ritual para desconectar después de un día largo?',
  'Últimamente me da por guardar sitios y luego no ir nunca. Esta semana toca cambiar eso.',
  'Un poco de {i1}, algo de comer y buena compañía. Fórmula bastante difícil de mejorar.',
  'Día sencillo, cabeza tranquila. A veces eso es exactamente lo que hacía falta.',
  'Tengo curiosidad: ¿qué afición habéis empezado de adultos y os habría gustado descubrir antes?',
  'Hoy {city} estaba para caminar sin destino. Y eso he hecho.',
  'Necesitaba salir de la rutina aunque fuera solo durante un par de horas.',
  'Creo que mi tipo de plan favorito es el que empieza con “solo un rato” y se alarga.',
  'Se abre debate: ¿mejor descubrir un sitio nuevo o volver a ese que nunca falla?'
];
function slug(value='') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.+|\.+$/g,'').slice(0,24);
}
function seededNumber(seed, min, max) {
  const h=crypto.createHash('sha256').update(String(seed)).digest();
  return min + (h.readUInt32BE(0) % (max-min+1));
}
function assetSize(rel) {
  try { return fs.statSync(path.join(__dirname,'..','public',rel.replace(/^\//,''))).size; }
  catch { return 0; }
}
function fill(template, p) {
  return String(template).replaceAll('{age}',String(p.age)).replaceAll('{job}',p.profession).replaceAll('{i1}',p.interests[0]).replaceAll('{i2}',p.interests[1]).replaceAll('{city}',p.city);
}

function personas() {
  const all=[];
  for (let i=0;i<VIRTUAL_PROFILE_COUNT;i+=1) {
    const woman=i<VIRTUAL_WOMEN;
    const local=woman?i:i-VIRTUAL_WOMEN;
    const first=(woman?women:men)[local];
    const surname=surnames[(i*7+3)%surnames.length];
    const city=cities[(i*11+4)%cities.length];
    const age=22+((i*13+7)%25);
    const profession=professions[(i*9+2)%professions.length];
    const interests=interestBundles[(i*7+1)%interestBundles.length];
    const usernameBase=`${slug(first)}.${slug(surname)}`;
    all.push({
      index:i+1,
      gender:woman?'woman':'man', first, surname, name:`${first} ${surname.charAt(0)}.`,
      username:usernameBase, city, age, profession, interests,
      headline:fill(headlineTemplates[i%headlineTemplates.length],{age,profession,interests,city}),
      bio:`${fill(bioTemplates[(i*5)%bioTemplates.length],{age,profession,interests,city})} · Anfitrión virtual de Instant Admirers.`,
      tone:['cercano','tranquilo','curioso','espontáneo','divertido'][i%5]
    });
  }
  return all;
}

async function availableUsername(client, base, index) {
  const n=String(index).padStart(2,'0');
  const candidates=[`${base}.${n}`,`${base}.v${n}`,`${base}.ia${n}`];
  for(const raw of candidates){
    const candidate=raw.slice(0,30);
    const exists=await client.query(`SELECT 1 FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1`,[candidate]);
    if(!exists.rowCount) return candidate;
  }
  for(let attempt=0;attempt<20;attempt+=1){
    const suffix=crypto.randomBytes(2).toString('hex');
    const candidate=`${base.slice(0,23)}.${suffix}`.slice(0,30);
    const exists=await client.query(`SELECT 1 FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1`,[candidate]);
    if(!exists.rowCount) return candidate;
  }
  throw new Error('No se pudo reservar un usuario único para un anfitrión virtual.');
}

async function createLocalMedia(client, userId, profileIndex, scene) {
  const rel=`/assets/virtual/scene-${String(profileIndex).padStart(3,'0')}-${scene}.svg`;
  const result=await client.query(`
    INSERT INTO media(user_id,mime_type,original_name,size_bytes,data,provider,provider_id,secure_url,resource_type,delivery_type,width,height,format,migrated_at,provider_status,provider_meta)
    VALUES($1,'image/svg+xml',$2,$3,NULL,'virtual_local',$4,$5,'image','upload',1080,1080,'svg',NOW(),'ready',$6::jsonb)
    RETURNING id
  `,[userId,path.basename(rel),assetSize(rel),`virtual-${profileIndex}-${scene}`,rel,JSON.stringify({virtual:true,seed_scene:scene})]);
  await client.query(`INSERT INTO virtual_profile_media(user_id,media_id,label,active) VALUES($1,$2,$3,TRUE)`,[userId,result.rows[0].id,`Escena ${scene}`]);
  return Number(result.rows[0].id);
}

function makePostText(p, n=0) {
  return fill(postTemplates[(p.index*3+n*5)%postTemplates.length],p);
}


// V1.12.33 · Actividad virtual 2.0
// Mantiene la divulgación de perfil virtual y hace que la actividad programada sea
// menos uniforme: horarios diurnos, formatos mixtos, fin de semana, tono propio,
// anti-repetición e historial auditable desde Administración.
const activityTemplates = {
  morning: [
    'Empezando el día con calma y pensando en algún plan de {i1}. ¿Alguna recomendación por {city}?',
    'Mañana tranquila, café cerca y una lista demasiado larga de cosas que quiero hacer. Hoy toca elegir una 😄',
    'Hay días que empiezan mejor si sales un rato antes de meterte de lleno en todo. Hoy ha sido uno de esos.',
    'Primera decisión del día: hacer hueco para {i2}. La segunda todavía está pendiente.'
  ],
  afternoon: [
    'Pausa de media tarde y cabeza en modo próximo plan. Algo relacionado con {i1} no estaría nada mal.',
    'Hoy el día pedía cambiar un poco de escenario. A veces con eso basta para volver con otra energía.',
    'Entre una cosa y otra he terminado guardando otro sitio pendiente en {city}. La lista no para de crecer.',
    'Tarde sencilla: un rato para {i2}, algo rico y cero prisas. Difícil mejorarla.'
  ],
  evening: [
    'Cerrando el día con ganas de conversación y algún plan tranquilo. ¿Qué tal ha ido el vuestro?',
    'A estas horas siempre me entran ganas de organizar una escapada que seguramente acabaré improvisando 😄',
    'Hoy me quedo con un momento pequeño que no estaba planeado. Suelen ser los mejores.',
    'Noche de bajar revoluciones. Algo de {i1} y mañana será otro día.'
  ],
  weekend: [
    'Fin de semana sin agenda cerrada. Si aparece un plan de {i1}, probablemente me apunte.',
    'Hoy gana el “vamos y vemos”. Los mejores fines de semana suelen empezar así.',
    'Sábado/domingo de descubrir algún rincón nuevo de {city}. Se aceptan ideas.',
    'El finde mejora bastante cuando hay tiempo para {i2} y ninguna obligación mirando el reloj.',
    'Plan de fin de semana: salir de lo de siempre aunque sea solo un par de horas.'
  ],
  cercano: [
    'Me apetecía pasar por aquí y preguntar algo sencillo: ¿qué pequeño plan os ha alegrado la semana?',
    'Cada vez valoro más los planes que permiten hablar de verdad. Con {i1} de por medio, mejor todavía.'
  ],
  tranquilo: [
    'Hoy estoy en modo bajar un poco el ritmo. Un paseo, algo de {i2} y poco más hace falta.',
    'Día para no correr detrás de nada. A veces desconectar un rato es el mejor plan.'
  ],
  curioso: [
    'Curiosidad del día: ¿qué sitio de {city} recomendaríais a alguien que quiere salirse de lo típico?',
    'Pregunta abierta: ¿qué afición relacionada con {i1} os gustaría probar si tuvierais una tarde libre?'
  ],
  espontaneo: [
    'He cambiado de plan a última hora y creo que ha sido lo mejor del día. Improvisar tiene sus ventajas.',
    'Cero agenda para lo que queda de día. Si aparece algo relacionado con {i2}, mejor.'
  ],
  divertido: [
    'Mi talento de hoy: convertir un plan de una hora en media tarde 😄',
    'Confirmado: decir “solo un rato” sigue siendo una mentira bastante frecuente por aquí.'
  ]
};

const storyTemplates = [
  'Un momento del día ✨',
  'Pausa rápida y seguimos',
  'Plan improvisado 😄',
  'Un poco de aire por aquí',
  'Hoy tocaba salir de la rutina',
  'Guardando este momento',
  'Modo desconexión',
  'Un rincón de {city}',
  'Hoy: {i1}',
  'Pequeño plan, buen día'
];

function normalizeActivityText(value='') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}

function madridClock(date=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Madrid',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const weekdays={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const weekday=weekdays[parts.weekday] ?? date.getUTCDay();
  const hour=Number(parts.hour||0);
  return {weekday,hour,minute:Number(parts.minute||0),weekend:weekday===0||weekday===6};
}

function toneKey(value='') {
  const v=normalizeActivityText(value);
  if(v.includes('tranquilo')) return 'tranquilo';
  if(v.includes('curioso')) return 'curioso';
  if(v.includes('espont')) return 'espontaneo';
  if(v.includes('divert')) return 'divertido';
  return 'cercano';
}

function activityTextCandidates(p,{clock,tone='cercano'}={}) {
  const pool=[];
  if(clock?.weekend) pool.push(...activityTemplates.weekend);
  if((clock?.hour??12)<12) pool.push(...activityTemplates.morning);
  else if((clock?.hour??12)<19) pool.push(...activityTemplates.afternoon);
  else pool.push(...activityTemplates.evening);
  pool.push(...(activityTemplates[toneKey(tone)]||activityTemplates.cercano));
  pool.push(...postTemplates);
  return pool.map(t=>fill(t,p));
}

function pickFreshActivityText(p,{seq=0,clock=madridClock(),tone='cercano',recentTexts=[]}={}) {
  const candidates=activityTextCandidates(p,{clock,tone});
  const used=new Set((recentTexts||[]).map(normalizeActivityText).filter(Boolean));
  const start=seededNumber(`activity-text-${p.index}-${seq}-${clock.weekday}-${clock.hour}`,0,Math.max(0,candidates.length-1));
  for(let offset=0;offset<candidates.length;offset+=1){
    const candidate=candidates[(start+offset)%candidates.length];
    if(!used.has(normalizeActivityText(candidate))) return candidate;
  }
  return `${makePostText(p,seq)} ${seq%2===0?'✨':'🙂'}`;
}

function pickStoryText(p,{seq=0}={}) {
  return fill(storyTemplates[seededNumber(`story-text-${p.index}-${seq}`,0,storyTemplates.length-1)],p);
}

function activityKindFor(row,eventSeq) {
  const roll=seededNumber(`activity-kind-${row.user_id}-${eventSeq}`,0,99);
  if(roll<14) return 'story-only';
  if(roll<39) return 'post-text';
  if(roll<82) return 'post-photo';
  return 'post-photo-story';
}

function nextActivityDate(row,eventSeq,now=new Date()) {
  const postsPerWeek=Math.min(7,Math.max(1,Number(row.posts_per_week||3)));
  const baseHours=168/postsPerWeek;
  const tone=toneKey(row.tone);
  const factor=tone==='tranquilo'?1.12:tone==='espontaneo'?0.92:tone==='divertido'?0.96:1;
  const jitterPct=seededNumber(`activity-gap-${row.user_id}-${eventSeq}`,-24,26)/100;
  let hours=Math.max(12,Math.round(baseHours*factor*(1+jitterPct)));
  let candidate=new Date(now.getTime()+hours*3600000);
  let c=madridClock(candidate);
  // Nunca programar actividad automática de madrugada. El tick de servidor se
  // ejecuta cada 30 min, así que basta desplazar la siguiente fecha a la mañana.
  if(c.hour<8){
    hours+=8-c.hour+seededNumber(`activity-morning-${row.user_id}-${eventSeq}`,0,2);
  } else if(c.hour>=23){
    hours+=(24-c.hour)+8+seededNumber(`activity-morning-${row.user_id}-${eventSeq}`,0,2);
  }
  candidate=new Date(now.getTime()+hours*3600000);
  return candidate;
}

async function recordActivityLog(db,{userId,activityType,postId=null,storyId=null,mediaId=null,text='',metadata={}}={}) {
  const hash=text?crypto.createHash('sha256').update(normalizeActivityText(text)).digest('hex'):'';
  await db.query(`
    INSERT INTO virtual_activity_log(user_id,activity_type,post_id,story_id,media_id,text_hash,metadata,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,NOW())
  `,[Number(userId),String(activityType||'activity').slice(0,32),postId||null,storyId||null,mediaId||null,hash,JSON.stringify(metadata||{})]);
}

async function rescheduleVirtualActivity(db,{limit=100}={}) {
  const safeLimit=Math.min(100,Math.max(1,Number(limit)||100));
  const {rows}=await db.query(`
    SELECT vp.user_id,vp.posts_per_week,vp.tone,vp.persona_key
      FROM virtual_profiles vp JOIN users u ON u.id=vp.user_id
     WHERE vp.status='active' AND vp.auto_post_enabled=TRUE AND u.account_status='active' AND COALESCE(u.social_hidden,FALSE)=FALSE
     ORDER BY vp.user_id LIMIT $1
  `,[safeLimit]);
  let updated=0;
  const now=new Date();
  for(const row of rows){
    const idx=Number(String(row.persona_key||'').replace(/\D/g,''))||Number(row.user_id);
    // Distribuye los primeros eventos entre 1 y 72 horas para que no salgan todos juntos.
    const initialHours=seededNumber(`activity-reschedule-${idx}-${now.toISOString().slice(0,10)}`,1,72);
    let target=new Date(now.getTime()+initialHours*3600000);
    let clock=madridClock(target);
    if(clock.hour<8) target=new Date(target.getTime()+(8-clock.hour+seededNumber(`rs-a-${idx}`,0,2))*3600000);
    else if(clock.hour>=23) target=new Date(target.getTime()+((24-clock.hour)+8+seededNumber(`rs-b-${idx}`,0,2))*3600000);
    await db.query(`UPDATE virtual_profiles SET next_auto_post_at=$2,updated_at=NOW() WHERE user_id=$1`,[row.user_id,target]);
    updated+=1;
  }
  return {profiles:updated};
}

async function virtualActivityHistory(pool,{limit=24}={}) {
  const lim=Math.min(100,Math.max(1,Number(limit)||24));
  const {rows}=await pool.query(`
    SELECT val.id,val.user_id,u.username,u.name,u.avatar,val.activity_type,val.post_id,val.story_id,val.media_id,val.metadata,val.created_at,
           COALESCE(NULLIF(p.text,''),NULLIF(s.text,''),'') AS text
      FROM virtual_activity_log val
      JOIN users u ON u.id=val.user_id
      LEFT JOIN posts p ON p.id=val.post_id
      LEFT JOIN stories s ON s.id=val.story_id
     ORDER BY val.id DESC LIMIT $1
  `,[lim]);
  return rows;
}

async function createVirtualCommunity(client) {
  const existing=await client.query(`SELECT COUNT(*)::int AS count FROM users WHERE COALESCE(is_virtual,FALSE)=TRUE`);
  if(Number(existing.rows[0]?.count||0)>0){ const e=new Error('La comunidad virtual ya está creada.'); e.status=409; throw e; }
  const passwordHash=await bcrypt.hash(crypto.randomBytes(48).toString('hex'),8);
  const list=personas();
  const created=[];
  for(const p of list){
    const username=await availableUsername(client,p.username,p.index);
    const invite=`v${crypto.randomBytes(8).toString('hex').slice(0,15)}`;
    const avatar=`/assets/virtual/avatar-${String(p.index).padStart(3,'0')}.svg`;
    const cover=`/assets/virtual/cover-${String(p.index).padStart(3,'0')}.svg`;
    const inserted=await client.query(`
      INSERT INTO users(username,name,email,password_hash,bio,avatar,website,location,headline,interests,cover,
        role,account_status,onboarding_completed,age_confirmed_at,terms_accepted_at,terms_version,email_verified_at,invite_code,
        is_demo,is_virtual,social_hidden,account_private,public_profile_preview_enabled,message_policy,created_at,last_seen_at)
      VALUES($1,$2,$3,$4,$5,$6,'',$7,$8,$9,$10,'user','active',TRUE,NOW(),NOW(),'2026-09-20',NOW(),$11,FALSE,TRUE,FALSE,FALSE,TRUE,'everyone',NOW()-($12::int*INTERVAL '5 hours'),NOW()-($13::int*INTERVAL '1 hour'))
      RETURNING id,username,name
    `,[username,p.name,`${username}@virtual.invalid`,passwordHash,p.bio,avatar,p.city,p.headline,p.interests.join(', '),cover,invite,p.index%80,p.index%30]);
    const u=inserted.rows[0];
    const nextHours=seededNumber(`next-${p.index}`,3,30);
    await client.query(`
      INSERT INTO virtual_profiles(user_id,gender,age,persona_key,status,auto_post_enabled,reply_enabled,posts_per_week,tone,last_auto_post_at,next_auto_post_at,created_at,updated_at)
      VALUES($1,$2,$3,$4,'active',TRUE,TRUE,$5,$6,NOW()-INTERVAL '1 day',NOW()+($7::int*INTERVAL '1 hour'),NOW(),NOW())
    `,[u.id,p.gender,p.age,`persona-${p.index}`,2+(p.index%4),p.tone,nextHours]);
    const media=[];
    for(let scene=1;scene<=4;scene++) media.push(await createLocalMedia(client,u.id,p.index,scene));
    for(let n=0;n<3;n++){
      const mediaId=n<2?media[n]:null;
      const hoursAgo=(p.index%36)+(n*20)+1;
      const post=await client.query(`INSERT INTO posts(user_id,text,media_id,media_type,source,external_url,visibility,created_at) VALUES($1,$2,$3,$4,'virtual','','public',NOW()-($5::int*INTERVAL '1 hour')) RETURNING id`,[u.id,makePostText(p,n),mediaId,mediaId?'image':'none',hoursAgo]);
      created.push({postId:Number(post.rows[0].id),userId:Number(u.id),profile:p});
    }
  }

  // Los anfitriones no generan follows, likes ni comentarios artificiales entre ellos.
  // Así los contadores de interacción solo crecen con acciones reales de visitantes.
  const virtualUsers=(await client.query(`SELECT id FROM users WHERE is_virtual=TRUE ORDER BY id`)).rows.map(r=>Number(r.id));
  return {profiles:virtualUsers.length,women:VIRTUAL_WOMEN,men:VIRTUAL_MEN,posts:created.length};
}

async function runVirtualActivity(client,{force=false,limit=36}={}) {
  const safeLimit=Math.min(100,Math.max(1,Number(limit)||36));
  const due=await client.query(`
    SELECT vp.*,u.username,u.name,u.location,u.headline,u.interests
      FROM virtual_profiles vp JOIN users u ON u.id=vp.user_id
     WHERE vp.status='active' AND vp.auto_post_enabled=TRUE AND u.account_status='active' AND COALESCE(u.social_hidden,FALSE)=FALSE
       AND ($1::boolean=TRUE OR vp.next_auto_post_at IS NULL OR vp.next_auto_post_at<=NOW())
     ORDER BY COALESCE(vp.next_auto_post_at,'epoch'::timestamptz),vp.user_id
     LIMIT $2
  `,[Boolean(force),safeLimit]);

  let posts=0,stories=0,textPosts=0,photoPosts=0,storyOnly=0,quietRescheduled=0;
  const clockNow=madridClock(new Date());
  for(const row of due.rows){
    const idx=Number(String(row.persona_key||'').replace(/\D/g,'')) || ((Number(row.user_id)%100)+1);
    const interestList=String(row.interests||'').split(',').map(x=>x.trim()).filter(Boolean);
    const p={index:idx,age:Number(row.age||30),profession:String(row.headline||'').split('·')[1]?.trim()||'proyectos',interests:interestList.length>=2?interestList:['planes','música'],city:row.location||'España'};

    const eventCount=await client.query(`SELECT COUNT(*)::int AS count FROM virtual_activity_log WHERE user_id=$1`,[row.user_id]);
    const eventSeq=Number(eventCount.rows[0]?.count||0);

    // Actividad automática silenciosa de madrugada; una ejecución manual del admin sí puede forzarla.
    if(!force && (clockNow.hour<8 || clockNow.hour>=23)){
      const next=nextActivityDate({...row,posts_per_week:Math.max(Number(row.posts_per_week||3),5)},eventSeq,new Date());
      await client.query(`UPDATE virtual_profiles SET next_auto_post_at=$2,updated_at=NOW() WHERE user_id=$1`,[row.user_id,next]);
      quietRescheduled+=1;
      continue;
    }

    const recent=await client.query(`SELECT text FROM posts WHERE user_id=$1 AND source='virtual' ORDER BY created_at DESC,id DESC LIMIT 18`,[row.user_id]);
    const recentTexts=recent.rows.map(r=>r.text).filter(Boolean);
    const postText=pickFreshActivityText(p,{seq:eventSeq,clock:clockNow,tone:row.tone,recentTexts});
    let kind=activityKindFor(row,eventSeq);
    let postId=null,storyId=null,mediaId=null,selected=null,storyText='';

    if(kind==='story-only'){
      storyText=pickStoryText(p,{seq:eventSeq});
      selected=await selectVirtualProfileMedia(client,{userId:row.user_id,text:storyText,usageType:'story'});
      if(selected){
        mediaId=Number(selected.media_id);
        const inserted=await client.query(`INSERT INTO stories(user_id,media_id,media_type,text,visibility,created_at,expires_at) VALUES($1,$2,'image',$3,'public',NOW(),NOW()+INTERVAL '24 hours') RETURNING id`,[row.user_id,mediaId,storyText]);
        storyId=Number(inserted.rows[0].id);
        await recordVirtualProfileMediaUsage(client,{poolId:selected.id,userId:row.user_id,storyId,usageType:'story'});
        stories+=1;storyOnly+=1;
      } else {
        kind='post-text';
      }
    }

    if(kind!=='story-only'){
      if(kind!=='post-text') selected=await selectVirtualProfileMedia(client,{userId:row.user_id,text:postText,usageType:'post'});
      if(kind!=='post-text' && selected) mediaId=Number(selected.media_id);
      else if(kind!=='post-text' && !selected) kind='post-text';

      const insertedPost=await client.query(`INSERT INTO posts(user_id,text,media_id,media_type,source,external_url,visibility,created_at) VALUES($1,$2,$3,$4,'virtual','','public',NOW()) RETURNING id`,[row.user_id,postText,mediaId,mediaId?'image':'none']);
      postId=Number(insertedPost.rows[0].id);
      posts+=1;
      if(mediaId){
        photoPosts+=1;
        await recordVirtualProfileMediaUsage(client,{poolId:selected.id,userId:row.user_id,postId,usageType:'post'});
      } else textPosts+=1;

      if(kind==='post-photo-story' && mediaId){
        storyText=pickStoryText(p,{seq:eventSeq});
        const insertedStory=await client.query(`INSERT INTO stories(user_id,media_id,media_type,text,visibility,created_at,expires_at) VALUES($1,$2,'image',$3,'public',NOW(),NOW()+INTERVAL '24 hours') RETURNING id`,[row.user_id,mediaId,storyText]);
        storyId=Number(insertedStory.rows[0].id);
        await recordVirtualProfileMediaUsage(client,{poolId:selected.id,userId:row.user_id,storyId,usageType:'story'});
        stories+=1;
      }
    }

    await recordActivityLog(client,{
      userId:row.user_id,activityType:kind,postId,storyId,mediaId,text:postId?postText:storyText,
      metadata:{weekend:clockNow.weekend,hour:clockNow.hour,tone:toneKey(row.tone),forced:Boolean(force)}
    });

    const next=nextActivityDate(row,eventSeq+1,new Date());
    await client.query(`UPDATE virtual_profiles SET last_auto_post_at=NOW(),next_auto_post_at=$2,updated_at=NOW() WHERE user_id=$1`,[row.user_id,next]);
    await client.query(`UPDATE users SET last_seen_at=NOW() WHERE id=$1`,[row.user_id]);
  }
  return {
    profiles_processed:due.rows.length,
    posts,stories,
    text_posts:textPosts,
    photo_posts:photoPosts,
    story_only:storyOnly,
    quiet_rescheduled:quietRescheduled
  };
}

async function virtualCommunityStatus(pool) {
  const {rows}=await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER(WHERE vp.status='active')::int AS active,
      COUNT(*) FILTER(WHERE vp.status='paused')::int AS paused,
      COUNT(*) FILTER(WHERE vp.status='retired')::int AS retired,
      COUNT(*) FILTER(WHERE vp.gender='woman')::int AS women,
      COUNT(*) FILTER(WHERE vp.gender='man')::int AS men,
      COUNT(*) FILTER(WHERE vp.status='active' AND vp.auto_post_enabled=TRUE)::int AS auto_enabled,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_virtual=TRUE AND p.created_at>=CURRENT_DATE) AS posts_today,
      (SELECT COUNT(*)::int FROM virtual_profile_media vpm WHERE vpm.active=TRUE AND vpm.archived_at IS NULL) AS media_total,
      (SELECT COUNT(*)::int FROM virtual_profile_media_usage WHERE used_at>=CURRENT_DATE) AS media_uses_today,
      (SELECT COUNT(*)::int FROM virtual_message_alerts WHERE replied_at IS NULL) AS inbox_unread,
      (SELECT COUNT(*)::int FROM virtual_activity_log WHERE created_at>=CURRENT_DATE) AS activity_events_today,
      (SELECT COUNT(*)::int FROM virtual_activity_log WHERE created_at>=CURRENT_DATE AND activity_type='post-text') AS text_posts_today,
      (SELECT COUNT(*)::int FROM virtual_activity_log WHERE created_at>=CURRENT_DATE AND activity_type IN ('post-photo','post-photo-story')) AS photo_posts_today,
      (SELECT COUNT(*)::int FROM virtual_activity_log WHERE created_at>=CURRENT_DATE AND (story_id IS NOT NULL)) AS stories_today,
      (SELECT COUNT(DISTINCT user_id)::int FROM virtual_activity_log WHERE created_at>=NOW()-INTERVAL '7 days') AS active_profiles_7d
    FROM virtual_profiles vp
  `);
  return rows[0]||{total:0,active:0,paused:0,retired:0,women:0,men:0,posts_today:0,inbox_unread:0,auto_enabled:0,activity_events_today:0,text_posts_today:0,photo_posts_today:0,stories_today:0,active_profiles_7d:0};
}

async function listVirtualProfiles(pool,{limit=24,q=''}={}) {
  const lim=Math.min(100,Math.max(1,Number(limit)||24));
  const pattern=`%${String(q||'').trim().slice(0,80)}%`;
  const {rows}=await pool.query(`
    SELECT u.id,u.username,u.name,u.avatar,u.location,u.headline,u.last_seen_at,
           vp.gender,vp.age,vp.status,vp.auto_post_enabled,vp.reply_enabled,vp.posts_per_week,vp.tone,vp.last_auto_post_at,vp.next_auto_post_at,
           (SELECT val.activity_type FROM virtual_activity_log val WHERE val.user_id=u.id ORDER BY val.id DESC LIMIT 1) AS last_activity_type,
           (SELECT COUNT(*)::int FROM posts p WHERE p.user_id=u.id) AS posts_count,
           (SELECT COUNT(*)::int FROM virtual_profile_media vpm WHERE vpm.user_id=u.id AND vpm.active=TRUE AND vpm.archived_at IS NULL) AS media_count,
           (SELECT COUNT(*)::int FROM virtual_profile_media vpm WHERE vpm.user_id=u.id AND vpm.featured=TRUE AND vpm.archived_at IS NULL) AS featured_media_count
      FROM virtual_profiles vp JOIN users u ON u.id=vp.user_id
     WHERE ($1='%%' OR u.username ILIKE $1 OR u.name ILIKE $1 OR u.location ILIKE $1 OR u.headline ILIKE $1)
     ORDER BY CASE vp.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,u.id
     LIMIT $2
  `,[pattern,lim]);
  return rows;
}

async function virtualInbox(pool,{limit=30}={}) {
  const lim=Math.min(100,Math.max(1,Number(limit)||30));
  const {rows}=await pool.query(`
    SELECT c.id AS conversation_id,vu.id AS virtual_user_id,vu.username AS virtual_username,vu.name AS virtual_name,vu.avatar AS virtual_avatar,
           ru.id AS real_user_id,ru.username AS real_username,ru.name AS real_name,ru.avatar AS real_avatar,
           lm.id AS last_message_id,lm.sender_id AS last_sender_id,lm.text AS last_message,lm.created_at AS last_message_at,
           COUNT(vma.id) FILTER(WHERE vma.replied_at IS NULL)::int AS unread_alerts
      FROM conversations c
      JOIN users vu ON vu.id=CASE WHEN EXISTS(SELECT 1 FROM users x WHERE x.id=c.user1_id AND x.is_virtual=TRUE) THEN c.user1_id ELSE c.user2_id END AND vu.is_virtual=TRUE
      JOIN users ru ON ru.id=CASE WHEN vu.id=c.user1_id THEN c.user2_id ELSE c.user1_id END AND COALESCE(ru.is_virtual,FALSE)=FALSE
      LEFT JOIN LATERAL (SELECT m.id,m.sender_id,m.text,m.created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) lm ON TRUE
      LEFT JOIN virtual_message_alerts vma ON vma.conversation_id=c.id
     GROUP BY c.id,vu.id,vu.username,vu.name,vu.avatar,ru.id,ru.username,ru.name,ru.avatar,lm.id,lm.sender_id,lm.text,lm.created_at
     ORDER BY (COUNT(vma.id) FILTER(WHERE vma.replied_at IS NULL)>0) DESC,COALESCE(lm.created_at,c.updated_at) DESC
     LIMIT $1
  `,[lim]);
  return rows;
}

module.exports={VIRTUAL_PROFILE_COUNT,VIRTUAL_WOMEN,VIRTUAL_MEN,personas,createVirtualCommunity,runVirtualActivity,rescheduleVirtualActivity,virtualActivityHistory,virtualCommunityStatus,listVirtualProfiles,virtualInbox};
