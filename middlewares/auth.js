const User = require("../models/User");
const Master = require("../models/Master");
const Admin = require("../models/Admin");
const asyncHandler = require("express-async-handler");
const verifyToken = require("../utils/verifyToken");
const { COOKIE_NAME } = require("../utils/setAuthCookie");

/**
 * Extract token: cookie first, then Authorization Bearer header
 */
const getToken = (req) => {
  const fromCookie = req.cookies?.[COOKIE_NAME];
  if (fromCookie) return fromCookie;
  const authHeader = req.headers?.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.split(" ")[1] || null;
};

/**
 * Protect routes - verify JWT and attach user/master/admin to req
 * Reads token from cookie (auth_token) or Authorization Bearer header
 */
const protect = asyncHandler(async (req, res, next) => {
  const token = getToken(req);

  if (!token) {
    const err = new Error("Access denied. No token provided.");
    err.statusCode = 401;
    throw err;
  }

  const decoded = verifyToken(token, { tokenType: "access" });
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
 * If a valid access token is present, attach req.user like `protect`; otherwise req.user stays null.
 * Does not send 401 — for public routes that optionally personalize when logged in.
 */
const optionalProtect = asyncHandler(async (req, res, next) => {
  req.user = null;
  const token = getToken(req);
  if (!token) {
    return next();
  }

  const decoded = verifyToken(token, { tokenType: "access" });
  if (!decoded) {
    return next();
  }

  if (decoded.type === "master") {
    const master = await Master.findById(decoded.id).select("-password");
    if (!master || master.isBlocked) {
      return next();
    }
    req.user = master.toObject();
    req.user._id = master._id;
    req.user.role = "master";
  } else if (decoded.type === "admin") {
    const admin = await Admin.findById(decoded.id).select("-password");
    if (!admin || admin.isBlocked) {
      return next();
    }
    req.user = admin.toObject();
    req.user._id = admin._id;
    req.user.role = "admin";
  } else {
    const user = await User.findById(decoded.id).select("-password");
    if (!user || user.isBlocked) {
      return next();
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

module.exports = { protect, optionalProtect, authorize };
