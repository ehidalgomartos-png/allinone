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


// V1.12.45 · Motor de actividad virtual 3.0
// Evoluciona Actividad 2.0 con ritmos personales, preferencias horarias, mezcla
// adaptativa de formatos, contexto local/intereses y anti-repetición global.
// Los perfiles siguen identificados como virtuales y los mensajes privados no se automatizan.
const activityTemplates = {
  morning: [
    'Empezando el día con calma y pensando en algún plan de {i1}. ¿Alguna recomendación por {city}?',
    'Mañana tranquila, café cerca y una lista demasiado larga de cosas que quiero hacer. Hoy toca elegir una 😄',
    'Hay días que empiezan mejor si sales un rato antes de meterte de lleno en todo. Hoy ha sido uno de esos.',
    'Primera decisión del día: hacer hueco para {i2}. La segunda todavía está pendiente.',
    'Hoy he empezado antes de lo habitual y me ha sentado bastante bien. Igual repito.',
    'Mañana de las que piden algo sencillo: café, paseo y un rato para {i1}.'
  ],
  afternoon: [
    'Pausa de media tarde y cabeza en modo próximo plan. Algo relacionado con {i1} no estaría nada mal.',
    'Hoy el día pedía cambiar un poco de escenario. A veces con eso basta para volver con otra energía.',
    'Entre una cosa y otra he terminado guardando otro sitio pendiente en {city}. La lista no para de crecer.',
    'Tarde sencilla: un rato para {i2}, algo rico y cero prisas. Difícil mejorarla.',
    'He conseguido sacar un rato para desconectar y ya me parece una pequeña victoria.',
    'La tarde se ha quedado perfecta para hacer algo distinto sin montar un plan enorme.'
  ],
  evening: [
    'Cerrando el día con ganas de conversación y algún plan tranquilo. ¿Qué tal ha ido el vuestro?',
    'A estas horas siempre me entran ganas de organizar una escapada que seguramente acabaré improvisando 😄',
    'Hoy me quedo con un momento pequeño que no estaba planeado. Suelen ser los mejores.',
    'Noche de bajar revoluciones. Algo de {i1} y mañana será otro día.',
    'Ya en modo tranquilo. Hoy no necesito mucho más que una buena conversación.',
    'Cerrando el día con la sensación de haber hecho menos cosas, pero haberlas disfrutado más.'
  ],
  weekend: [
    'Fin de semana sin agenda cerrada. Si aparece un plan de {i1}, probablemente me apunte.',
    'Hoy gana el “vamos y vemos”. Los mejores fines de semana suelen empezar así.',
    'Finde de descubrir algún rincón nuevo de {city}. Se aceptan ideas.',
    'El finde mejora bastante cuando hay tiempo para {i2} y ninguna obligación mirando el reloj.',
    'Plan de fin de semana: salir de lo de siempre aunque sea solo un par de horas.',
    'Este finde me apetece un plan pequeño pero diferente. Nada de llenar el día por llenarlo.'
  ],
  cercano: [
    'Me apetecía pasar por aquí y preguntar algo sencillo: ¿qué pequeño plan os ha alegrado la semana?',
    'Cada vez valoro más los planes que permiten hablar de verdad. Con {i1} de por medio, mejor todavía.',
    'Una buena conversación arregla más días de los que parece. Hoy vengo con ganas de una de esas.'
  ],
  tranquilo: [
    'Hoy estoy en modo bajar un poco el ritmo. Un paseo, algo de {i2} y poco más hace falta.',
    'Día para no correr detrás de nada. A veces desconectar un rato es el mejor plan.',
    'No todo tiene que ser un plan grande. Hoy me quedo con lo sencillo.'
  ],
  curioso: [
    'Curiosidad del día: ¿qué sitio de {city} recomendaríais a alguien que quiere salirse de lo típico?',
    'Pregunta abierta: ¿qué afición relacionada con {i1} os gustaría probar si tuvierais una tarde libre?',
    'Tengo curiosidad: ¿qué plan habéis descubierto casi por casualidad y ahora repetís siempre que podéis?'
  ],
  espontaneo: [
    'He cambiado de plan a última hora y creo que ha sido lo mejor del día. Improvisar tiene sus ventajas.',
    'Cero agenda para lo que queda de día. Si aparece algo relacionado con {i2}, mejor.',
    'Hoy he dicho que sí a un plan sin pensarlo demasiado. Buena decisión.'
  ],
  divertido: [
    'Mi talento de hoy: convertir un plan de una hora en media tarde 😄',
    'Confirmado: decir “solo un rato” sigue siendo una mentira bastante frecuente por aquí.',
    'Plan sencillo, cero expectativas y al final ha sido lo mejor del día. Clásico.'
  ]
};

const activityThemeTemplates = {
  local: [
    'Tengo pendiente descubrir un sitio nuevo en {city}. ¿Algún rincón que merezca de verdad la pena?',
    'Hoy me ha dado por caminar por {city} sin ruta. Siempre aparece algún sitio que no tenía fichado.',
    'Me gusta cuando una ciudad todavía consigue sorprenderte. {city} hoy lo ha hecho.'
  ],
  interest: [
    'Últimamente estoy volviendo bastante a {i1}. Se aceptan recomendaciones para no quedarme en lo de siempre.',
    'Hoy he sacado un rato para {i2} y me ha recordado por qué me gusta tanto.',
    'Si tuviera dos horas libres ahora mismo, probablemente acabarían siendo para {i1}.'
  ],
  social: [
    'Me quedo con los planes en los que se puede hablar sin mirar el reloj.',
    'Hay gente con la que una conversación de diez minutos termina siendo de dos horas. Eso siempre suma.',
    'Pregunta sencilla: ¿sois más de conocer gente tomando algo o haciendo algún plan?'
  ],
  discovery: [
    'Me he propuesto hacer al menos una cosa distinta esta semana. No hace falta que sea enorme.',
    'Últimamente intento cambiar algún detalle de la rutina cada pocos días. Funciona mejor de lo que esperaba.',
    'Tengo ganas de probar algo nuevo aunque sea en modo principiante total 😄'
  ],
  slow: [
    'Hoy necesitaba bajar un poco el ritmo y no llenar cada hueco del día.',
    'Un rato sin prisas me ha sentado mejor que cualquier plan complicado.',
    'Día sencillo, cabeza más tranquila. A veces no hace falta mucho más.'
  ],
  question: [
    'Pregunta del día: ¿qué plan pequeño os cambia el ánimo casi siempre?',
    '¿Qué preferís cuando queréis desconectar de verdad: salir, deporte, música o sofá?',
    '¿Qué sitio tenéis guardado desde hace meses y todavía no habéis ido?'
  ]
};

const storyTemplates = [
  'Un momento del día ✨','Pausa rápida y seguimos','Plan improvisado 😄','Un poco de aire por aquí',
  'Hoy tocaba salir de la rutina','Guardando este momento','Modo desconexión','Un rincón de {city}',
  'Hoy: {i1}','Pequeño plan, buen día','Un rato para {i2}','Sin demasiada prisa hoy',
  'Esto no estaba en el plan','Pausa merecida','Cambio de escenario','Un poco de {city} por aquí'
];

const activityMicroOpeners = [
  '', 'Hoy, ', 'Por aquí, ', 'Pequeño momento del día: ', 'Entre una cosa y otra, ', 'Sin planearlo mucho, '
];
const activityMicroClosers = [
  '', ' Me lo guardo para repetir.', ' Y con eso ya mejora bastante el día.', ' No hacía falta mucho más.',
  ' De esos momentos sencillos que suman.', ' A veces lo pequeño gana.'
];

function normalizeActivityText(value='') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}
function activityTextHash(value='') {
  const normalized=normalizeActivityText(value);
  return normalized?crypto.createHash('sha256').update(normalized).digest('hex'):'';
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
function activityRhythmFor(row={}) {
  const roll=seededNumber(`activity-rhythm-v3-${row.user_id||row.persona_key||0}`,0,99);
  if(roll<18) return 'pausado';
  if(roll<48) return 'equilibrado';
  if(roll<70) return 'social';
  if(roll<86) return 'explorador';
  return 'fin-de-semana';
}
function activityPreferredDaypart(row={},eventSeq=0) {
  const tone=toneKey(row.tone),rhythm=activityRhythmFor(row);
  const options=rhythm==='fin-de-semana'?['afternoon','evening','afternoon','morning']:
    tone==='tranquilo'?['morning','afternoon','evening']:
    tone==='divertido'||tone==='espontaneo'?['evening','afternoon','evening','morning']:
    ['afternoon','morning','evening','afternoon'];
  return options[seededNumber(`activity-daypart-v3-${row.user_id}-${eventSeq}`,0,options.length-1)];
}
function activityDaypartFromClock(clock={}) {
  const h=Number(clock.hour??12);return h<12?'morning':h<19?'afternoon':'evening';
}
function activityThemeFor(row={},eventSeq=0,clock=madridClock()) {
  const tone=toneKey(row.tone),rhythm=activityRhythmFor(row);
  const base=clock.weekend?['local','social','interest','discovery','slow']:['interest','local','question','slow','social','discovery'];
  if(tone==='curioso') base.push('question','discovery');
  if(tone==='tranquilo') base.push('slow');
  if(rhythm==='explorador') base.push('local','discovery');
  return base[seededNumber(`activity-theme-v3-${row.user_id}-${eventSeq}-${clock.weekday}`,0,base.length-1)];
}
function activityTextCandidates(p,{clock,tone='cercano',theme='social',profileIndex=0,seq=0}={}) {
  const pool=[];
  if(clock?.weekend) pool.push(...activityTemplates.weekend);
  if((clock?.hour??12)<12) pool.push(...activityTemplates.morning);
  else if((clock?.hour??12)<19) pool.push(...activityTemplates.afternoon);
  else pool.push(...activityTemplates.evening);
  pool.push(...(activityThemeTemplates[theme]||activityThemeTemplates.social));
  pool.push(...(activityTemplates[toneKey(tone)]||activityTemplates.cercano));
  pool.push(...postTemplates);
  const opener=activityMicroOpeners[seededNumber(`activity-open-${profileIndex}-${seq}`,0,activityMicroOpeners.length-1)];
  const closer=activityMicroClosers[seededNumber(`activity-close-${profileIndex}-${seq}`,0,activityMicroClosers.length-1)];
  const expanded=[];
  for(const raw of pool){
    const base=fill(raw,p);
    expanded.push(base);
    if(opener) expanded.push(`${opener}${base.charAt(0).toLowerCase()}${base.slice(1)}`);
    if(closer && base.length<210) expanded.push(`${base}${closer}`);
  }
  return [...new Set(expanded)];
}
function pickFreshActivityText(p,{seq=0,clock=madridClock(),tone='cercano',theme='social',recentTexts=[],globalHashes=new Set()}={}) {
  const candidates=activityTextCandidates(p,{clock,tone,theme,profileIndex:p.index,seq});
  const used=new Set((recentTexts||[]).map(normalizeActivityText).filter(Boolean));
  const start=seededNumber(`activity-text-v3-${p.index}-${seq}-${clock.weekday}-${clock.hour}-${theme}`,0,Math.max(0,candidates.length-1));
  let avoided=0;
  for(let offset=0;offset<candidates.length;offset+=1){
    const candidate=candidates[(start+offset)%candidates.length];
    const normalized=normalizeActivityText(candidate),hash=activityTextHash(candidate);
    if(used.has(normalized) || (hash&&globalHashes.has(hash))){avoided+=1;continue;}
    return {text:candidate,hash,avoided};
  }
  const fallback=fill(`Hoy me apetecía hacer algo relacionado con {i1} por {city}, sin convertirlo en un plan enorme.${seq%2===0?' Se agradecen ideas.':' A veces improvisar funciona.'}`,p);
  return {text:fallback,hash:activityTextHash(fallback),avoided};
}
function pickFreshStoryText(p,{seq=0,globalHashes=new Set()}={}) {
  const start=seededNumber(`story-text-v3-${p.index}-${seq}`,0,storyTemplates.length-1);
  let avoided=0;
  for(let offset=0;offset<storyTemplates.length;offset+=1){
    const base=fill(storyTemplates[(start+offset)%storyTemplates.length],p);
    const variants=[base,`${base} · ${p.city}`,`${base} · ${p.interests[0]}`];
    for(const text of variants){
      const hash=activityTextHash(text);
      if(!hash||!globalHashes.has(hash)) return {text,hash,avoided};
      avoided+=1;
    }
  }
  const endings=['sin prisa','por aquí','y seguimos','pequeño plan','un rato bueno','modo tranquilo'];
  const text=fill(`Un rato de {i1} en {city} · ${endings[seededNumber(`story-fallback-${p.index}-${seq}`,0,endings.length-1)]}`,p);
  return {text,hash:activityTextHash(text),avoided};
}
function weightedPick(seed,weights={}) {
  const entries=Object.entries(weights).filter(([,w])=>Number(w)>0);const total=entries.reduce((n,[,w])=>n+Number(w),0);
  if(!entries.length||total<=0)return 'post-photo';
  let roll=seededNumber(seed,1,Math.max(1,Math.round(total)));
  for(const [key,w] of entries){roll-=Number(w);if(roll<=0)return key;}
  return entries[entries.length-1][0];
}
function activityKindFor(row,eventSeq,{recentKinds=[],clock=madridClock()}={}) {
  const last=(recentKinds||[]).slice(0,8),counts=last.reduce((m,k)=>(m[k]=(m[k]||0)+1,m),{});
  const storyCount=(counts['story-only']||0)+(counts['post-photo-story']||0);
  const textCount=counts['post-text']||0,photoCount=(counts['post-photo']||0)+(counts['post-photo-story']||0);
  const weights={'story-only':14,'post-text':25,'post-photo':43,'post-photo-story':18};
  if(storyCount>=3){weights['story-only']=5;weights['post-photo-story']=8;}
  else if(storyCount===0&&last.length>=4){weights['story-only']+=10;weights['post-photo-story']+=6;}
  if(textCount>=3)weights['post-text']=10; else if(textCount===0&&last.length>=4)weights['post-text']+=12;
  if(photoCount>=5)weights['post-photo']-=10;
  if(clock.weekend){weights['post-photo-story']+=6;weights['story-only']+=4;}
  return weightedPick(`activity-kind-v3-${row.user_id}-${eventSeq}-${clock.weekday}`,weights);
}
function activityTargetHour(row,eventSeq,daypart=activityPreferredDaypart(row,eventSeq)) {
  const windows={morning:[9,11],afternoon:[13,18],evening:[19,22]},w=windows[daypart]||windows.afternoon;
  return seededNumber(`activity-hour-v3-${row.user_id}-${eventSeq}`,w[0],w[1]);
}
function alignActivityCandidate(row,eventSeq,candidate) {
  const preferred=activityPreferredDaypart(row,eventSeq),targetHour=activityTargetHour(row,eventSeq,preferred),clock=madridClock(candidate);
  let delta=targetHour-clock.hour;
  // Mantiene la cadencia base: solo alinea dentro de una ventana razonable y nunca retrocede demasiado.
  if(delta<-4) delta+=24;
  if(delta>12) delta=seededNumber(`activity-soft-align-${row.user_id}-${eventSeq}`,0,4);
  candidate=new Date(candidate.getTime()+delta*3600000);
  const aligned=madridClock(candidate);
  if(aligned.hour<8) candidate=new Date(candidate.getTime()+(8-aligned.hour+seededNumber(`activity-morning-a-${row.user_id}-${eventSeq}`,0,2))*3600000);
  else if(aligned.hour>=23) candidate=new Date(candidate.getTime()+((24-aligned.hour)+8+seededNumber(`activity-morning-b-${row.user_id}-${eventSeq}`,0,2))*3600000);
  return candidate;
}
function nextActivityDate(row,eventSeq,now=new Date()) {
  const postsPerWeek=Math.min(7,Math.max(1,Number(row.posts_per_week||3))),baseHours=168/postsPerWeek;
  const rhythm=activityRhythmFor(row),tone=toneKey(row.tone);
  const rhythmFactor={pausado:1.18,equilibrado:1,social:.91,explorador:.97,'fin-de-semana':1.04}[rhythm]||1;
  const toneFactor=tone==='tranquilo'?1.08:tone==='espontaneo'?.94:tone==='divertido'?.96:1;
  const jitterPct=seededNumber(`activity-gap-v3-${row.user_id}-${eventSeq}`,-32,38)/100;
  let hours=Math.max(14,Math.min(168,Math.round(baseHours*rhythmFactor*toneFactor*(1+jitterPct))));
  // Algunos ciclos incluyen una pausa natural adicional; nunca más de 8 días entre citas programadas.
  const restRoll=seededNumber(`activity-rest-v3-${row.user_id}-${eventSeq}`,0,99);
  if((rhythm==='pausado'&&restRoll<28)||(rhythm==='fin-de-semana'&&restRoll<18)) hours=Math.min(192,hours+seededNumber(`activity-rest-hours-${row.user_id}-${eventSeq}`,8,28));
  return alignActivityCandidate(row,eventSeq,new Date(now.getTime()+hours*3600000));
}
function activityDeferralFor(row,recentRows=[],clock=madridClock(),force=false) {
  if(force)return null;
  const now=Date.now(),recent=(recentRows||[]).map(r=>({...r,_t:new Date(r.created_at||0).getTime()})).filter(r=>Number.isFinite(r._t));
  const last=recent[0],hoursSince=last?Math.max(0,(now-last._t)/3600000):999;
  const last24=recent.filter(r=>now-r._t<=24*3600000).length;
  if(last24>=2)return {reason:'daily-cap',hours:seededNumber(`activity-defer-cap-${row.user_id}-${now.toString().slice(0,6)}`,10,22)};
  if(hoursSince<7)return {reason:'min-gap',hours:seededNumber(`activity-defer-gap-${row.user_id}-${recent.length}`,8,16)};
  const rhythm=activityRhythmFor(row),restChance=rhythm==='pausado'?30:rhythm==='fin-de-semana'&&!clock.weekend?26:12;
  if(hoursSince<40&&seededNumber(`activity-defer-rest-${row.user_id}-${clock.weekday}-${new Date().toISOString().slice(0,10)}`,0,99)<restChance){
    return {reason:'natural-rest',hours:seededNumber(`activity-defer-rest-hours-${row.user_id}-${clock.weekday}`,10,26)};
  }
  return null;
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
  let updated=0;const now=new Date();
  for(const row of rows){
    const idx=Number(String(row.persona_key||'').replace(/\D/g,''))||Number(row.user_id);
    const postsPerWeek=Math.min(7,Math.max(1,Number(row.posts_per_week||3)));
    const spreadMax=Math.min(168,Math.max(48,Math.round((168/postsPerWeek)*2.4)));
    const initialHours=seededNumber(`activity-v3-reschedule-${idx}-${now.toISOString().slice(0,10)}`,2,spreadMax);
    const target=alignActivityCandidate(row,seededNumber(`activity-v3-reschedule-seq-${idx}`,0,20),new Date(now.getTime()+initialHours*3600000));
    await db.query(`UPDATE virtual_profiles SET next_auto_post_at=$2,updated_at=NOW() WHERE user_id=$1`,[row.user_id,target]);
    updated+=1;
  }
  return {profiles:updated,engine_version:'3.0'};
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


// V1.12.34 · Interacción virtual 2.0
// Interacciones moderadas y auditables de perfiles virtuales con contenido público
// de usuarios reales. No hay interacción virtual→virtual ni mensajes automáticos.
const interactionCommentTemplates = {
  generic: [
    'Me ha gustado leer esto 🙂',
    'Buen punto. A veces un plan sencillo es justo lo que hace falta.',
    'Esto da para una buena conversación 👀',
    'Me gusta la idea 😄',
    'Hay días en los que cambiar un poco de rutina viene genial.',
    'Me quedo con esa idea ✨',
    'Buen recordatorio para no dejar siempre los planes para otro día.',
    'Ese tipo de plan suele ser difícil de mejorar 🙂'
  ],
  question: [
    'Buena pregunta 😄 A ver qué responde la gente.',
    'Yo también tengo curiosidad por las respuestas 👀',
    'Esta pregunta abre debate del bueno.',
    'Difícil elegir una sola respuesta 😄',
    'Me apunto a leer recomendaciones por aquí.'
  ],
  city: [
    'Por {city} seguro que salen buenas recomendaciones.',
    '{city} siempre da para descubrir algún sitio nuevo.',
    'Guardando ideas para el próximo plan por {city} 👀'
  ]
};

function parseInterestList(value='') {
  return String(value||'').split(',').map(x=>normalizeActivityText(x)).filter(Boolean).slice(0,12);
}

function targetAffinityScore(virtualRow,target) {
  const vCity=normalizeActivityText(virtualRow.location||'');
  const tCity=normalizeActivityText(target.location||'');
  const vInterests=parseInterestList(virtualRow.interests);
  const targetText=normalizeActivityText(`${target.interests||''} ${target.text||''}`);
  const overlap=vInterests.filter(x=>x.length>=3 && targetText.includes(x)).length;
  const created=target.created_at ? new Date(target.created_at).getTime() : 0;
  const ageHours=created ? Math.max(0,(Date.now()-created)/3600000) : 999;
  let score=overlap*5;
  if(vCity && tCity && vCity===tCity) score+=8;
  if(ageHours<=24) score+=8;
  else if(ageHours<=72) score+=4;
  score-=Math.min(12,Number(target.target_virtual_today||0)*5);
  score+=seededNumber(`interaction-affinity-${virtualRow.user_id}-${target.id}`,0,4);
  return score;
}

function pickVirtualComment(virtualRow,target,{seq=0,recentHashes=[]}={}) {
  const p={
    city:String(virtualRow.location||'España'),
    interests:String(virtualRow.interests||'planes,música').split(',').map(x=>x.trim()).filter(Boolean)
  };
  if(p.interests.length<2) p.interests=['planes','música'];
  const pool=[];
  if(String(target.text||'').includes('?')) pool.push(...interactionCommentTemplates.question);
  const targetCity=normalizeActivityText(target.location||'');
  if(targetCity && normalizeActivityText(virtualRow.location||'')===targetCity) pool.push(...interactionCommentTemplates.city);
  pool.push(...interactionCommentTemplates.generic);
  const filled=pool.map(t=>fill(t,{...p,age:0,profession:'',interests:p.interests,city:p.city}));
  const recent=new Set(recentHashes||[]);
  const start=seededNumber(`interaction-comment-${virtualRow.user_id}-${target.id}-${seq}`,0,Math.max(0,filled.length-1));
  for(let offset=0;offset<filled.length;offset+=1){
    const text=filled[(start+offset)%filled.length];
    const hash=crypto.createHash('sha256').update(normalizeActivityText(text)).digest('hex');
    if(!recent.has(hash)) return {text,hash};
  }
  const text=filled[start]||'Me ha gustado leer esto 🙂';
  return {text,hash:crypto.createHash('sha256').update(normalizeActivityText(text)).digest('hex')};
}

function nextInteractionDate(row,eventSeq,now=new Date()) {
  const perDay=Math.min(4,Math.max(1,Number(row.interactions_per_day||2)));
  const baseHours=24/perDay;
  const jitter=seededNumber(`interaction-gap-${row.user_id}-${eventSeq}`,-25,35)/100;
  let hours=Math.max(3,Math.round(baseHours*(1+jitter)));
  let candidate=new Date(now.getTime()+hours*3600000);
  const clock=madridClock(candidate);
  if(clock.hour<8) candidate=new Date(candidate.getTime()+(8-clock.hour+seededNumber(`interaction-morning-a-${row.user_id}-${eventSeq}`,0,2))*3600000);
  else if(clock.hour>=23) candidate=new Date(candidate.getTime()+((24-clock.hour)+8+seededNumber(`interaction-morning-b-${row.user_id}-${eventSeq}`,0,2))*3600000);
  return candidate;
}

async function recordInteractionLog(db,{virtualUserId,targetUserId,interactionType,postId=null,commentId=null,textHash='',metadata={}}={}) {
  await db.query(`
    INSERT INTO virtual_interaction_log(virtual_user_id,target_user_id,interaction_type,post_id,comment_id,text_hash,metadata,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,NOW())
  `,[Number(virtualUserId),Number(targetUserId),String(interactionType||'like').slice(0,20),postId||null,commentId||null,String(textHash||'').slice(0,64),JSON.stringify(metadata||{})]);
}

async function addVirtualInteractionNotification(db,{targetUserId,virtualUserId,type,postId=null,commentId=null,text='',onNotification=null}={}) {
  if(Number(targetUserId)===Number(virtualUserId)) return;
  const {rows}=await db.query(`INSERT INTO notifications(user_id,actor_id,type,post_id,comment_id,text,created_at) VALUES($1,$2,$3,$4,$5,$6,NOW()) RETURNING id`,[
    Number(targetUserId),Number(virtualUserId),String(type),postId||null,commentId||null,String(text||'').slice(0,1000)
  ]);
  if(typeof onNotification==='function') onNotification({id:Number(rows[0]?.id||0)||null,userId:Number(targetUserId),actorId:Number(virtualUserId),type:String(type),postId:postId||null,commentId:commentId||null,text:String(text||'')});
}

async function rescheduleVirtualInteractions(db,{limit=100}={}) {
  const safeLimit=Math.min(100,Math.max(1,Number(limit)||100));
  const {rows}=await db.query(`
    SELECT vp.user_id,vp.interactions_per_day,vp.persona_key
      FROM virtual_profiles vp JOIN users u ON u.id=vp.user_id
     WHERE vp.status='active' AND vp.auto_interact_enabled=TRUE AND u.account_status='active' AND COALESCE(u.social_hidden,FALSE)=FALSE
     ORDER BY vp.user_id LIMIT $1
  `,[safeLimit]);
  const now=new Date();
  let updated=0;
  for(const row of rows){
    const idx=Number(String(row.persona_key||'').replace(/\D/g,''))||Number(row.user_id);
    const initialHours=seededNumber(`interaction-reschedule-${idx}-${now.toISOString().slice(0,10)}`,1,12);
    let target=new Date(now.getTime()+initialHours*3600000);
    const clock=madridClock(target);
    if(clock.hour<8) target=new Date(target.getTime()+(8-clock.hour+seededNumber(`ir-a-${idx}`,0,2))*3600000);
    else if(clock.hour>=23) target=new Date(target.getTime()+((24-clock.hour)+8+seededNumber(`ir-b-${idx}`,0,2))*3600000);
    await db.query(`UPDATE virtual_profiles SET next_auto_interact_at=$2,updated_at=NOW() WHERE user_id=$1`,[row.user_id,target]);
    updated+=1;
  }
  return {profiles:updated};
}

async function virtualInteractionHistory(pool,{limit=24}={}) {
  const lim=Math.min(100,Math.max(1,Number(limit)||24));
  const {rows}=await pool.query(`
    SELECT vil.id,vil.virtual_user_id,vu.username,vu.name,vu.avatar,vil.target_user_id,tu.username AS target_username,tu.name AS target_name,
           vil.interaction_type,vil.post_id,vil.comment_id,vil.metadata,vil.created_at,c.text AS comment_text,p.text AS post_text
      FROM virtual_interaction_log vil
      JOIN users vu ON vu.id=vil.virtual_user_id
      JOIN users tu ON tu.id=vil.target_user_id
      LEFT JOIN comments c ON c.id=vil.comment_id
      LEFT JOIN posts p ON p.id=vil.post_id
     ORDER BY vil.id DESC LIMIT $1
  `,[lim]);
  return rows;
}

async function runVirtualInteractions(client,{force=false,limit=12,onNotification=null}={}) {
  const safeLimit=Math.min(30,Math.max(1,Number(limit)||12));
  const clockNow=madridClock(new Date());
  const due=await client.query(`
    SELECT vp.*,u.username,u.name,u.location,u.headline,u.interests,
           (SELECT COUNT(*)::int FROM virtual_interaction_log vil WHERE vil.virtual_user_id=vp.user_id AND vil.created_at>=CURRENT_DATE) AS interactions_today,
           (SELECT MAX(vil.created_at) FROM virtual_interaction_log vil WHERE vil.virtual_user_id=vp.user_id) AS last_interaction_log_at
      FROM virtual_profiles vp JOIN users u ON u.id=vp.user_id
     WHERE vp.status='active' AND vp.auto_interact_enabled=TRUE AND u.account_status='active' AND COALESCE(u.social_hidden,FALSE)=FALSE
       AND (SELECT COUNT(*) FROM virtual_interaction_log vil WHERE vil.virtual_user_id=vp.user_id AND vil.created_at>=CURRENT_DATE) < vp.interactions_per_day
       AND ($1::boolean=TRUE OR vp.next_auto_interact_at IS NULL OR vp.next_auto_interact_at<=NOW())
     ORDER BY COALESCE(vp.next_auto_interact_at,'epoch'::timestamptz),vp.user_id
     LIMIT $2
  `,[Boolean(force),safeLimit]);

  let likes=0,comments=0,follows=0,scheduled=0,noTarget=0,quietRescheduled=0;
  for(const row of due.rows){
    const interactionSeq=Number((await client.query(`SELECT COUNT(*)::int AS count FROM virtual_interaction_log WHERE virtual_user_id=$1`,[row.user_id])).rows[0]?.count||0);

    // En despliegues existentes evitamos una ráfaga inicial: los perfiles sin fecha
    // se programan primero. El botón manual del admin sí puede forzar una prueba.
    if(!force && !row.next_auto_interact_at){
      const next=nextInteractionDate(row,interactionSeq,new Date());
      await client.query(`UPDATE virtual_profiles SET next_auto_interact_at=$2,updated_at=NOW() WHERE user_id=$1`,[row.user_id,next]);
      scheduled+=1;
      continue;
    }
    if(!force && (clockNow.hour<8 || clockNow.hour>=23)){
      const next=nextInteractionDate({...row,interactions_per_day:4},interactionSeq,new Date());
      await client.query(`UPDATE virtual_profiles SET next_auto_interact_at=$2,updated_at=NOW() WHERE user_id=$1`,[row.user_id,next]);
      quietRescheduled+=1;
      continue;
    }

    const candidates=await client.query(`
      SELECT p.id,p.user_id,p.text,p.created_at,u.username,u.name,u.location,u.interests,u.account_private,u.friend_gate_enabled,
             EXISTS(SELECT 1 FROM likes l WHERE l.user_id=$1 AND l.post_id=p.id) AS already_liked,
             EXISTS(SELECT 1 FROM comments c WHERE c.user_id=$1 AND c.post_id=p.id) AS already_commented,
             EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.followed_id=u.id) AS already_following,
             (SELECT COUNT(*)::int FROM virtual_interaction_log vt WHERE vt.target_user_id=u.id AND vt.created_at>=CURRENT_DATE) AS target_virtual_today
        FROM posts p JOIN users u ON u.id=p.user_id
       WHERE COALESCE(u.is_virtual,FALSE)=FALSE AND COALESCE(u.is_demo,FALSE)=FALSE
         AND u.account_status='active' AND COALESCE(u.social_hidden,FALSE)=FALSE
         AND COALESCE(u.account_private,FALSE)=FALSE AND COALESCE(u.friend_gate_enabled,FALSE)=FALSE
         AND p.visibility='public' AND p.created_at>=NOW()-INTERVAL '10 days'
         AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))
         AND NOT EXISTS(SELECT 1 FROM mutes m WHERE (m.muter_id=$1 AND m.muted_id=u.id) OR (m.muter_id=u.id AND m.muted_id=$1))
         AND NOT EXISTS(SELECT 1 FROM virtual_interaction_log vil WHERE vil.virtual_user_id=$1 AND vil.target_user_id=u.id AND vil.created_at>=NOW()-INTERVAL '36 hours')
         AND (SELECT COUNT(*) FROM virtual_interaction_log vt WHERE vt.target_user_id=u.id AND vt.created_at>=CURRENT_DATE) < 3
       ORDER BY p.created_at DESC,p.id DESC
       LIMIT 60
    `,[row.user_id]);

    if(!candidates.rowCount){
      const next=nextInteractionDate(row,interactionSeq+1,new Date());
      await client.query(`UPDATE virtual_profiles SET next_auto_interact_at=$2,updated_at=NOW() WHERE user_id=$1`,[row.user_id,next]);
      noTarget+=1;
      continue;
    }

    const ranked=candidates.rows.map(target=>({target,score:targetAffinityScore(row,target)})).sort((a,b)=>b.score-a.score || Number(b.target.id)-Number(a.target.id));
    const chosen=ranked[0];
    const target=chosen.target;
    const roll=seededNumber(`interaction-kind-${row.user_id}-${interactionSeq}-${target.id}`,0,99);
    const preferred=roll<56?'like':roll<84?'comment':'follow';
    const available=[];
    if(!target.already_liked) available.push('like');
    if(!target.already_commented) available.push('comment');
    if(!target.already_following) available.push('follow');
    if(!available.length){
      const next=nextInteractionDate(row,interactionSeq+1,new Date());
      await client.query(`UPDATE virtual_profiles SET next_auto_interact_at=$2,updated_at=NOW() WHERE user_id=$1`,[row.user_id,next]);
      noTarget+=1;
      continue;
    }
    const kind=available.includes(preferred)?preferred:available[seededNumber(`interaction-fallback-${row.user_id}-${interactionSeq}`,0,available.length-1)];
    let commentId=null,textHash='',performed=false;

    if(kind==='like'){
      const inserted=await client.query(`INSERT INTO likes(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id`,[row.user_id,target.id]);
      if(inserted.rowCount){
        await addVirtualInteractionNotification(client,{targetUserId:target.user_id,virtualUserId:row.user_id,type:'like',postId:target.id,onNotification});
        likes+=1;performed=true;
      }
    } else if(kind==='comment'){
      const recent=await client.query(`SELECT text_hash FROM virtual_interaction_log WHERE virtual_user_id=$1 AND interaction_type='comment' AND created_at>=NOW()-INTERVAL '30 days' ORDER BY id DESC LIMIT 20`,[row.user_id]);
      const picked=pickVirtualComment(row,target,{seq:interactionSeq,recentHashes:recent.rows.map(x=>x.text_hash).filter(Boolean)});
      const inserted=await client.query(`INSERT INTO comments(post_id,user_id,text,created_at) VALUES($1,$2,$3,NOW()) RETURNING id`,[target.id,row.user_id,picked.text]);
      commentId=Number(inserted.rows[0].id);textHash=picked.hash;
      await addVirtualInteractionNotification(client,{targetUserId:target.user_id,virtualUserId:row.user_id,type:'comment',postId:target.id,commentId,text:picked.text,onNotification});
      comments+=1;performed=true;
    } else {
      const inserted=await client.query(`INSERT INTO follows(follower_id,followed_id,created_at) VALUES($1,$2,NOW()) ON CONFLICT DO NOTHING RETURNING follower_id`,[row.user_id,target.user_id]);
      if(inserted.rowCount){
        await addVirtualInteractionNotification(client,{targetUserId:target.user_id,virtualUserId:row.user_id,type:'follow',onNotification});
        follows+=1;performed=true;
      }
    }

    if(performed) await recordInteractionLog(client,{
      virtualUserId:row.user_id,targetUserId:target.user_id,interactionType:kind,postId:kind==='follow'?null:target.id,commentId,textHash,
      metadata:{forced:Boolean(force),affinity:chosen.score,target_username:target.username,source:'virtual-interaction-2'}
    });
    const next=nextInteractionDate(row,interactionSeq+1,new Date());
    await client.query(`UPDATE virtual_profiles SET last_auto_interact_at=CASE WHEN $3::boolean THEN NOW() ELSE last_auto_interact_at END,next_auto_interact_at=$2,updated_at=NOW() WHERE user_id=$1`,[row.user_id,next,performed]);
    await client.query(`UPDATE users SET last_seen_at=NOW() WHERE id=$1`,[row.user_id]);
  }
  return {profiles_processed:due.rows.length,likes,comments,follows,scheduled,no_target:noTarget,quiet_rescheduled:quietRescheduled};
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

  // El seed inicial no genera relaciones ni métricas artificiales entre anfitriones.
  // V1.12.34 solo permite interacción automática con usuarios reales y siempre desde perfiles identificados como virtuales.
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

  const globalRecent=await client.query(`
    SELECT hash FROM (
      SELECT text_hash AS hash FROM virtual_activity_log WHERE created_at>=NOW()-INTERVAL '10 days' AND COALESCE(text_hash,'')<>''
      UNION ALL
      SELECT metadata->>'story_text_hash' AS hash FROM virtual_activity_log WHERE created_at>=NOW()-INTERVAL '10 days' AND COALESCE(metadata->>'story_text_hash','')<>''
    ) h
  `);
  const globalHashes=new Set(globalRecent.rows.map(r=>String(r.hash||'')).filter(Boolean));
  let posts=0,stories=0,textPosts=0,photoPosts=0,storyOnly=0,quietRescheduled=0,deferred=0,repeatCandidatesAvoided=0;
  const themes={};const rhythms={};const dayparts={};const clockNow=madridClock(new Date());

  for(const row of due.rows){
    const idx=Number(String(row.persona_key||'').replace(/\D/g,'')) || ((Number(row.user_id)%100)+1);
    const interestList=String(row.interests||'').split(',').map(x=>x.trim()).filter(Boolean);
    const p={index:idx,age:Number(row.age||30),profession:String(row.headline||'').split('·')[1]?.trim()||'proyectos',interests:interestList.length>=2?interestList:['planes','música'],city:row.location||'España'};

    const eventCount=await client.query(`SELECT COUNT(*)::int AS count FROM virtual_activity_log WHERE user_id=$1`,[row.user_id]);
    const eventSeq=Number(eventCount.rows[0]?.count||0);
    const recentLog=await client.query(`
      SELECT activity_type,metadata,created_at,text_hash FROM virtual_activity_log
       WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 16
    `,[row.user_id]);
    const recentRows=recentLog.rows||[],recentKinds=recentRows.map(r=>String(r.activity_type||''));

    // Actividad automática silenciosa de madrugada; una ejecución manual del admin sí puede forzarla.
    if(!force && (clockNow.hour<8 || clockNow.hour>=23)){
      const next=nextActivityDate({...row,posts_per_week:Math.max(Number(row.posts_per_week||3),5)},eventSeq,new Date());
      await client.query(`UPDATE virtual_profiles SET next_auto_post_at=$2,updated_at=NOW() WHERE user_id=$1`,[row.user_id,next]);
      quietRescheduled+=1;continue;
    }

    // Evita ráfagas aunque un deploy o una reprogramación deje varios perfiles vencidos a la vez.
    const deferral=activityDeferralFor(row,recentRows,clockNow,Boolean(force));
    if(deferral){
      const next=alignActivityCandidate(row,eventSeq+1,new Date(Date.now()+Number(deferral.hours||12)*3600000));
      await client.query(`UPDATE virtual_profiles SET next_auto_post_at=$2,updated_at=NOW() WHERE user_id=$1`,[row.user_id,next]);
      await recordActivityLog(client,{userId:row.user_id,activityType:'deferred',text:'',metadata:{engine:'3.0',reason:deferral.reason,hours:Number(deferral.hours||0),forced:false}});
      deferred+=1;continue;
    }

    const recent=await client.query(`SELECT text FROM posts WHERE user_id=$1 AND source='virtual' ORDER BY created_at DESC,id DESC LIMIT 24`,[row.user_id]);
    const recentTexts=recent.rows.map(r=>r.text).filter(Boolean);
    const rhythm=activityRhythmFor(row),theme=activityThemeFor(row,eventSeq,clockNow),daypart=activityDaypartFromClock(clockNow);
    const picked=pickFreshActivityText(p,{seq:eventSeq,clock:clockNow,tone:row.tone,theme,recentTexts,globalHashes});
    const postText=picked.text;repeatCandidatesAvoided+=Number(picked.avoided||0);
    let kind=activityKindFor(row,eventSeq,{recentKinds,clock:clockNow});
    let postId=null,storyId=null,mediaId=null,selected=null,storyText='',storyHash='';

    if(kind==='story-only'){
      const storyPick=pickFreshStoryText(p,{seq:eventSeq,globalHashes});storyText=storyPick.text;storyHash=storyPick.hash||'';repeatCandidatesAvoided+=Number(storyPick.avoided||0);
      selected=await selectVirtualProfileMedia(client,{userId:row.user_id,text:storyText,usageType:'story'});
      if(selected){
        mediaId=Number(selected.media_id);
        const inserted=await client.query(`INSERT INTO stories(user_id,media_id,media_type,text,visibility,created_at,expires_at) VALUES($1,$2,'image',$3,'public',NOW(),NOW()+INTERVAL '24 hours') RETURNING id`,[row.user_id,mediaId,storyText]);
        storyId=Number(inserted.rows[0].id);
        await recordVirtualProfileMediaUsage(client,{poolId:selected.id,userId:row.user_id,storyId,usageType:'story'});
        stories+=1;storyOnly+=1;if(storyPick.hash)globalHashes.add(storyPick.hash);
      } else kind='post-text';
    }

    if(kind!=='story-only'){
      if(kind!=='post-text') selected=await selectVirtualProfileMedia(client,{userId:row.user_id,text:postText,usageType:'post'});
      if(kind!=='post-text' && selected) mediaId=Number(selected.media_id); else if(kind!=='post-text' && !selected) kind='post-text';

      const insertedPost=await client.query(`INSERT INTO posts(user_id,text,media_id,media_type,source,external_url,visibility,created_at) VALUES($1,$2,$3,$4,'virtual','','public',NOW()) RETURNING id`,[row.user_id,postText,mediaId,mediaId?'image':'none']);
      postId=Number(insertedPost.rows[0].id);posts+=1;if(picked.hash)globalHashes.add(picked.hash);
      if(mediaId){photoPosts+=1;await recordVirtualProfileMediaUsage(client,{poolId:selected.id,userId:row.user_id,postId,usageType:'post'});} else textPosts+=1;

      if(kind==='post-photo-story' && mediaId){
        const storyPick=pickFreshStoryText(p,{seq:eventSeq+1,globalHashes});storyText=storyPick.text;storyHash=storyPick.hash||'';repeatCandidatesAvoided+=Number(storyPick.avoided||0);
        const insertedStory=await client.query(`INSERT INTO stories(user_id,media_id,media_type,text,visibility,created_at,expires_at) VALUES($1,$2,'image',$3,'public',NOW(),NOW()+INTERVAL '24 hours') RETURNING id`,[row.user_id,mediaId,storyText]);
        storyId=Number(insertedStory.rows[0].id);await recordVirtualProfileMediaUsage(client,{poolId:selected.id,userId:row.user_id,storyId,usageType:'story'});stories+=1;if(storyPick.hash)globalHashes.add(storyPick.hash);
      }
    }

    themes[theme]=(themes[theme]||0)+1;rhythms[rhythm]=(rhythms[rhythm]||0)+1;dayparts[daypart]=(dayparts[daypart]||0)+1;
    await recordActivityLog(client,{
      userId:row.user_id,activityType:kind,postId,storyId,mediaId,text:postId?postText:storyText,
      metadata:{engine:'3.0',weekend:clockNow.weekend,hour:clockNow.hour,daypart,preferred_daypart:activityPreferredDaypart(row,eventSeq),tone:toneKey(row.tone),rhythm,theme,format:kind,forced:Boolean(force),repeat_candidates_avoided:Number(picked.avoided||0),story_text_hash:storyHash}
    });

    const next=nextActivityDate(row,eventSeq+1,new Date());
    await client.query(`UPDATE virtual_profiles SET last_auto_post_at=NOW(),next_auto_post_at=$2,updated_at=NOW() WHERE user_id=$1`,[row.user_id,next]);
    await client.query(`UPDATE users SET last_seen_at=NOW() WHERE id=$1`,[row.user_id]);
  }
  return {engine_version:'3.0',profiles_processed:due.rows.length,posts,stories,text_posts:textPosts,photo_posts:photoPosts,story_only:storyOnly,quiet_rescheduled:quietRescheduled,deferred,repeat_candidates_avoided:repeatCandidatesAvoided,themes,rhythms,dayparts};
}

async function virtualActivityEngineReport(pool,{days=7,limit=24}={}) {
  const safeDays=Math.max(1,Math.min(30,Number(days)||7)),safeLimit=Math.max(1,Math.min(100,Number(limit)||24));
  const {rows:summaryRows}=await pool.query(`
    WITH v3 AS (
      SELECT * FROM virtual_activity_log
       WHERE created_at>=NOW()-($1::int*INTERVAL '1 day') AND metadata->>'engine'='3.0'
    ), text_hashes AS (
      SELECT text_hash AS hash FROM v3 WHERE COALESCE(text_hash,'')<>''
      UNION ALL
      SELECT metadata->>'story_text_hash' AS hash FROM v3 WHERE COALESCE(metadata->>'story_text_hash','')<>''
    ), hashes AS (
      SELECT hash,COUNT(*)::int AS uses FROM text_hashes GROUP BY hash
    )
    SELECT COUNT(*) FILTER(WHERE activity_type<>'deferred')::int AS events,
           COUNT(DISTINCT user_id) FILTER(WHERE activity_type<>'deferred')::int AS profiles,
           COUNT(*) FILTER(WHERE activity_type='deferred')::int AS deferred,
           COUNT(*) FILTER(WHERE activity_type='post-text')::int AS text_posts,
           COUNT(*) FILTER(WHERE activity_type IN ('post-photo','post-photo-story'))::int AS photo_posts,
           COUNT(*) FILTER(WHERE story_id IS NOT NULL)::int AS stories,
           COALESCE((SELECT COUNT(*) FROM text_hashes),0)::int AS text_items,
           COALESCE((SELECT COUNT(DISTINCT hash) FROM text_hashes),0)::int AS unique_texts,
           COALESCE((SELECT COUNT(*) FROM hashes WHERE uses>1),0)::int AS repeat_groups,
           COALESCE((SELECT SUM(uses-1) FROM hashes WHERE uses>1),0)::int AS repeated_events
      FROM v3
  `,[safeDays]);
  const summary=summaryRows[0]||{};
  const {rows:distribution}=await pool.query(`
    SELECT COALESCE(NULLIF(metadata->>'rhythm',''),'sin-dato') AS rhythm,
           COALESCE(NULLIF(metadata->>'theme',''),'sin-dato') AS theme,
           COALESCE(NULLIF(metadata->>'daypart',''),'sin-dato') AS daypart,
           COUNT(*)::int AS count
      FROM virtual_activity_log
     WHERE created_at>=NOW()-($1::int*INTERVAL '1 day') AND metadata->>'engine'='3.0' AND activity_type<>'deferred'
     GROUP BY 1,2,3 ORDER BY count DESC
  `,[safeDays]);
  const reduceKey=key=>distribution.reduce((m,r)=>(m[r[key]]=(m[r[key]]||0)+Number(r.count||0),m),{});
  const {rows:recent}=await pool.query(`
    SELECT val.id,val.user_id,u.username,u.name,u.avatar,val.activity_type,val.post_id,val.story_id,val.media_id,val.metadata,val.created_at,
           COALESCE(NULLIF(p.text,''),NULLIF(s.text,''),'') AS text
      FROM virtual_activity_log val JOIN users u ON u.id=val.user_id
      LEFT JOIN posts p ON p.id=val.post_id LEFT JOIN stories s ON s.id=val.story_id
     WHERE val.metadata->>'engine'='3.0' ORDER BY val.id DESC LIMIT $1
  `,[safeLimit]);
  const {rows:autoRows}=await pool.query(`SELECT COUNT(*)::int AS total FROM virtual_profiles vp JOIN users u ON u.id=vp.user_id WHERE vp.status='active' AND vp.auto_post_enabled=TRUE AND u.account_status='active' AND COALESCE(u.social_hidden,FALSE)=FALSE`);
  const activeAuto=Number(autoRows[0]?.total||0),textItems=Number(summary.text_items||0),repeated=Number(summary.repeated_events||0);
  return {engine_version:'3.0',days:safeDays,generated_at:new Date().toISOString(),summary:{...summary,active_auto_profiles:activeAuto,originality_percent:textItems?Math.max(0,Math.round((1-(repeated/Math.max(1,textItems)))*100)):100},distribution:{rhythms:reduceKey('rhythm'),themes:reduceKey('theme'),dayparts:reduceKey('daypart')},recent};
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
      COUNT(*) FILTER(WHERE vp.status='active' AND vp.auto_interact_enabled=TRUE)::int AS auto_interact_enabled,
      (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.id=p.user_id WHERE u.is_virtual=TRUE AND p.created_at>=CURRENT_DATE) AS posts_today,
      (SELECT COUNT(*)::int FROM virtual_profile_media vpm WHERE vpm.active=TRUE AND vpm.archived_at IS NULL) AS media_total,
      (SELECT COUNT(*)::int FROM virtual_profile_media_usage WHERE used_at>=CURRENT_DATE) AS media_uses_today,
      (SELECT COUNT(*)::int FROM virtual_message_alerts WHERE replied_at IS NULL) AS inbox_unread,
      (SELECT COUNT(*)::int FROM virtual_activity_log WHERE created_at>=CURRENT_DATE AND activity_type<>'deferred') AS activity_events_today,
      (SELECT COUNT(*)::int FROM virtual_activity_log WHERE created_at>=CURRENT_DATE AND activity_type='post-text') AS text_posts_today,
      (SELECT COUNT(*)::int FROM virtual_activity_log WHERE created_at>=CURRENT_DATE AND activity_type IN ('post-photo','post-photo-story')) AS photo_posts_today,
      (SELECT COUNT(*)::int FROM virtual_activity_log WHERE created_at>=CURRENT_DATE AND (story_id IS NOT NULL)) AS stories_today,
      (SELECT COUNT(DISTINCT user_id)::int FROM virtual_activity_log WHERE created_at>=NOW()-INTERVAL '7 days') AS active_profiles_7d,
      (SELECT COUNT(*)::int FROM virtual_interaction_log WHERE created_at>=CURRENT_DATE) AS interaction_events_today,
      (SELECT COUNT(*)::int FROM virtual_interaction_log WHERE created_at>=CURRENT_DATE AND interaction_type='like') AS virtual_likes_today,
      (SELECT COUNT(*)::int FROM virtual_interaction_log WHERE created_at>=CURRENT_DATE AND interaction_type='comment') AS virtual_comments_today,
      (SELECT COUNT(*)::int FROM virtual_interaction_log WHERE created_at>=CURRENT_DATE AND interaction_type='follow') AS virtual_follows_today,
      (SELECT COUNT(DISTINCT virtual_user_id)::int FROM virtual_interaction_log WHERE created_at>=NOW()-INTERVAL '7 days') AS interacting_profiles_7d
    FROM virtual_profiles vp
  `);
  return rows[0]||{total:0,active:0,paused:0,retired:0,women:0,men:0,posts_today:0,inbox_unread:0,auto_enabled:0,auto_interact_enabled:0,activity_events_today:0,text_posts_today:0,photo_posts_today:0,stories_today:0,active_profiles_7d:0,interaction_events_today:0,virtual_likes_today:0,virtual_comments_today:0,virtual_follows_today:0,interacting_profiles_7d:0};
}

async function listVirtualProfiles(pool,{limit=24,q=''}={}) {
  const lim=Math.min(100,Math.max(1,Number(limit)||24));
  const pattern=`%${String(q||'').trim().slice(0,80)}%`;
  const {rows}=await pool.query(`
    SELECT u.id,u.username,u.name,u.avatar,u.location,u.headline,u.last_seen_at,
           vp.gender,vp.age,vp.status,vp.auto_post_enabled,vp.auto_interact_enabled,vp.reply_enabled,vp.posts_per_week,vp.interactions_per_day,vp.tone,vp.last_auto_post_at,vp.next_auto_post_at,vp.last_auto_interact_at,vp.next_auto_interact_at,
           (SELECT val.activity_type FROM virtual_activity_log val WHERE val.user_id=u.id ORDER BY val.id DESC LIMIT 1) AS last_activity_type,
           (SELECT vil.interaction_type FROM virtual_interaction_log vil WHERE vil.virtual_user_id=u.id ORDER BY vil.id DESC LIMIT 1) AS last_interaction_type,
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

module.exports={VIRTUAL_PROFILE_COUNT,VIRTUAL_WOMEN,VIRTUAL_MEN,personas,createVirtualCommunity,runVirtualActivity,rescheduleVirtualActivity,virtualActivityHistory,virtualActivityEngineReport,runVirtualInteractions,rescheduleVirtualInteractions,virtualInteractionHistory,virtualCommunityStatus,listVirtualProfiles,virtualInbox};
