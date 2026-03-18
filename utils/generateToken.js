const jwt = require("jsonwebtoken");

/**
 * @param {string} id - User _id, Master _id, or Admin _id
 * @param {'user'|'master'|'admin'} type - which collection the account is in
 * @param {{ tokenType?: 'access'|'refresh' }} [options]
 */
const generateToken = (id, type, options = {}) => {
  const tokenType = options.tokenType || "access";
  const isRefresh = tokenType === "refresh";
  const secret = isRefresh
    ? process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET || "mipove-secret"
    : process.env.JWT_SECRET || "mipove-secret";
  const expiresIn = isRefresh
    ? process.env.REFRESH_TOKEN_EXPIRE || "7d"
    : process.env.JWT_EXPIRE || "15m";

  return jwt.sign(
    { id, type, tokenType },
    secret,
    { expiresIn }
  );
};

module.exports = generateToken;
