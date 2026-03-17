const jwt = require("jsonwebtoken");

/**
 * @param {string} id - User _id or Master _id
 * @param {'user'|'master'} type - 'user' for users collection, 'master' for masters collection
 */
const generateToken = (id, type) => {
  return jwt.sign(
    { id, type },
    process.env.JWT_SECRET || "mipove-secret",
    { expiresIn: process.env.JWT_EXPIRE || "30d" }
  );
};

module.exports = generateToken;
