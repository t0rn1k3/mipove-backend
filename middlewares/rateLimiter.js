const rateLimit = require("express-rate-limit");

const ipFallback =
  typeof rateLimit.ipKeyGenerator === "function"
    ? rateLimit.ipKeyGenerator
    : (req) => req.ip;

/**
 * Per-master rate limiter keyed on req.user._id (falls back to IP).
 * Meant to be applied after `protect` middleware so the JWT user is available.
 */
function perMasterLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) =>
      req.user?._id ? String(req.user._id) : ipFallback(req),
    message: { message: message || "Too many requests, please try again later" },
  });
}

const spendLimiter = perMasterLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many spend requests — max 30 per minute",
});

const purchaseLimiter = perMasterLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: "Too many purchase requests — max 5 per minute",
});

module.exports = { spendLimiter, purchaseLimiter };
