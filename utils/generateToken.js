const jwt = require("jsonwebtoken");

const generateToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET || "mipove-secret",
    { expiresIn: process.env.JWT_EXPIRE || "30d" }
  );
};

module.exports = generateToken;
