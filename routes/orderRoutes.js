const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middlewares/auth");
const {
  createOrder,
  getOrders,
  getOrderById,
} = require("../controllers/orderController");

router
  .route("/")
  .post(protect, authorize("user"), createOrder)
  .get(protect, authorize("user", "master"), getOrders);

router.get("/:id", protect, authorize("user", "master"), getOrderById);

module.exports = router;
