const jwt = require("jsonwebtoken");

const verifyToken = (token) => {
  try {
    return jwt.verify(
      token,
      process.env.JWT_SECRET || "mipove-secret"
    );
  } catch {
    return false;
  }
};

module.exports = verifyToken;
