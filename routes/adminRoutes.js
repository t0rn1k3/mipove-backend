const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  getUser,
  getAllMasters,
  getActiveUsers,
  getBlockedUsers,
  getNewUsers,
  getGrowthRate,
  createMaster,
  blockUser,
  unblockUser,
  getDashboardStats,
} = require("../controllers/adminController");
const { protect, authorize } = require("../middlewares/auth");

router.use(protect, authorize("admin"));

router.get("/stats", getDashboardStats);
router.get("/stats/growth", getGrowthRate);

router.get("/users", getAllUsers);
router.get("/users/active", getActiveUsers);
router.get("/users/blocked", getBlockedUsers);
router.get("/users/new", getNewUsers);
router.get("/users/:id", getUser);
router.put("/users/:id/block", blockUser);
router.put("/users/:id/unblock", unblockUser);
router.post("/users/:id/unblock", unblockUser);

router.get("/masters", getAllMasters);
router.post("/masters", createMaster);

module.exports = router;
