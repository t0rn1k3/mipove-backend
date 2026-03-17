const express = require("express");
const router = express.Router();
const {
  getMasters,
  getMasterBySlug,
  createMaster,
  updateMaster,
  deleteMaster,
} = require("../controllers/masterController");
const {
  setRating,
  getMyRating,
  getMasterRatings,
} = require("../controllers/ratingController");
const { protect, authorize } = require("../middlewares/auth");

router.route("/").get(getMasters).post(protect, authorize("admin"), createMaster);

router.get("/:slug/ratings", getMasterRatings);
router.get("/:slug/rate/me", protect, getMyRating);
router.post("/:slug/rate", protect, authorize("user", "master"), setRating);

router
  .route("/:slug")
  .get(getMasterBySlug)
  .put(protect, authorize("master"), updateMaster)
  .delete(protect, authorize("master"), deleteMaster);

module.exports = router;
