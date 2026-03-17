const Rating = require("../models/Rating");
const Master = require("../models/Master");
const asyncHandler = require("express-async-handler");

// @desc    Set or update star rating for a master
// @route   POST /api/masters/:slug/rate
// @access  Private (user or master)
const setRating = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { stars } = req.body;
  const raterId = req.user._id;
  const raterType = req.user.role === "master" ? "Master" : "User";

  if (!stars || stars < 1 || stars > 5) {
    const err = new Error("Stars must be between 1 and 5");
    err.statusCode = 400;
    throw err;
  }

  const master = await Master.findOne({ slug });
  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  // Masters cannot rate their own profile
  if (
    req.user.role === "master" &&
    master._id.toString() === raterId.toString()
  ) {
    const err = new Error("You cannot rate your own profile");
    err.statusCode = 403;
    throw err;
  }

  const rating = await Rating.findOneAndUpdate(
    { raterId, raterType, master: master._id },
    { stars },
    { new: true, upsert: true }
  ).populate("master", "name slug");

  res.json({
    success: true,
    data: rating,
    message: "Rating saved successfully",
  });
});

// @desc    Get current user's rating for a master
// @route   GET /api/masters/:slug/rate/me
// @access  Private
const getMyRating = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const raterId = req.user._id;
  const raterType = req.user.role === "master" ? "Master" : "User";

  const master = await Master.findOne({ slug });
  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  const rating = await Rating.findOne({
    raterId,
    raterType,
    master: master._id,
  });

  res.json({
    success: true,
    data: rating ? { stars: rating.stars } : null,
  });
});

// @desc    Get average rating and count for a master
// @route   GET /api/masters/:slug/ratings
// @access  Public
const getMasterRatings = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const master = await Master.findOne({ slug });
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
  getMasterRatings,
};
