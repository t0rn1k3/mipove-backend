const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Master = require("../models/Master");
const User = require("../models/User");
const { uploadToB2 } = require("../utils/uploadToB2");
const {
  loadContactUnlockedSet,
  applyMasterContactGate,
  applyMasterContactGateToOrders,
} = require("../utils/orderContactGate");
const asyncHandler = require("express-async-handler");
const { ORDER_CATEGORIES, validateOrderCategory } = require("../config/orderCategories");

const userSummary = "name email phone image";
const orderingMasterSummary = "name email phone image slug specialty";

const MAX_ATTACHMENTS = 10;
const USER_EDITABLE_STATUSES = ["pending"];

function orderDetailQuery(q) {
  return q
    .populate("user", userSummary)
    .populate("orderingMaster", orderingMasterSummary)
    .populate("master", "name slug image specialty");
}

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
  if (/^https?:\/\//i.test(rel)) return null;
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

async function uploadOrderAttachments(files) {
  const list = (files || []).filter((f) => f && f.buffer);
  const urls = [];
  for (const f of list) {
    urls.push(
      await uploadToB2(f.buffer, f.originalname, f.mimetype, "orders"),
    );
  }
  return urls;
}

function wantsOnlyMyOrders(req) {
  const v = req.query?.mine ?? req.query?.placedByMe;
  return v === "1" || String(v).toLowerCase() === "true";
}

// @desc    List order categories for filters (marketplace)
// @route   GET /api/orders/categories
// @access  Public
const getOrderCategories = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    categories: ORDER_CATEGORIES,
  });
});

const createOrder = asyncHandler(async (req, res) => {
  const { title, description, scheduledAt, price, category: categoryRaw } =
    req.body || {};

  if (!title || !String(title).trim()) {
    const err = new Error("Please provide a title for the order");
    err.statusCode = 400;
    throw err;
  }

  if (!["user", "master"].includes(req.user.role)) {
    const err = new Error("Only users and masters can create orders");
    err.statusCode = 403;
    throw err;
  }

  const incoming = (req.files || []).filter((f) => f && f.buffer);
  if (incoming.length > MAX_ATTACHMENTS) {
    const err = new Error(`At most ${MAX_ATTACHMENTS} attachment images per order`);
    err.statusCode = 400;
    throw err;
  }
  const newPaths = await uploadOrderAttachments(req.files);

  const base = {
    title: String(title).trim(),
    description: description != null ? String(description).trim() : "",
    scheduledAt: parseScheduledAt(scheduledAt),
    price: parsePrice(price),
    attachments: newPaths,
  };

  if (categoryRaw !== undefined) {
    const catResult = validateOrderCategory(categoryRaw);
    if (!catResult.ok) {
      const err = new Error(catResult.message);
      err.statusCode = 400;
      throw err;
    }
    base.category = catResult.category;
  }

  const order =
    req.user.role === "user"
      ? await Order.create({ ...base, user: req.user._id })
      : await Order.create({ ...base, orderingMaster: req.user._id });

  if (req.user.role === "user") {
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { orders: order._id },
    });
  }

  let data = await orderDetailQuery(Order.findById(order._id)).lean();
  if (req.user.role === "master") {
    const unlockedSet = await loadContactUnlockedSet(req.user._id, [String(data._id)]);
    data = applyMasterContactGate(data, req.user._id, unlockedSet);
  }

  res.status(201).json({
    success: true,
    data,
    message: "Order created successfully",
  });
});

const getOrders = asyncHandler(async (req, res) => {
  const categoryParam = req.query.category;
  let categoryFilter = {};
  if (categoryParam != null && String(categoryParam).trim()) {
    const catResult = validateOrderCategory(categoryParam);
    if (!catResult.ok) {
      const err = new Error(catResult.message);
      err.statusCode = 400;
      throw err;
    }
    if (catResult.category) {
      categoryFilter = { category: catResult.category };
    }
  }

  if (req.user.role === "user") {
    const orders = await orderDetailQuery(
      Order.find({ user: req.user._id, ...categoryFilter }).sort({
        createdAt: -1,
      }),
    ).lean();
    return res.json({
      success: true,
      count: orders.length,
      data: orders,
    });
  }

  if (req.user.role === "master") {
    const filter = wantsOnlyMyOrders(req)
      ? { orderingMaster: req.user._id, ...categoryFilter }
      : { ...categoryFilter };
    const orders = await orderDetailQuery(
      Order.find(filter).sort({ createdAt: -1 }),
    ).lean();
    const data = await applyMasterContactGateToOrders(orders, req.user._id);
    return res.json({
      success: true,
      count: data.length,
      data,
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

  const order = await orderDetailQuery(Order.findById(id)).lean();

  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (req.user.role === "user") {
    const uid = order.user && order.user._id ? String(order.user._id) : null;
    if (!uid || uid !== String(req.user._id)) {
      const err = new Error("Not authorized to view this order");
      err.statusCode = 403;
      throw err;
    }
  }

  if (!["user", "master"].includes(req.user.role)) {
    const err = new Error("Not authorized");
    err.statusCode = 403;
    throw err;
  }

  let data = order;
  if (req.user.role === "master") {
    const unlockedSet = await loadContactUnlockedSet(req.user._id, [
      String(order._id),
    ]);
    data = applyMasterContactGate(order, req.user._id, unlockedSet);
  }

  res.json({
    success: true,
    data,
  });
});

const updateOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("Invalid order id");
    err.statusCode = 400;
    throw err;
  }

  const ownerFilter =
    req.user.role === "user"
      ? { user: req.user._id }
      : req.user.role === "master"
        ? { orderingMaster: req.user._id }
        : null;

  if (!ownerFilter) {
    const err = new Error("Not authorized");
    err.statusCode = 403;
    throw err;
  }

  const order = await Order.findOne({ _id: id, ...ownerFilter });
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

  const { title, description, scheduledAt, price, category: categoryRaw } =
    req.body || {};
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
  if (categoryRaw !== undefined) {
    const catResult = validateOrderCategory(categoryRaw);
    if (!catResult.ok) {
      const err = new Error(catResult.message);
      err.statusCode = 400;
      throw err;
    }
    update.category = catResult.category;
  }

  const incoming = (req.files || []).filter((f) => f && f.buffer);
  const existing = Array.isArray(order.attachments) ? order.attachments.length : 0;
  if (existing + incoming.length > MAX_ATTACHMENTS) {
    const err = new Error(
      `Attachment limit exceeded (max ${MAX_ATTACHMENTS} images per order)`,
    );
    err.statusCode = 400;
    throw err;
  }
  const newPaths =
    incoming.length > 0 ? await uploadOrderAttachments(req.files) : [];
  if (newPaths.length) {
    update.attachments = [...(order.attachments || []), ...newPaths];
  }

  if (Object.keys(update).length === 0) {
    const err = new Error("No fields to update");
    err.statusCode = 400;
    throw err;
  }

  const updated = await orderDetailQuery(
    Order.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }),
  ).lean();

  let data = updated;
  if (req.user.role === "master") {
    const unlockedSet = await loadContactUnlockedSet(req.user._id, [String(updated._id)]);
    data = applyMasterContactGate(updated, req.user._id, unlockedSet);
  }

  res.json({
    success: true,
    data,
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

  const ownerFilter =
    req.user.role === "user"
      ? { user: req.user._id }
      : req.user.role === "master"
        ? { orderingMaster: req.user._id }
        : null;

  if (!ownerFilter) {
    const err = new Error("Not authorized");
    err.statusCode = 403;
    throw err;
  }

  const order = await Order.findOne({ _id: id, ...ownerFilter });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  (order.attachments || []).forEach(unlinkAttachment);
  await Master.updateMany({ favoriteOrders: id }, { $pull: { favoriteOrders: id } });
  if (req.user.role === "user") {
    await User.findByIdAndUpdate(req.user._id, { $pull: { orders: id } });
  }
  await Order.deleteOne({ _id: id });

  res.json({
    success: true,
    data: {},
    message: "Order deleted successfully",
  });
});

module.exports = {
  getOrderCategories,
  createOrder,
  getOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
};
