const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middlewares/auth");
const orderUpload = require("../config/orderMulter");
const {
  createOrder,
  getOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
} = require("../controllers/orderController");

const optionalOrderFiles = (req, res, next) => {
  const ct = req.headers["content-type"] || "";
  if (ct.includes("multipart/form-data")) {
    return orderUpload.array("attachments", 5)(req, res, (err) => {
      if (err) {
        err.statusCode = 400;
        return next(err);
      }
      next();
    });
  }
  next();
};

router
  .route("/")
  .post(protect, authorize("user"), optionalOrderFiles, createOrder)
  .get(protect, authorize("user", "master"), getOrders);

router
  .route("/:id")
  .get(protect, authorize("user", "master"), getOrderById)
  .patch(protect, authorize("user"), optionalOrderFiles, updateOrder)
  .delete(protect, authorize("user"), deleteOrder);

module.exports = router;
