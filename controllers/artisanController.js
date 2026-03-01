const Artisan = require("../models/Artisan");
const asyncHandler = require("express-async-handler");

// @desc    Get all artisans
// @route   GET /api/artisans
// @access  Public
const getArtisans = asyncHandler(async (req, res) => {
  const artisans = await Artisan.find().select("-__v").lean();
  res.json({
    success: true,
    count: artisans.length,
    data: artisans,
  });
});

// @desc    Get artisan by slug
// @route   GET /api/artisans/:slug
// @access  Public
const getArtisanBySlug = asyncHandler(async (req, res) => {
  const artisan = await Artisan.findOne({ slug: req.params.slug }).select("-__v").lean();

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
