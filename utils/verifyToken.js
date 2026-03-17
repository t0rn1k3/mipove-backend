const jwt = require("jsonwebtoken");

const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "mipove-secret"
    );
    // Backward compat: old tokens have only id or legacy types
    if (!decoded.type) decoded.type = "user";
    if (decoded.type === "artisan") decoded.type = "master";
    return decoded;
  } catch {
    return false;
  }
};

module.exports = verifyToken;
