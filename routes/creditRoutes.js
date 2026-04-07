const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middlewares/auth");
const {
  getPacks,
  getBalance,
  getHistory,
  getUnlocks,
  createPurchase,
  spendCredits,
} = require("../controllers/creditsController");

router.get("/packs", getPacks);
router.get("/balance", protect, authorize("master"), getBalance);
router.get("/history", protect, authorize("master"), getHistory);
router.get("/unlocks", protect, authorize("master"), getUnlocks);
router.post("/purchase", protect, authorize("master"), createPurchase);
router.post("/spend", protect, authorize("master"), spendCredits);

module.exports = router;
