const User = require("../models/User");
const Master = require("../models/Master");
const Admin = require("../models/Admin");
const asyncHandler = require("express-async-handler");
const verifyToken = require("../utils/verifyToken");

/**
 * Protect routes - verify JWT and attach user/master/admin to req
 * Users from users collection; masters from masters collection; admins from admins collection
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

  if (decoded.type === "master") {
    const master = await Master.findById(decoded.id).select("-password");
    if (!master) {
      const err = new Error("Access denied. Master not found.");
      err.statusCode = 401;
      throw err;
    }
    if (master.isBlocked) {
      const err = new Error("Account is blocked. Contact support.");
      err.statusCode = 403;
      throw err;
    }
    req.user = master.toObject();
    req.user._id = master._id;
    req.user.role = "master";
  } else if (decoded.type === "admin") {
    const admin = await Admin.findById(decoded.id).select("-password");
    if (!admin) {
      const err = new Error("Access denied. Admin not found.");
      err.statusCode = 401;
      throw err;
    }
    if (admin.isBlocked) {
      const err = new Error("Account is blocked. Contact support.");
      err.statusCode = 403;
      throw err;
    }
    req.user = admin.toObject();
    req.user._id = admin._id;
    req.user.role = "admin";
  } else {
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      const err = new Error("Access denied. User not found.");
      err.statusCode = 401;
      throw err;
    }
    if (user.isBlocked) {
      const err = new Error("Account is blocked. Contact support.");
      err.statusCode = 403;
      throw err;
    }
    req.user = user.toObject ? user.toObject() : user;
    req.user._id = user._id;
    req.user.role = user.role;
  }

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
