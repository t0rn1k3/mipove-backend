const COOKIE_NAME = "auth_token";
const REFRESH_COOKIE_NAME = "refresh_token";
const DEFAULT_AUTH_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Set HttpOnly auth cookie with JWT
 * Uses AUTH_COOKIE_MAX_AGE_SECONDS / COOKIE_MAX_AGE_SECONDS or JWT_EXPIRE.
 * @param {import('express').Response} res
 * @param {string} token - JWT string
 */
const setAuthCookie = (res, token) => {
  const maxAgeMs = resolveMaxAgeMs(
    ["AUTH_COOKIE_MAX_AGE_SECONDS", "COOKIE_MAX_AGE_SECONDS"],
    process.env.JWT_EXPIRE,
    DEFAULT_AUTH_MAX_AGE_MS,
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeMs,
  });
};

/**
 * Set HttpOnly refresh cookie with JWT
 * Uses REFRESH_COOKIE_MAX_AGE_SECONDS or REFRESH_TOKEN_EXPIRE.
 * @param {import('express').Response} res
 * @param {string} token - JWT string
 */
const setRefreshCookie = (res, token) => {
  const maxAgeMs = resolveMaxAgeMs(
    ["REFRESH_COOKIE_MAX_AGE_SECONDS"],
    process.env.REFRESH_TOKEN_EXPIRE || "7d",
    DEFAULT_REFRESH_MAX_AGE_MS,
  );
  res.cookie(REFRESH_COOKIE_NAME, token, {
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
  res.cookie(COOKIE_NAME, "", cookieClearOptions());
};

/**
 * Clear the refresh cookie (Set-Cookie with Max-Age=0)
 * @param {import('express').Response} res
 */
const clearRefreshCookie = (res) => {
  res.cookie(REFRESH_COOKIE_NAME, "", cookieClearOptions());
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

function resolveMaxAgeMs(secondEnvNames, expiryString, defaultMaxAge) {
  for (const envName of secondEnvNames) {
    const value = parseInt(process.env[envName], 10);
    if (!Number.isNaN(value) && value > 0) return value * 1000;
  }
  return parseJwtExpiry(expiryString) || defaultMaxAge;
}

function cookieClearOptions() {
  return {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
  };
}

module.exports = {
  setAuthCookie,
  setRefreshCookie,
  clearAuthCookie,
  clearRefreshCookie,
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
};
