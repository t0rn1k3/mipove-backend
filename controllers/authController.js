const User = require("../models/User");
const Artisan = require("../models/Artisan");
const slugify = require("../utils/slugify");
const asyncHandler = require("express-async-handler");
const generateToken = require("../utils/generateToken");
const { hashPassword, isPasswordMatched } = require("../utils/helpers");

// @desc    Register user (normal client)
// @route   POST /api/auth/register/user
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

  const token = generateToken(user._id);

  res.status(201).json({
    success: true,
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      image: user.image || "",
      password: hashedPassword,
    },
    token,
  });
});

// @desc    Register admin
// @route   POST /api/auth/register/admin
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

  const token = generateToken(user._id);

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

// @desc    Register master (artisan/professional)
// @route   POST /api/auth/register/master
// @access  Public
const registerMaster = asyncHandler(async (req, res) => {
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
    role: "master",
  });

  const slug =
    slugify(name) + "-" + user._id.toString().slice(-6);
  await Artisan.create({
    user: user._id,
    name,
    email: email.toLowerCase().trim(),
    phone: phone || "",
    slug,
  });

  const token = generateToken(user._id);

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

// @desc    Login user or master
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    const err = new Error("Please provide email and password");
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
    "+password",
  );
  if (!user) {
    const err = new Error("Invalid login credentials");
    err.statusCode = 401;
    throw err;
  }

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

  const token = generateToken(user._id);

  res.json({
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

// @desc    Update profile (name, phone, email, password, image)
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, email, password } = req.body;
  const userId = req.user._id;

  const updateData = {};

  if (name) updateData.name = name.trim();
  if (phone !== undefined) updateData.phone = phone.trim();

  if (email) {
    const existing = await User.findOne({
      email: email.toLowerCase().trim(),
      _id: { $ne: userId },
    });
    if (existing) {
      const err = new Error("Email already in use by another account");
      err.statusCode = 409;
      throw err;
    }
    updateData.email = email.toLowerCase().trim();
  }

  if (password) {
    const { hashPassword } = require("../utils/helpers");
    updateData.password = await hashPassword(password);
  }

  if (req.file && req.file.filename) {
    updateData.image = `/uploads/profiles/${req.file.filename}`;
  }

  if (Object.keys(updateData).length === 0) {
    const user = await User.findById(userId).select("-password");
    return res.json({
      success: true,
      data: user,
      message: "No fields to update",
    });
  }

  const user = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  }).select("-password");

  res.json({
    success: true,
    data: user,
    message: "Profile updated successfully",
  });
});

// @desc    Get current logged-in user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  res.json({
    success: true,
    data: user,
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
