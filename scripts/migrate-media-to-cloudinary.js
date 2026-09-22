require('dotenv').config();
const { pool, initDb } = require('../src/db');
const { configured, uploadBuffer } = require('../src/mediaStorage');

const BATCH = Math.max(1, Math.min(25, Number(process.env.MEDIA_MIGRATION_BATCH || 8)));

async function migrateOne(row) {
  const uploaded = await uploadBuffer(row.data, {
    mimeType: row.mime_type,
    originalName: row.original_name,
    userId: row.user_id
  });

  await pool.query(`
    UPDATE media SET
      provider='cloudinary', provider_id=$2, secure_url=$3, resource_type=$4,
      width=$5, height=$6, duration_seconds=$7, format=$8,
      size_bytes=$9, data=NULL, migrated_at=NOW()
    WHERE id=$1
  `, [row.id, uploaded.providerId, uploaded.secureUrl, uploaded.resourceType,
      uploaded.width, uploaded.height, uploaded.durationSeconds, uploaded.format,
      uploaded.sizeBytes || row.size_bytes]);
}

async function main() {
  await initDb();
  if (!configured()) throw new Error('Falta CLOUDINARY_URL. Configúrala en Render antes de migrar.');

  const count = await pool.query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(octet_length(data)),0)::bigint AS bytes FROM media WHERE data IS NOT NULL`);
  let remaining = Number(count.rows[0].total || 0);
  console.log(`Multimedia pendiente: ${remaining} archivos (${count.rows[0].bytes} bytes en PostgreSQL).`);
  if (!remaining) return;

  let migrated = 0;
  while (true) {
    const { rows } = await pool.query(`
      SELECT id,user_id,mime_type,original_name,size_bytes,data
      FROM media
      WHERE data IS NOT NULL
      ORDER BY id
      LIMIT $1
    `, [BATCH]);
    if (!rows.length) break;

    for (const row of rows) {
      try {
        process.stdout.write(`Migrando media #${row.id} (${row.mime_type})... `);
        await migrateOne(row);
        migrated += 1;
        console.log('OK');
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
        console.log('Se conserva el archivo original en PostgreSQL. Corrige el error y vuelve a ejecutar el comando.');
        process.exitCode = 1;
        return;
      }
    }
    remaining -= rows.length;
    console.log(`Progreso: ${migrated} migrados; ~${Math.max(0, remaining)} pendientes.`);
  }

  const final = await pool.query(`SELECT COUNT(*)::int AS legacy FROM media WHERE data IS NOT NULL`);
  console.log(`Migración terminada. Archivos restantes en PostgreSQL: ${final.rows[0].legacy}.`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(async () => { await pool.end(); });
