const jwt = require("jsonwebtoken");

/**
 * @param {string} id - User _id, Master _id, or Admin _id
 * @param {'user'|'master'|'admin'} type - which collection the account is in
 */
const generateToken = (id, type) => {
  return jwt.sign(
    { id, type },
    process.env.JWT_SECRET || "mipove-secret",
    { expiresIn: process.env.JWT_EXPIRE || "30d" }
  );
};

module.exports = generateToken;
