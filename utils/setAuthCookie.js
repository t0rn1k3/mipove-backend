const COOKIE_NAME = "auth_token";
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (604800 seconds)

/**
 * Set HttpOnly auth cookie with JWT
 * Uses COOKIE_MAX_AGE_SECONDS (seconds) or JWT_EXPIRE (e.g. 15m, 7d) or 7-day default.
 * @param {import('express').Response} res
 * @param {string} token - JWT string
 */
const setAuthCookie = (res, token) => {
  let maxAgeMs = null;
  if (process.env.COKIE_MAX_AGE_SECONDS) {
    maxAgeMs = parseInt(process.env.COKIE_MAX_AGE_SECONDS, 10) * 1000;
  }
  if (!maxAgeMs || isNaN(maxAgeMs)) {
    maxAgeMs = parseJwtExpiry(process.env.JWT_EXPIRE) || DEFAULT_MAX_AGE_MS;
  }
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeMs,
  });
};

/**
 * Clear the auth cookie (Set-Cookie with Max-Age=0)
 * @param {import('express').Response} res
 */
const clearAuthCookie = (res) => {
  const opts = {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
  };
  res.cookie(COOKIE_NAME, "", opts);
};

/**
 * Parse JWT_EXPIRE env (e.g. "15m", "1h", "30d") to milliseconds
 */
function parseJwtExpiry(expire) {
  if (!expire || typeof expire !== "string") return null;
  const match = expire.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60 * 1000, h: 3600 * 1000, d: 86400 * 1000 };
  return val * (multipliers[unit] || 1000);
}

module.exports = { setAuthCookie, clearAuthCookie, COOKIE_NAME };
