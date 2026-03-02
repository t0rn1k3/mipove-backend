const Rating = require("../models/Rating");
const Artisan = require("../models/Artisan");
const asyncHandler = require("express-async-handler");

// @desc    Set or update star rating for a master (artisan)
// @route   POST /api/artisans/:slug/rate
// @access  Private (user only)
const setRating = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { stars } = req.body;
  const userId = req.user._id;

  if (!stars || stars < 1 || stars > 5) {
    const err = new Error("Stars must be between 1 and 5");
    err.statusCode = 400;
    throw err;
  }

  const artisan = await Artisan.findOne({ slug });
  if (!artisan) {
    const err = new Error("Artisan not found");
    err.statusCode = 404;
    throw err;
  }

  const rating = await Rating.findOneAndUpdate(
    { user: userId, artisan: artisan._id },
    { stars },
    { new: true, upsert: true }
  ).populate("artisan", "name slug");

  res.json({
    success: true,
    data: rating,
    message: "Rating saved successfully",
  });
});

// @desc    Get current user's rating for an artisan
// @route   GET /api/artisans/:slug/rate/me
// @access  Private
const getMyRating = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const userId = req.user._id;

  const artisan = await Artisan.findOne({ slug });
  if (!artisan) {
    const err = new Error("Artisan not found");
    err.statusCode = 404;
    throw err;
  }

  const rating = await Rating.findOne({
    user: userId,
    artisan: artisan._id,
  });

  res.json({
    success: true,
    data: rating ? { stars: rating.stars } : null,
  });
});

// @desc    Get average rating and count for an artisan
// @route   GET /api/artisans/:slug/ratings
// @access  Public
const getArtisanRatings = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const artisan = await Artisan.findOne({ slug });
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

  const result = stats[0]
    ? {
        average: Math.round(stats[0].average * 10) / 10,
        count: stats[0].count,
      }
    : { average: 0, count: 0 };

  res.json({
    success: true,
    data: result,
  });
});

module.exports = {
  setRating,
  getMyRating,
  getArtisanRatings,
};
