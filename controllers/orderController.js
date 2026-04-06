const mongoose = require("mongoose");
const Order = require("../models/Order");
const asyncHandler = require("express-async-handler");

const userSummary =
  "name email phone image";

const createOrder = asyncHandler(async (req, res) => {
  const { title, description, scheduledAt, price } = req.body || {};

  if (!title || !String(title).trim()) {
    const err = new Error("Please provide a title for the order");
    err.statusCode = 400;
    throw err;
  }

  let priceVal = null;
  if (price != null && price !== "") {
    const n = Number(price);
    if (Number.isNaN(n) || n < 0) {
      const err = new Error("price must be a non-negative number");
      err.statusCode = 400;
      throw err;
    }
    priceVal = n;
  }

  const order = await Order.create({
    user: req.user._id,
    title: String(title).trim(),
    description: description != null ? String(description).trim() : "",
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    price: priceVal,
  });

  const populated = await Order.findById(order._id).populate("user", userSummary).lean();

  res.status(201).json({
    success: true,
    data: populated,
    message: "Order created successfully",
  });
});

const getOrders = asyncHandler(async (req, res) => {
  if (req.user.role === "user") {
    const orders = await Order.find({ user: req.user._id })
      .populate("user", userSummary)
      .populate("master", "name slug image specialty")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({
      success: true,
      count: orders.length,
      data: orders,
    });
  }

  if (req.user.role === "master") {
    const orders = await Order.find()
      .populate("user", userSummary)
      .populate("master", "name slug image specialty")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({
      success: true,
      count: orders.length,
      data: orders,
    });
  }

  const err = new Error("Not authorized");
  err.statusCode = 403;
  throw err;
});

const getOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("Invalid order id");
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.findById(id)
    .populate("user", userSummary)
    .populate("master", "name slug image specialty")
    .lean();

  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (req.user.role === "user" && String(order.user._id) !== String(req.user._id)) {
    const err = new Error("Not authorized to view this order");
    err.statusCode = 403;
    throw err;
  }

  if (!["user", "master"].includes(req.user.role)) {
    const err = new Error("Not authorized");
    err.statusCode = 403;
    throw err;
  }

  res.json({
    success: true,
    data: order,
  });
});

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
};
