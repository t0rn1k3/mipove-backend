const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { randomUUID } = require("crypto");

const required = (name) => {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return String(value).trim();
};

const b2Region = process.env.B2_REGION || "us-east-005";
const b2Endpoint = required("B2_ENDPOINT");
const b2KeyId = required("B2_KEY_ID");
const b2AppKey = required("B2_APP_KEY");
const b2Bucket = required("B2_BUCKET_NAME");

const normalizedEndpoint = b2Endpoint.startsWith("http")
  ? b2Endpoint
  : `https://${b2Endpoint}`;

const s3 = new S3Client({
  region: b2Region,
  endpoint: normalizedEndpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: b2KeyId,
    secretAccessKey: b2AppKey,
  },
});

const getPublicBaseUrl = () => {
  if (process.env.B2_PUBLIC_BASE_URL) {
    return String(process.env.B2_PUBLIC_BASE_URL).replace(/\/+$/, "");
  }
  return `${normalizedEndpoint.replace(/\/+$/, "")}/${b2Bucket}`;
};

/**
 * @param {string | null | undefined} folder - subfolder under `uploads/` (e.g. profiles, portfolio, orders). Omit for flat `uploads/<uuid>.ext`.
 */
async function uploadToB2(buffer, originalName, contentType, folder) {
  const ext = String(originalName || "").split(".").pop() || "bin";
  let key;
  if (folder != null && String(folder).trim()) {
    const sub = String(folder)
      .trim()
      .replace(/^\/+|\/+$/g, "")
      .replace(/\.\./g, "");
    key = sub
      ? `uploads/${sub}/${randomUUID()}.${ext}`
      : `uploads/${randomUUID()}.${ext}`;
  } else {
    key = `uploads/${randomUUID()}.${ext}`;
  }

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: b2Bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || "application/octet-stream",
      }),
    );
  } catch (e) {
    const code = e.name || e.Code || "S3Error";
    const detail = e.message || String(e);
    const wrapped = new Error(`B2 upload failed [${code}]: ${detail}`);
    wrapped.statusCode = 502;
    if (process.env.NODE_ENV === "development") {
      wrapped.stack = e.stack;
    }
    throw wrapped;
  }

  return `${getPublicBaseUrl()}/${key}`;
}

/**
 * Map a public object URL back to the S3 key (must be under uploads/portfolio/).
 * @param {string} publicUrl
 * @returns {string | null}
 */
function publicPortfolioUrlToKey(publicUrl) {
  const u = String(publicUrl || "").trim();
  if (!u) return null;
  const base = getPublicBaseUrl().replace(/\/+$/, "");
  let key = null;
  if (u.startsWith(`${base}/`)) {
    key = u.slice(base.length + 1);
  } else {
    try {
      const parsed = new URL(u);
      const path = parsed.pathname.replace(/^\/+/, "");
      if (path.startsWith("uploads/portfolio/")) {
        key = path;
      }
    } catch {
      /* invalid URL */
    }
  }
  if (!key || !/^uploads\/portfolio\/[^/]+$/i.test(key)) {
    return null;
  }
  return key;
}

/**
 * Delete a portfolio object from B2 (idempotent if key already gone).
 * @param {string} publicUrl - Full URL as stored in Master.portfolioImages
 */
async function deleteFromB2ByPublicUrl(publicUrl) {
  const key = publicPortfolioUrlToKey(publicUrl);
  if (!key) {
    const err = new Error("Invalid or unrecognized portfolio image URL");
    err.statusCode = 400;
    throw err;
  }
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: b2Bucket,
        Key: key,
      }),
    );
  } catch (e) {
    const code = e.name || e.Code || "S3Error";
    const detail = e.message || String(e);
    const wrapped = new Error(`B2 delete failed [${code}]: ${detail}`);
    wrapped.statusCode = 502;
    if (process.env.NODE_ENV === "development") {
      wrapped.stack = e.stack;
    }
    throw wrapped;
  }
}

module.exports = { uploadToB2, deleteFromB2ByPublicUrl, publicPortfolioUrlToKey };
