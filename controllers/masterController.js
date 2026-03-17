const Master = require("../models/Master");
const Rating = require("../models/Rating");
const asyncHandler = require("express-async-handler");

// @desc    Get all masters (with average rating)
// @route   GET /api/masters
// @access  Public
const getMasters = asyncHandler(async (req, res) => {
  const masters = await Master.find().select("-__v").lean();

  const masterIds = masters.map((m) => m._id);
  const stats = await Rating.aggregate([
    { $match: { master: { $in: masterIds } } },
    {
      $group: {
        _id: "$master",
        average: { $avg: "$stars" },
        count: { $sum: 1 },
      },
    },
  ]);

  const statsMap = {};
  stats.forEach((s) => {
    statsMap[s._id.toString()] = {
      average: Math.round(s.average * 10) / 10,
      count: s.count,
    };
  });

  masters.forEach((m) => {
    m.rating = statsMap[m._id.toString()] || { average: 0, count: 0 };
  });

  res.json({
    success: true,
    count: masters.length,
    data: masters,
  });
});

// @desc    Get master by slug (with average rating)
// @route   GET /api/masters/:slug
// @access  Public
const getMasterBySlug = asyncHandler(async (req, res) => {
  const master = await Master.findOne({ slug: req.params.slug })
    .select("-__v")
    .lean();

  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  const stats = await Rating.aggregate([
    { $match: { master: master._id } },
    {
      $group: {
        _id: null,
        average: { $avg: "$stars" },
        count: { $sum: 1 },
      },
    },
  ]);

  if (stats[0]) {
    master.rating = {
      average: Math.round(stats[0].average * 10) / 10,
      count: stats[0].count,
    };
  } else {
    master.rating = { average: 0, count: 0 };
  }

  res.json({
    success: true,
    data: master,
  });
});

// @desc    Create master (admin only - masters register via /auth/register/master)
// @route   POST /api/masters
// @access  Private (admin)
const createMaster = asyncHandler(async (req, res) => {
  const { name, email, password, ...rest } = req.body;
  if (!name || !email || !password) {
    const err = new Error("Please provide name, email, and password");
    err.statusCode = 400;
    throw err;
  }
  const slugify = require("../utils/slugify");
  const { hashPassword } = require("../utils/helpers");
  const existing = await Master.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    const err = new Error("Master with this email already exists");
    err.statusCode = 409;
    throw err;
  }
  const slug = slugify(name) + "-" + Date.now().toString(36).slice(-6);
  const master = await Master.create({
    name,
    email: email.toLowerCase().trim(),
    password: await hashPassword(password),
    slug,
    ...rest,
  });
  const data = master.toObject();
  delete data.password;
  res.status(201).json({
    success: true,
    data,
  });
});

// @desc    Update master
// @route   PUT /api/masters/:slug
// @access  Private (master, own profile only)
const updateMaster = asyncHandler(async (req, res) => {
  const master = await Master.findOneAndUpdate(
    { slug: req.params.slug, _id: req.user._id },
    req.body,
    { new: true, runValidators: true }
  ).select("-__v");

  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  res.json({
    success: true,
    data: master,
  });
});

// @desc    Delete master
// @route   DELETE /api/masters/:slug
// @access  Private (master, own profile only)
const deleteMaster = asyncHandler(async (req, res) => {
  const master = await Master.findOneAndDelete({
    slug: req.params.slug,
    _id: req.user._id,
  });

  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  res.json({
    success: true,
    data: {},
  });
});

module.exports = {
  getMasters,
  getMasterBySlug,
  createMaster,
  updateMaster,
  deleteMaster,
};
