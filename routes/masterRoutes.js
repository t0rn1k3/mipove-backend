const express = require("express");
const router = express.Router();
const {
  getProfessions,
  getMasters,
  getMasterBySlug,
  createMaster,
  updateMaster,
  deleteMaster,
  getMyPortfolio,
  addPortfolioImages,
  removePortfolioImages,
  getMyFavoriteOrders,
  addFavoriteOrder,
  removeFavoriteOrder,
} = require("../controllers/masterController");
const {
  setRating,
  getMyRating,
  getMasterRatings,
} = require("../controllers/ratingController");
const { protect, authorize } = require("../middlewares/auth");
const { portfolioImagesUpload } = require("../config/memoryMulter");

const handlePortfolioUpload = (req, res, next) => {
  portfolioImagesUpload.array("images", 30)(req, res, (err) => {
    if (err) {
      err.statusCode = 400;
      return next(err);
    }
    next();
  });
};

router.route("/").get(getMasters).post(protect, authorize("admin"), createMaster);

router.get("/professions", getProfessions);

router
  .route("/me/portfolio")
  .get(protect, authorize("master"), getMyPortfolio)
  // allow either POST or PATCH for appends
  .post(protect, authorize("master"), handlePortfolioUpload, addPortfolioImages)
  .patch(protect, authorize("master"), handlePortfolioUpload, addPortfolioImages)
  .delete(protect, authorize("master"), removePortfolioImages);

router
  .route("/me/favorite-orders")
  .get(protect, authorize("master"), getMyFavoriteOrders)
  .post(protect, authorize("master"), addFavoriteOrder)
  .delete(protect, authorize("master"), removeFavoriteOrder);

router.delete(
  "/me/favorite-orders/:orderId",
  protect,
  authorize("master"),
  removeFavoriteOrder,
);

router.get("/:slug/ratings", getMasterRatings);
router.get("/:slug/rate/me", protect, getMyRating);
router.post("/:slug/rate", protect, authorize("user", "master"), setRating);

router
  .route("/:slug")
  .get(getMasterBySlug)
  .put(protect, authorize("master"), updateMaster)
  .delete(protect, authorize("master"), deleteMaster);

module.exports = router;
