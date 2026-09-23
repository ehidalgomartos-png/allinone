require('dotenv').config();
const { pool, initDb } = require('../src/db');
const { configured, hardenAsset } = require('../src/mediaStorage');

async function main() {
  if (!configured()) throw new Error('CLOUDINARY_URL no está configurado.');
  await initDb();
  const { rows } = await pool.query(`
    SELECT id,provider,provider_id,resource_type,delivery_type
    FROM media
    WHERE provider='cloudinary'
      AND provider_id<>''
      AND COALESCE(delivery_type,'upload') <> 'authenticated'
    ORDER BY id ASC
  `);
  if (!rows.length) {
    console.log('No hay multimedia heredada pendiente de reforzar.');
    return;
  }
  console.log(`Reforzando ${rows.length} recurso(s) multimedia...`);
  let ok = 0;
  let failed = 0;
  for (const item of rows) {
    try {
      const result = await hardenAsset(item);
      if (!result) continue;
      await pool.query(`
        UPDATE media
        SET provider_id=$2,
            secure_url=COALESCE(NULLIF($3,''),secure_url),
            resource_type=COALESCE(NULLIF($4,''),resource_type),
            delivery_type=$5,
            format=COALESCE(NULLIF($6,''),format),
            migrated_at=NOW()
        WHERE id=$1
      `, [item.id, result.providerId || item.provider_id, result.secureUrl || '', result.resourceType || item.resource_type, result.deliveryType || 'authenticated', result.format || '']);
      ok += 1;
      console.log(`OK media #${item.id}`);
    } catch (err) {
      failed += 1;
      console.error(`ERROR media #${item.id}: ${err.message}`);
    }
  }
  console.log(`Terminado: ${ok} reforzado(s), ${failed} error(es).`);
  if (failed) process.exitCode = 2;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end().catch(() => {});
});
