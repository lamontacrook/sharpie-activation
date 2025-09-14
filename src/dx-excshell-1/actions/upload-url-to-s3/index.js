// Adobe App Builder (Adobe I/O Runtime) action: upload-url-to-s3
// Node 18+, CommonJS
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { Readable } = require("node:stream");
const path = require("node:path");
const { URL } = require("node:url");
const { Core } = require('@adobe/aio-sdk');

function inferKeyFromUrl(u) {
  try {
    const parsed = new URL(u);
    const name = path.basename(parsed.pathname) || "download";
    return name.replace(/\s+/g, "_");
  } catch {
    return "download";
  }
}

function guessContentType(key) {
  const ext = path.extname(key).toLowerCase();
  return ({
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
  })[ext] || null;
}

function publicUrlOf(bucket, key, region) {
  if (region && region !== "us-east-1") {
    return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(key)}`;
  }
  return `https://${bucket}.s3.amazonaws.com/${encodeURIComponent(key)}`;
}

async function uploadStreamToS3({ bodyStream, bucket, key, region, contentType, makePublic, sse, cacheSeconds, credentials }) {
  const s3 = new S3Client({
    region,
    credentials,
  });

  const params = {
    Bucket: bucket,
    Key: key,
    Body: bodyStream,
    ContentType: contentType,
  };
  if (makePublic) params.ACL = "public-read";
  if (sse) params.ServerSideEncryption = "AES256";
  if (cacheSeconds && cacheSeconds > 0) params.CacheControl = `public, max-age=${cacheSeconds}`;

  const uploader = new Upload({
    client: s3,
    params,
    queueSize: 4,
    partSize: 10 * 1024 * 1024,
    leavePartsOnError: false,
  });

  await uploader.done();
}

async function fetchAsNodeReadable(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(url, { redirect: "follow", signal: controller.signal });
  clearTimeout(t);
  if (!res.ok || !res.body) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  // Convert WHATWG ReadableStream → Node Readable
  return { stream: Readable.fromWeb(res.body), contentType: res.headers.get("content-type") || undefined };
}

async function main(params) {
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  logger.info('Uploading URL to S3 ', params);

  try {
    const {
      url,
      bucket,
      key,
      region,
      public: makePublic = false,
      contentType,
      cacheSeconds = 0,
      sse = false,
      timeoutMs = 30000,
    } = params || {};

    if (!url || !bucket) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing required params: url, bucket" }),
      };
    }

    const objectKey = key || inferKeyFromUrl(url);

    const { stream, contentType: fetchedCT } = await fetchAsNodeReadable(url, timeoutMs);
    const ct = contentType || fetchedCT || guessContentType(objectKey) || "application/octet-stream";

    const credentials = {
      accessKeyId: params.AWS_ACCESS_KEY_ID,
      secretAccessKey: params.AWS_SECRET_ACCESS_KEY,
    };
    
    await uploadStreamToS3({
      bodyStream: stream,
      bucket,
      key: objectKey,
      region,
      contentType: ct,
      makePublic,
      sse,
      cacheSeconds,
      credentials,
    });

    const payload = {
      ok: true,
      bucket,
      key: objectKey,
      contentType: ct,
      s3Uri: `s3://${bucket}/${objectKey}`,
      publicUrl: makePublic ? publicUrlOf(bucket, objectKey, region) : null,
    };

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: String(err?.message || err) }),
    };
  }
}

exports.main = main;
