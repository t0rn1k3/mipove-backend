const COOKIE_NAME = "auth_token";
const MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes (or use JWT_EXPIRE for consistency)

/**
 * Set HttpOnly auth cookie with JWT
 * @param {import('express').Response} res
 * @param {string} token - JWT string
 */
const setAuthCookie = (res, token) => {
  const maxAge = parseJwtExpiry(process.env.JWT_EXPIRE) || MAX_AGE_MS;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
};

/**
 * Clear the auth cookie
 * @param {import('express').Response} res
 */
const clearAuthCookie = (res) => {
  res.clearCookie(COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
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
