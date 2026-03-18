const jwt = require("jsonwebtoken");

/**
 * @param {string} token
 * @param {{ tokenType?: 'access'|'refresh', secret?: string }} [options]
 */
const verifyToken = (token, options = {}) => {
  try {
    const expectedType = options.tokenType;
    const secret =
      options.secret ||
      (expectedType === "refresh"
        ? process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET || "mipove-secret"
        : process.env.JWT_SECRET || "mipove-secret");

    const decoded = jwt.verify(
      token,
      secret
    );

    // Legacy access tokens may not include tokenType
    if (!decoded.tokenType) decoded.tokenType = "access";

    if (expectedType && decoded.tokenType !== expectedType) {
      return false;
    }

    // Backward compat: old tokens have only id or legacy types
    if (!decoded.type) decoded.type = "user";
    if (decoded.type === "artisan") decoded.type = "master";
    return decoded;
  } catch {
    return false;
  }
};

module.exports = verifyToken;
