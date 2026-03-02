const Artisan = require("../models/Artisan");
const Rating = require("../models/Rating");
const asyncHandler = require("express-async-handler");

// @desc    Get all artisans (with average rating)
// @route   GET /api/artisans
// @access  Public
const getArtisans = asyncHandler(async (req, res) => {
  const artisans = await Artisan.find().select("-__v").lean();

  const artisanIds = artisans.map((a) => a._id);
  const stats = await Rating.aggregate([
    { $match: { artisan: { $in: artisanIds } } },
    {
      $group: {
        _id: "$artisan",
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

  artisans.forEach((a) => {
    a.rating = statsMap[a._id.toString()] || { average: 0, count: 0 };
  });

  res.json({
    success: true,
    count: artisans.length,
    data: artisans,
  });
});

// @desc    Get artisan by slug (with average rating)
// @route   GET /api/artisans/:slug
// @access  Public
const getArtisanBySlug = asyncHandler(async (req, res) => {
  const artisan = await Artisan.findOne({ slug: req.params.slug }).select("-__v").lean();

  if (!artisan) {
    const err = new Error("Artisan not found");
    err.statusCode = 404;
    throw err;
  }

  const stats = await Rating.aggregate([
    { $match: { artisan: artisan._id } },
    {
      $group: {
        _id: null,
        average: { $avg: "$stars" },
        count: { $sum: 1 },
      },
    },
  ]);

  if (stats[0]) {
    artisan.rating = {
      average: Math.round(stats[0].average * 10) / 10,
      count: stats[0].count,
    };
  } else {
    artisan.rating = { average: 0, count: 0 };
  }

  res.json({
    success: true,
    data: artisan,
  });
});

// @desc    Create artisan
// @route   POST /api/artisans
// @access  Public (protect later with auth)
const createArtisan = asyncHandler(async (req, res) => {
  const artisan = await Artisan.create(req.body);
  res.status(201).json({
    success: true,
    data: artisan,
  });
});

// @desc    Update artisan
// @route   PUT /api/artisans/:slug
// @access  Public (protect later with auth)
const updateArtisan = asyncHandler(async (req, res) => {
  const artisan = await Artisan.findOneAndUpdate(
    { slug: req.params.slug },
    req.body,
    { new: true, runValidators: true }
  ).select("-__v");

  if (!artisan) {
    const err = new Error("Artisan not found");
    err.statusCode = 404;
    throw err;
  }

  res.json({
    success: true,
    data: artisan,
  });
});

// @desc    Delete artisan
// @route   DELETE /api/artisans/:slug
// @access  Public (protect later with auth)
const deleteArtisan = asyncHandler(async (req, res) => {
  const artisan = await Artisan.findOneAndDelete({ slug: req.params.slug });

  if (!artisan) {
    const err = new Error("Artisan not found");
    err.statusCode = 404;
    throw err;
  }

  res.json({
    success: true,
    data: {},
  });
});

module.exports = {
  getArtisans,
  getArtisanBySlug,
  createArtisan,
  updateArtisan,
  deleteArtisan,
};
