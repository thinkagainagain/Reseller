const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const config = require('../config');

// Driver-agnostic object storage for uploaded intake photos, keyed as
// "<SKU>/<filename>" throughout (matches the DB's file_path column, minus the
// leading /uploads/). Local disk is the dev/fallback path -- Hostinger's
// versioned-deploy-folder problem is why REBOOTY_UPLOADS_DIR exists (see the
// comment this replaced in the old uploadsDir.js), but a Docker container's
// filesystem doesn't survive redeploys at all, so R2 is what production
// actually needs. Both branches present the same key-based interface so
// nothing above this module needs to know which one is active.

const LOCAL_ROOT = config.uploads.dir
  ? path.resolve(config.uploads.dir)
  : path.join(__dirname, '..', '..', 'public', 'uploads');

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

function contentTypeFor(key) {
  return MIME_BY_EXT[path.extname(key).toLowerCase()] || 'application/octet-stream';
}

let s3Client = null;
function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: config.storage.r2.endpoint,
      // R2 (like most non-AWS S3-compatible stores) requires path-style
      // addressing -- virtual-hosted-style (the AWS SDK v3 default) would
      // request <bucket>.<account>.r2.cloudflarestorage.com, which doesn't
      // resolve.
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.storage.r2.accessKeyId,
        secretAccessKey: config.storage.r2.secretAccessKey,
      },
      // Without explicit timeouts, a stalled socket to R2 hangs the AWS SDK
      // request forever (no error, no response) -- confirmed live 2026-08-30,
      // production image loads hung indefinitely instead of failing. These
      // bound the hang so a bad connection surfaces as a fast error instead.
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 5000,
        requestTimeout: 10000,
      }),
    });
  }
  return s3Client;
}

async function putObject(key, buffer) {
  if (config.storage.driver === 'r2') {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: config.storage.r2.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentTypeFor(key),
      })
    );
    return;
  }

  const destPath = path.join(LOCAL_ROOT, key);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buffer);
}

async function readObject(key) {
  if (config.storage.driver === 'r2') {
    const res = await getS3Client().send(
      new GetObjectCommand({ Bucket: config.storage.r2.bucket, Key: key })
    );
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  return fs.readFile(path.join(LOCAL_ROOT, key));
}

// Pipes the object directly into an Express response, ending it. Resolves on
// success; rejects (without having written a response) if the object doesn't
// exist, so the caller can render a 404.
async function streamObject(key, res) {
  if (config.storage.driver === 'r2') {
    const result = await getS3Client().send(
      new GetObjectCommand({ Bucket: config.storage.r2.bucket, Key: key })
    );
    res.setHeader('Content-Type', result.ContentType || contentTypeFor(key));
    await new Promise((resolve, reject) => {
      result.Body.pipe(res);
      result.Body.on('error', reject);
      res.on('finish', resolve);
    });
    return;
  }

  const localPath = path.join(LOCAL_ROOT, key);
  await fs.access(localPath); // throws ENOENT before any response is written
  res.setHeader('Content-Type', contentTypeFor(key));
  await new Promise((resolve, reject) => {
    const stream = fsSync.createReadStream(localPath);
    stream.pipe(res);
    stream.on('error', reject);
    res.on('finish', resolve);
  });
}

async function deleteObject(key) {
  if (config.storage.driver === 'r2') {
    await getS3Client().send(
      new DeleteObjectCommand({ Bucket: config.storage.r2.bucket, Key: key })
    );
    return;
  }

  await fs.unlink(path.join(LOCAL_ROOT, key)).catch(() => {});
}

async function deleteByPrefix(prefix) {
  if (config.storage.driver === 'r2') {
    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const listed = await getS3Client().send(
      new ListObjectsV2Command({ Bucket: config.storage.r2.bucket, Prefix: normalizedPrefix })
    );
    const keys = (listed.Contents || []).map((obj) => ({ Key: obj.Key }));
    if (keys.length === 0) return;
    await getS3Client().send(
      new DeleteObjectsCommand({
        Bucket: config.storage.r2.bucket,
        Delete: { Objects: keys },
      })
    );
    return;
  }

  await fs.rm(path.join(LOCAL_ROOT, prefix), { recursive: true, force: true }).catch(() => {});
}

module.exports = { putObject, readObject, streamObject, deleteObject, deleteByPrefix };
