const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middlewares/auth");
const {
  getBalance,
  getHistory,
  spendCredits,
} = require("../controllers/creditsController");

router.get("/balance", protect, authorize("master"), getBalance);
router.get("/history", protect, authorize("master"), getHistory);
router.post("/spend", protect, authorize("master"), spendCredits);

module.exports = router;
