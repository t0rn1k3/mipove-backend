const crypto = require("crypto");

/** Documented BOG Payments API callback verification key (replace via PAYMENT_BOG_CALLBACK_PUBLIC_KEY if rotated). */
const BOG_CALLBACK_PUBLIC_KEY_BASE64 =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu4RUyAw3+CdkS3ZNILQhzHI9Hemo+vKB9U2BSabppkKjzjjkf+0Sm76hSMiu/HFtYhqWOESryoCDJoqffY0Q1VNt25aTxbj068QNUtnxQ7KQVLA+pG0smf+EBWlS1vBEAFbIas9d8c9b9sSEkTrrTYQ90WIM8bGB6S/KLVoT1a7SnzabjoLc5Qf/SLDG5fu8dH8zckyeYKdRKSBJKvhxtcBuHV4f7qsynQT+f2UYbESX/TLHwT5qFWZDHZ0YUOUIvb8n7JujVSGZO9/+ll/g4ZIWhC1MlJgPObDwRkRd8NFOopgxMcMsDIZIoLbWKhHVq67hdbwpAq9K9WMmEhPnPwIDAQAB";

function pemFromBase64Body(b64) {
  const body = String(b64).replace(/\s/g, "");
  const chunks = body.match(/.{1,64}/g) || [];
  return `-----BEGIN PUBLIC KEY-----\n${chunks.join("\n")}\n-----END PUBLIC KEY-----`;
}

function getBogCallbackPublicKeyPem() {
  const fromEnv = process.env.PAYMENT_BOG_CALLBACK_PUBLIC_KEY;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).replace(/\\n/g, "\n").trim();
  }
  return pemFromBase64Body(BOG_CALLBACK_PUBLIC_KEY_BASE64);
}

/**
 * BOG Payments API: Callback-Signature header (RSA-SHA256 over raw request body).
 * @param {Buffer} rawBody
 * @param {string | undefined} signatureHeader
 */
function verifyBogCallbackSignature(rawBody, signatureHeader) {
  if (!signatureHeader || !Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    return false;
  }
  const pem = getBogCallbackPublicKeyPem();
  let sig;
  try {
    sig = Buffer.from(String(signatureHeader).trim(), "base64");
  } catch {
    return false;
  }
  if (!sig.length) return false;
  try {
    const verify = crypto.createVerify("RSA-SHA256");
    verify.update(rawBody);
    verify.end();
    return verify.verify(pem, sig);
  } catch {
    return false;
  }
}

/**
 * Generic HMAC fallback: hex SHA-256 HMAC of raw body (header X-Payment-Hmac).
 * @param {Buffer} rawBody
 * @param {string} secret
 * @param {string | undefined} hexSignature
 */
function verifyWebhookHmacSha256Hex(rawBody, secret, hexSignature) {
  if (
    !secret ||
    !hexSignature ||
    !Buffer.isBuffer(rawBody) ||
    rawBody.length === 0
  ) {
    return false;
  }
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(hexSignature).trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * If PAYMENT_WEBHOOK_HMAC_SECRET is set, require X-Payment-Hmac (hex). Else BOG Callback-Signature (RSA).
 */
function verifyPaymentWebhookRequest(req, rawBody) {
  const hmacSecret = process.env.PAYMENT_WEBHOOK_HMAC_SECRET;
  if (hmacSecret != null && String(hmacSecret).trim() !== "") {
    const hexSig =
      req.get("X-Payment-Hmac") ||
      req.get("x-payment-hmac") ||
      req.get("X-Webhook-Signature") ||
      req.get("x-webhook-signature");
    return verifyWebhookHmacSha256Hex(rawBody, String(hmacSecret).trim(), hexSig);
  }
  const bogSig =
    req.get("Callback-Signature") ||
    req.get("callback-signature");
  return verifyBogCallbackSignature(rawBody, bogSig);
}

/**
 * BOG Payments v1 callback: { event, zoned_request_time, body: { external_order_id, order_status, ... } }
 * @returns {{ externalOrderId: string, orderStatusKey: string, providerTxnId: string | null } | null}
 */
function parseBogPaymentCallbackPayload(parsedJson) {
  if (!parsedJson || typeof parsedJson !== "object") return null;
  const body = parsedJson.body;
  if (!body || typeof body !== "object") return null;
  const externalOrderId = body.external_order_id;
  if (externalOrderId == null || String(externalOrderId).trim() === "") {
    return null;
  }
  const orderStatusKey =
    body.order_status && typeof body.order_status === "object"
      ? body.order_status.key
      : null;
  if (orderStatusKey == null || typeof orderStatusKey !== "string") {
    return null;
  }
  const providerTxnId =
    body.payment_detail &&
    body.payment_detail.transaction_id != null &&
    String(body.payment_detail.transaction_id).trim() !== ""
      ? String(body.payment_detail.transaction_id).trim()
      : body.order_id != null && String(body.order_id).trim() !== ""
        ? String(body.order_id).trim()
        : null;
  return {
    externalOrderId: String(externalOrderId).trim(),
    orderStatusKey: orderStatusKey.trim().toLowerCase(),
    providerTxnId,
  };
}

module.exports = {
  verifyPaymentWebhookRequest,
  parseBogPaymentCallbackPayload,
  verifyBogCallbackSignature,
  verifyWebhookHmacSha256Hex,
};
