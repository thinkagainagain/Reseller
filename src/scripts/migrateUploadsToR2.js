// One-time migration: copies existing intake photos from local disk
// (REBOOTY_UPLOADS_DIR, as they sit on Hostinger today) into R2, preserving
// the exact "<SKU>/<filename>" key structure -- so no file_path values in the
// database need to change. Safe to re-run (each put overwrites in place).
//
// Usage (against a real copy of the Hostinger uploads folder, pulled down
// manually first -- SFTP or hPanel File Manager, no code path for that part
// since it's Hostinger-side):
//   REBOOTY_UPLOADS_DIR=/path/to/pulled/uploads R2_ENDPOINT=... \
//     R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=rebooty-uploads-prod \
//     node src/scripts/migrateUploadsToR2.js            # dry run, lists what would upload
//   ...same env... node src/scripts/migrateUploadsToR2.js --commit   # actually writes

const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const storage = require('../lib/storage');

async function main() {
  const commit = process.argv.includes('--commit');
  const root = config.uploads.dir ? path.resolve(config.uploads.dir) : null;

  if (!root) {
    console.error('REBOOTY_UPLOADS_DIR must be set to the folder of files pulled from Hostinger.');
    process.exit(1);
  }
  if (config.storage.driver !== 'r2') {
    console.error('R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET must all be set (target bucket).');
    process.exit(1);
  }

  const skuDirs = await fs.readdir(root, { withFileTypes: true });
  let fileCount = 0;

  for (const skuDir of skuDirs) {
    if (!skuDir.isDirectory()) continue;
    const sku = skuDir.name;
    const files = await fs.readdir(path.join(root, sku));

    for (const filename of files) {
      const key = `${sku}/${filename}`;
      fileCount += 1;

      if (!commit) {
        console.log(`[dry run] would upload ${key}`);
        continue;
      }

      const buffer = await fs.readFile(path.join(root, sku, filename));
      await storage.putObject(key, buffer);
      console.log(`uploaded ${key}`);
    }
  }

  console.log(`\n${commit ? 'Uploaded' : 'Would upload'} ${fileCount} file(s) to bucket "${config.storage.r2.bucket}".`);
  if (!commit) console.log('Re-run with --commit to actually write.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
