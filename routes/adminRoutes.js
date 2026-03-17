const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  getUser,
  getMaster,
  getAllMasters,
  getActiveUsers,
  getBlockedUsers,
  getNewUsers,
  getGrowthRate,
  createMaster,
  blockUser,
  unblockUser,
  blockMaster,
  unblockMaster,
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
router.get("/masters/:id", getMaster);
router.put("/masters/:id/block", blockMaster);
router.put("/masters/:id/unblock", unblockMaster);
router.post("/masters/:id/unblock", unblockMaster);

module.exports = router;
