const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middlewares/auth");
const { getBalance } = require("../controllers/creditsController");

router.get("/balance", protect, authorize("master"), getBalance);

module.exports = router;
