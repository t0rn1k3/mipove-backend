const User = require("../models/User");
const Master = require("../models/Master");
const slugify = require("../utils/slugify");
const asyncHandler = require("express-async-handler");
const generateToken = require("../utils/generateToken");
const { hashPassword, isPasswordMatched } = require("../utils/helpers");

// @desc    Register user (normal client)
// @route   POST /api/auth/users/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !password) {
    const err = new Error("Please provide name, email, and password");
    err.statusCode = 400;
    throw err;
  }

  const existingUser = await User.findOne({
    email: email.toLowerCase().trim(),
  });
  if (existingUser) {
    const err = new Error("User already exists with this email");
    err.statusCode = 409;
    throw err;
  }

  const hashedPassword = await hashPassword(password);
  const user = await User.create({
    name,
    email: email.toLowerCase().trim(),
    phone: phone || "",
    password: hashedPassword,
    role: "user",
  });

  const token = generateToken(user._id, "user");

  res.status(201).json({
    success: true,
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      image: user.image || "",
    },
    token,
  });
});

// @desc    Register admin
// @route   POST /api/auth/admin/register
// @access  Public (requires ADMIN_SECRET in body if set in env)
const registerAdmin = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { name, email, phone, password, adminSecret } = body;

  if (process.env.ADMIN_SECRET && adminSecret !== process.env.ADMIN_SECRET) {
    const err = new Error("Invalid admin secret");
    err.statusCode = 403;
    throw err;
  }

  if (!name || !email || !password) {
    const err = new Error("Please provide name, email, and password");
    err.statusCode = 400;
    throw err;
  }

  const existingUser = await User.findOne({
    email: email.toLowerCase().trim(),
  });
  if (existingUser) {
    const err = new Error("User already exists with this email");
    err.statusCode = 409;
    throw err;
  }

  const hashedPassword = await hashPassword(password);
  const user = await User.create({
    name,
    email: email.toLowerCase().trim(),
    phone: phone || "",
    password: hashedPassword,
    role: "admin",
  });

  const token = generateToken(user._id, "user");

  res.status(201).json({
    success: true,
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      image: user.image || "",
    },
    token,
  });
});

// @desc    Register master (professional) - creates in masters collection
// @route   POST /api/auth/masters/register
// @access  Public
const registerMaster = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;
  const emailNorm = email.toLowerCase().trim();

  if (!name || !email || !password) {
    const err = new Error("Please provide name, email, and password");
    err.statusCode = 400;
    throw err;
  }

  const [existingUser, existingMaster] = await Promise.all([
    User.findOne({ email: emailNorm }),
    Master.findOne({ email: emailNorm }),
  ]);
  if (existingUser || existingMaster) {
    const err = new Error("Account already exists with this email");
    err.statusCode = 409;
    throw err;
  }

  const hashedPassword = await hashPassword(password);
  const slug = slugify(name) + "-" + Date.now().toString(36).slice(-6);
  const master = await Master.create({
    name,
    email: emailNorm,
    phone: phone || "",
    password: hashedPassword,
    slug,
  });

  const token = generateToken(master._id, "master");

  res.status(201).json({
    success: true,
    data: {
      _id: master._id,
      name: master.name,
      email: master.email,
      phone: master.phone || "",
      role: "master",
      image: master.image || "",
      slug: master.slug,
    },
    token,
  });
});

// @desc    Login - checks users (clients, admins) and masters
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const emailNorm = email.toLowerCase().trim();

  if (!email || !password) {
    const err = new Error("Please provide email and password");
    err.statusCode = 400;
    throw err;
  }

  let user = await User.findOne({ email: emailNorm }).select("+password");
  if (user) {
    if (user.isBlocked) {
      const err = new Error("Account is blocked. Contact support.");
      err.statusCode = 403;
      throw err;
    }
    const isMatch = await isPasswordMatched(password, user.password);
    if (!isMatch) {
      const err = new Error("Invalid login credentials");
      err.statusCode = 401;
      throw err;
    }
    const token = generateToken(user._id, "user");
    return res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        role: user.role,
        image: user.image || "",
      },
      token,
    });
  }

  const master = await Master.findOne({ email: emailNorm }).select(
    "+password",
  );
  if (!master) {
    const err = new Error("Invalid login credentials");
    err.statusCode = 401;
    throw err;
  }
  if (master.isBlocked) {
    const err = new Error("Account is blocked. Contact support.");
    err.statusCode = 403;
    throw err;
  }
  const isMatch = await isPasswordMatched(password, master.password);
  if (!isMatch) {
    const err = new Error("Invalid login credentials");
    err.statusCode = 401;
    throw err;
  }
  const token = generateToken(master._id, "master");
  return res.json({
    success: true,
    data: {
      _id: master._id,
      name: master.name,
      email: master.email,
      phone: master.phone || "",
      role: "master",
      image: master.image || "",
      slug: master.slug,
    },
    token,
  });
});

// @desc    Update profile (name, phone, email, password, image)
// @route   PUT /api/auth/profile
// @access  Private (works for both users and masters)
const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, email, password } = req.body;
  const accountId = req.user._id;
  const isMaster = req.user.role === "master";

  const updateData = {};
  if (name) updateData.name = name.trim();
  if (phone !== undefined) updateData.phone = phone.trim();

  if (email) {
    const emailNorm = email.toLowerCase().trim();
    if (isMaster) {
      const existing = await Master.findOne({
        email: emailNorm,
        _id: { $ne: accountId },
      });
      if (existing) {
        const err = new Error("Email already in use by another account");
        err.statusCode = 409;
        throw err;
      }
    } else {
      const existing = await User.findOne({
        email: emailNorm,
        _id: { $ne: accountId },
      });
      if (existing) {
        const err = new Error("Email already in use by another account");
        err.statusCode = 409;
        throw err;
      }
    }
    updateData.email = emailNorm;
  }

  if (password) {
    const { hashPassword } = require("../utils/helpers");
    updateData.password = await hashPassword(password);
  }

  if (req.file && req.file.filename) {
    updateData.image = `/uploads/profiles/${req.file.filename}`;
  }

  if (Object.keys(updateData).length === 0) {
    const doc = isMaster
      ? await Master.findById(accountId).select("-password")
      : await User.findById(accountId).select("-password");
    const data = doc.toObject ? doc.toObject() : doc;
    if (isMaster) data.role = "master";
    return res.json({
      success: true,
      data,
      message: "No fields to update",
    });
  }

  const doc = isMaster
    ? await Master.findByIdAndUpdate(accountId, updateData, {
        new: true,
        runValidators: true,
      }).select("-password")
    : await User.findByIdAndUpdate(accountId, updateData, {
        new: true,
        runValidators: true,
      }).select("-password");

  const data = doc.toObject ? doc.toObject() : doc;
  if (isMaster) data.role = "master";

  res.json({
    success: true,
    data,
    message: "Profile updated successfully",
  });
});

// @desc    Get current logged-in user or master
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const isMaster = req.user.role === "master";
  const doc = isMaster
    ? await Master.findById(req.user._id).select("-password")
    : await User.findById(req.user._id).select("-password");
  const data = doc.toObject ? doc.toObject() : doc;
  if (isMaster) data.role = "master";
  res.json({
    success: true,
    data,
  });
});

module.exports = {
  registerUser,
  registerAdmin,
  registerMaster,
  login,
  getMe,
  updateProfile,
};
