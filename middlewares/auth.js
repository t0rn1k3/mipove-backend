const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const verifyToken = require("../utils/verifyToken");

/**
 * Protect routes - verify JWT and attach user to req (like school-system isLogin)
 */
const protect = asyncHandler(async (req, res, next) => {
  const token = req.headers?.authorization?.split(" ")[1];

  if (!token) {
    const err = new Error("Access denied. No token provided.");
    err.statusCode = 401;
    throw err;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    const err = new Error("Access denied. Invalid token.");
    err.statusCode = 401;
    throw err;
  }

  const user = await User.findById(decoded.id).select("-password");
  if (!user) {
    const err = new Error("Access denied. User not found.");
    err.statusCode = 401;
    throw err;
  }

  req.user = user;
  next();
});

/**
 * Restrict to specific roles
 * @param  {...string} roles - Allowed roles (e.g. 'user', 'master')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      const err = new Error("Not authorized");
      err.statusCode = 401;
      return next(err);
    }
    if (!roles.includes(req.user.role)) {
      const err = new Error(
        `Role '${req.user.role}' is not authorized to access this route`
      );
      err.statusCode = 403;
      return next(err);
    }
    next();
  };
};

module.exports = { protect, authorize };
