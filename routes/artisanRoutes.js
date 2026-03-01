const express = require("express");
const router = express.Router();
const {
  getArtisans,
  getArtisanBySlug,
  createArtisan,
  updateArtisan,
  deleteArtisan,
} = require("../controllers/artisanController");

router.route("/").get(getArtisans).post(createArtisan);
router.route("/:slug").get(getArtisanBySlug).put(updateArtisan).delete(deleteArtisan);

module.exports = router;
