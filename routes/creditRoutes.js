const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middlewares/auth");
const {
  getBalance,
  getHistory,
  getUnlocks,
  spendCredits,
} = require("../controllers/creditsController");

router.get("/balance", protect, authorize("master"), getBalance);
router.get("/history", protect, authorize("master"), getHistory);
router.get("/unlocks", protect, authorize("master"), getUnlocks);
router.post("/spend", protect, authorize("master"), spendCredits);

module.exports = router;
