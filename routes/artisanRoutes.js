const express = require("express");
const router = express.Router();
const {
  getArtisans,
  getArtisanBySlug,
  createArtisan,
  updateArtisan,
  deleteArtisan,
} = require("../controllers/artisanController");
const {
  setRating,
  getMyRating,
  getArtisanRatings,
} = require("../controllers/ratingController");
const { protect, authorize } = require("../middlewares/auth");

router.route("/").get(getArtisans).post(protect, authorize("master"), createArtisan);

router.get("/:slug/ratings", getArtisanRatings);
router.get("/:slug/rate/me", protect, getMyRating);
router.post("/:slug/rate", protect, authorize("user"), setRating);

router
  .route("/:slug")
  .get(getArtisanBySlug)
  .put(protect, authorize("master"), updateArtisan)
  .delete(protect, authorize("master"), deleteArtisan);

module.exports = router;
