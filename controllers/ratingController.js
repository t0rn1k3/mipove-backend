const Rating = require("../models/Rating");
const Master = require("../models/Master");
const asyncHandler = require("express-async-handler");

async function aggregateMasterRating(masterId) {
  const stats = await Rating.aggregate([
    { $match: { master: masterId } },
    {
      $group: {
        _id: null,
        average: { $avg: "$stars" },
        count: { $sum: 1 },
      },
    },
  ]);
  if (stats[0]) {
    return {
      average: Math.round(stats[0].average * 10) / 10,
      count: stats[0].count,
    };
  }
  return { average: 0, count: 0 };
}

async function buildRatedMastersForUser(userId) {
  const ratings = await Rating.find({ raterId: userId, raterType: "User" })
    .populate("master", "name slug image specialty location")
    .sort({ updatedAt: -1 })
    .lean();

  return ratings
    .filter((r) => r.master)
    .map((r) => ({
      master: {
        _id: r.master._id,
        name: r.master.name,
        slug: r.master.slug || "",
        image: r.master.image || "",
        specialty: r.master.specialty || "",
        location: r.master.location || "",
      },
      stars: r.stars,
      ratedAt: r.updatedAt || r.createdAt,
    }));
}

// @desc    Set or update star rating for a master
// @route   POST /api/masters/:slug/rate
// @access  Private (user or master)
const setRating = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const rawStars = req.body.stars;
  const raterId = req.user._id;
  const raterType = req.user.role === "master" ? "Master" : "User";

  const stars = Number(rawStars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    const err = new Error("stars must be an integer between 1 and 5");
    err.statusCode = 400;
    throw err;
  }

  const master = await Master.findOne({ slug });
  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  if (
    req.user.role === "master" &&
    master._id.toString() === raterId.toString()
  ) {
    const err = new Error("You cannot rate your own profile");
    err.statusCode = 403;
    throw err;
  }

  await Rating.findOneAndUpdate(
    { raterId, master: master._id },
    { $set: { stars, raterType } },
    { new: true, upsert: true, runValidators: true },
  );

  const { average, count } = await aggregateMasterRating(master._id);

  await Master.updateOne(
    { _id: master._id },
    {
      $set: {
        rating: average,
        reviewCount: count,
      },
    },
  );

  const data = {
    stars,
    rating: average,
    reviewCount: count,
  };

  if (req.user.role === "user") {
    data.ratedMasters = await buildRatedMastersForUser(raterId);
  }

  res.json({
    success: true,
    data,
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
  buildRatedMastersForUser,
};
