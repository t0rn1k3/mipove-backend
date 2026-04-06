const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Master = require("../models/Master");
const asyncHandler = require("express-async-handler");

const userSummary = "name email phone image";

const MAX_ATTACHMENTS = 10;
const USER_EDITABLE_STATUSES = ["pending"];

function parsePrice(price) {
  if (price == null || price === "") return null;
  const n = Number(price);
  if (Number.isNaN(n) || n < 0) {
    const err = new Error("price must be a non-negative number");
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function parseScheduledAt(value) {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const err = new Error("scheduledAt must be a valid date");
    err.statusCode = 400;
    throw err;
  }
  return d;
}

function attachmentAbsolute(rel) {
  if (!rel || typeof rel !== "string") return null;
  const clean = rel.replace(/^\//, "");
  return path.join(__dirname, "..", clean);
}

function unlinkAttachment(rel) {
  const abs = attachmentAbsolute(rel);
  if (!abs) return;
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

function filesToPaths(files) {
  return (files || [])
    .filter((f) => f && f.filename)
    .map((f) => `/uploads/orders/${f.filename}`);
}

const createOrder = asyncHandler(async (req, res) => {
  const { title, description, scheduledAt, price } = req.body || {};

  if (!title || !String(title).trim()) {
    const err = new Error("Please provide a title for the order");
    err.statusCode = 400;
    throw err;
  }

  const newPaths = filesToPaths(req.files);
  if (newPaths.length > MAX_ATTACHMENTS) {
    newPaths.forEach(unlinkAttachment);
    const err = new Error(`At most ${MAX_ATTACHMENTS} attachment images per order`);
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.create({
    user: req.user._id,
    title: String(title).trim(),
    description: description != null ? String(description).trim() : "",
    scheduledAt: parseScheduledAt(scheduledAt),
    price: parsePrice(price),
    attachments: newPaths,
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

const updateOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("Invalid order id");
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.findOne({ _id: id, user: req.user._id });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (!USER_EDITABLE_STATUSES.includes(order.status)) {
    const err = new Error(
      "Order can only be edited while status is pending",
    );
    err.statusCode = 400;
    throw err;
  }

  const { title, description, scheduledAt, price } = req.body || {};
  const update = {};

  if (title !== undefined) {
    const t = String(title).trim();
    if (!t) {
      const err = new Error("title cannot be empty");
      err.statusCode = 400;
      throw err;
    }
    update.title = t;
  }
  if (description !== undefined) {
    update.description = String(description).trim();
  }
  if (scheduledAt !== undefined) {
    update.scheduledAt = parseScheduledAt(scheduledAt);
  }
  if (price !== undefined) {
    update.price = parsePrice(price);
  }

  const newPaths = filesToPaths(req.files);
  const existing = Array.isArray(order.attachments) ? order.attachments.length : 0;
  if (existing + newPaths.length > MAX_ATTACHMENTS) {
    newPaths.forEach(unlinkAttachment);
    const err = new Error(
      `Attachment limit exceeded (max ${MAX_ATTACHMENTS} images per order)`,
    );
    err.statusCode = 400;
    throw err;
  }
  if (newPaths.length) {
    update.attachments = [...(order.attachments || []), ...newPaths];
  }

  if (Object.keys(update).length === 0) {
    const err = new Error("No fields to update");
    err.statusCode = 400;
    throw err;
  }

  const updated = await Order.findByIdAndUpdate(
    id,
    update,
    { new: true, runValidators: true },
  )
    .populate("user", userSummary)
    .populate("master", "name slug image specialty")
    .lean();

  res.json({
    success: true,
    data: updated,
    message: "Order updated successfully",
  });
});

const deleteOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("Invalid order id");
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.findOne({ _id: id, user: req.user._id });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  (order.attachments || []).forEach(unlinkAttachment);
  await Master.updateMany({ favoriteOrders: id }, { $pull: { favoriteOrders: id } });
  await Order.deleteOne({ _id: id });

  res.json({
    success: true,
    data: {},
    message: "Order deleted successfully",
  });
});

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
};
