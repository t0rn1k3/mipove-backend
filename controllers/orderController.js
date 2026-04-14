const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Master = require("../models/Master");
const User = require("../models/User");
const CreditUnlock = require("../models/CreditUnlock");
const { uploadToB2 } = require("../utils/uploadToB2");
const {
  loadContactUnlockedSet,
  applyMasterContactGate,
  applyMasterContactGateToOrders,
  applyGuestOrderListGate,
} = require("../utils/orderContactGate");
const asyncHandler = require("express-async-handler");
const { ORDER_CATEGORIES, validateOrderCategory } = require("../config/orderCategories");

const userSummary = "name email phone image";
const orderingMasterSummary = "name email phone image slug specialty";

const MAX_ATTACHMENTS = 10;
const USER_EDITABLE_STATUSES = ["pending"];
const ORDERS_PAGE_DEFAULT_LIMIT = 15;
const ORDERS_PAGE_MAX_LIMIT = 50;
const ORDERS_LIST_SORT = { createdAt: -1, _id: -1 };

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

function parseNonNegativeNumber(value, fieldName) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error(`${fieldName} must be a non-negative number`);
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function parseLocation(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") {
    return { city: "", addressText: "", lat: null, lng: null };
  }
  let obj = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      const err = new Error("location must be a valid JSON object");
      err.statusCode = 400;
      throw err;
    }
  }
  if (!obj || typeof obj !== "object") {
    const err = new Error("location must be an object");
    err.statusCode = 400;
    throw err;
  }
  const city = obj.city != null ? String(obj.city).trim() : "";
  const addressText = obj.addressText != null ? String(obj.addressText).trim() : "";
  const lat = parseNonNegativeOrSigned(obj.lat, "location.lat");
  const lng = parseNonNegativeOrSigned(obj.lng, "location.lng");
  return { city, addressText, lat, lng };
}

function parseNonNegativeOrSigned(value, fieldName) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    const err = new Error(`${fieldName} must be a valid number`);
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function parseBudget(raw, fallbackCurrency = "GEL") {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") {
    return { min: null, max: null, currency: fallbackCurrency };
  }
  let obj = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      const err = new Error("budget must be a valid JSON object");
      err.statusCode = 400;
      throw err;
    }
  }
  if (!obj || typeof obj !== "object") {
    const err = new Error("budget must be an object");
    err.statusCode = 400;
    throw err;
  }
  const min = parseNonNegativeNumber(obj.min, "budget.min");
  const max = parseNonNegativeNumber(obj.max, "budget.max");
  if (min != null && max != null && max < min) {
    const err = new Error("budget.max must be greater than or equal to budget.min");
    err.statusCode = 400;
    throw err;
  }
  const currency =
    obj.currency != null && String(obj.currency).trim()
      ? String(obj.currency).trim().toUpperCase()
      : fallbackCurrency;
  return { min, max, currency };
}

function parseCategoriesInput(body) {
  if (!body || typeof body !== "object") return undefined;
  if (body.categories !== undefined) return body.categories;
  return body.category;
}

/** Multipart or JSON body: optional customerNameSnapshot / customerPhoneSnapshot. */
function resolveCustomerSnapshotsForCreate(body, account) {
  const b = body || {};
  let customerNameSnapshot = "";
  if (Object.prototype.hasOwnProperty.call(b, "customerNameSnapshot")) {
    customerNameSnapshot =
      b.customerNameSnapshot == null ? "" : String(b.customerNameSnapshot).trim();
  } else if (account?.name) {
    customerNameSnapshot = String(account.name);
  }
  let customerPhoneSnapshot = "";
  if (Object.prototype.hasOwnProperty.call(b, "customerPhoneSnapshot")) {
    customerPhoneSnapshot =
      b.customerPhoneSnapshot == null ? "" : String(b.customerPhoneSnapshot).trim();
  } else if (account?.phone != null) {
    customerPhoneSnapshot = String(account.phone || "");
  }
  return { customerNameSnapshot, customerPhoneSnapshot };
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

/** Remove denormalized order ref from customer profile (new shape + legacy ObjectId[]). */
async function pullUserOrderRef(userId, orderIdStr) {
  const oid = new mongoose.Types.ObjectId(orderIdStr);
  await User.updateOne({ _id: userId }, { $pull: { orders: { orderId: oid } } });
  await User.updateOne({ _id: userId }, { $pull: { orders: oid } });
}

function parseOrdersPagination(req) {
  const hasLimit = Object.prototype.hasOwnProperty.call(req.query, "limit");
  const hasOffset = Object.prototype.hasOwnProperty.call(req.query, "offset");

  if (!hasLimit && !hasOffset) {
    return { usePagination: false };
  }

  let limit = ORDERS_PAGE_DEFAULT_LIMIT;
  if (hasLimit) {
    const raw = req.query.limit;
    if (raw === "" || raw === null) {
      const err = new Error(
        `limit must be an integer between 1 and ${ORDERS_PAGE_MAX_LIMIT}`,
      );
      err.statusCode = 400;
      throw err;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > ORDERS_PAGE_MAX_LIMIT) {
      const err = new Error(
        `limit must be an integer between 1 and ${ORDERS_PAGE_MAX_LIMIT}`,
      );
      err.statusCode = 400;
      throw err;
    }
    limit = n;
  }

  let offset = 0;
  if (hasOffset) {
    const raw = req.query.offset;
    if (raw === "" || raw === null) {
      const err = new Error("offset must be a non-negative integer");
      err.statusCode = 400;
      throw err;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      const err = new Error("offset must be a non-negative integer");
      err.statusCode = 400;
      throw err;
    }
    offset = n;
  }

  return { usePagination: true, limit, offset };
}

function buildOrdersListExtraFilter(req) {
  const extra = {};
  const andParts = [];

  const status = req.query.status;
  if (status != null && String(status).trim()) {
    const s = String(status).trim();
    if (!Order.ORDER_STATUSES.includes(s)) {
      const err = new Error(
        `status must be one of: ${Order.ORDER_STATUSES.join(", ")}`,
      );
      err.statusCode = 400;
      throw err;
    }
    extra.status = s;
  }

  const city = req.query.city;
  if (city != null && String(city).trim()) {
    const esc = String(city).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    extra["location.city"] = new RegExp(esc, "i");
  }

  const parseBudgetEdge = (value, name) => {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      const err = new Error(`${name} must be a non-negative number`);
      err.statusCode = 400;
      throw err;
    }
    return n;
  };

  const bm = parseBudgetEdge(req.query.budgetMin, "budgetMin");
  const bx = parseBudgetEdge(req.query.budgetMax, "budgetMax");
  if (bm != null) {
    andParts.push({
      $or: [{ "budget.max": null }, { "budget.max": { $gte: bm } }],
    });
  }
  if (bx != null) {
    andParts.push({
      $or: [{ "budget.min": null }, { "budget.min": { $lte: bx } }],
    });
  }

  if (andParts.length) {
    extra.$and = andParts;
  }
  return extra;
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
  const {
    title,
    description,
    scheduledAt,
    price,
    budget: budgetRaw,
    location: locationRaw,
  } =
    req.body || {};
  const categoryRaw = parseCategoriesInput(req.body || {});

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
    budget: parseBudget(budgetRaw),
    location: parseLocation(locationRaw),
    attachments: newPaths,
  };

  if (categoryRaw !== undefined) {
    const catResult = validateOrderCategory(categoryRaw);
    if (!catResult.ok) {
      const err = new Error(catResult.message);
      err.statusCode = 400;
      throw err;
    }
    base.categories = catResult.category;
  }

  const { customerNameSnapshot, customerPhoneSnapshot } =
    resolveCustomerSnapshotsForCreate(req.body, req.user);

  const order =
    req.user.role === "user"
      ? await Order.create({
          ...base,
          user: req.user._id,
          customerNameSnapshot,
          customerPhoneSnapshot,
        })
      : await Order.create({
          ...base,
          orderingMaster: req.user._id,
          customerNameSnapshot,
          customerPhoneSnapshot,
        });

  if (req.user.role === "user") {
    await User.findByIdAndUpdate(req.user._id, {
      $push: {
        orders: { orderId: order._id, title: order.title },
      },
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

// GET /api/orders — Public marketplace when unauthenticated or without mine=true (optionalProtect).
// mine=true / placedByMe requires auth; scopes to publisher (user or orderingMaster).
// Omit both limit and offset for legacy `{ data, count }`; else paginated `{ items, hasMore, nextOffset?, ... }`.
// Public list redacts publisher contact + customer snapshots; masters browsing get credit-unlock gate.
const getOrders = asyncHandler(async (req, res) => {
  const categoryParam = req.query.categories ?? req.query.category;
  let categoryFilter = {};
  if (categoryParam != null && String(categoryParam).trim()) {
    const catResult = validateOrderCategory(categoryParam);
    if (!catResult.ok) {
      const err = new Error(catResult.message);
      err.statusCode = 400;
      throw err;
    }
    if (catResult.category && catResult.category.length) {
      categoryFilter = { categories: { $in: catResult.category } };
    }
  }

  const listExtra = buildOrdersListExtraFilter(req);
  const pagination = parseOrdersPagination(req);
  const mine = wantsOnlyMyOrders(req);

  if (mine) {
    if (!req.user) {
      const err = new Error("Authentication required");
      err.statusCode = 401;
      throw err;
    }
    if (!["user", "master"].includes(req.user.role)) {
      const err = new Error("Not authorized to list personal orders");
      err.statusCode = 403;
      throw err;
    }
  }

  if (mine && req.user.role === "user") {
    const filter = { user: req.user._id, ...categoryFilter, ...listExtra };

    if (!pagination.usePagination) {
      const orders = await orderDetailQuery(
        Order.find(filter).sort(ORDERS_LIST_SORT),
      ).lean();
      return res.json({
        success: true,
        count: orders.length,
        data: orders,
      });
    }

    const { limit, offset } = pagination;
    const batch = await orderDetailQuery(
      Order.find(filter).sort(ORDERS_LIST_SORT).skip(offset).limit(limit + 1),
    ).lean();
    const hasMore = batch.length > limit;
    const items = hasMore ? batch.slice(0, limit) : batch;
    const payload = {
      success: true,
      items,
      hasMore,
      limit,
      offset,
    };
    if (hasMore) {
      payload.nextOffset = offset + limit;
    }
    return res.json(payload);
  }

  if (mine && req.user.role === "master") {
    const filter = { orderingMaster: req.user._id, ...categoryFilter, ...listExtra };

    if (!pagination.usePagination) {
      const orders = await orderDetailQuery(
        Order.find(filter).sort(ORDERS_LIST_SORT),
      ).lean();
      const data = await applyMasterContactGateToOrders(orders, req.user._id);
      return res.json({
        success: true,
        count: data.length,
        data,
      });
    }

    const { limit, offset } = pagination;
    const batch = await orderDetailQuery(
      Order.find(filter).sort(ORDERS_LIST_SORT).skip(offset).limit(limit + 1),
    ).lean();
    const hasMore = batch.length > limit;
    const pageOrders = hasMore ? batch.slice(0, limit) : batch;
    const items = await applyMasterContactGateToOrders(pageOrders, req.user._id);
    const payload = {
      success: true,
      items,
      hasMore,
      limit,
      offset,
    };
    if (hasMore) {
      payload.nextOffset = offset + limit;
    }
    return res.json(payload);
  }

  const publicFilter = { ...categoryFilter, ...listExtra };

  if (!pagination.usePagination) {
    const orders = await orderDetailQuery(
      Order.find(publicFilter).sort(ORDERS_LIST_SORT),
    ).lean();
    const data =
      req.user && req.user.role === "master"
        ? await applyMasterContactGateToOrders(orders, req.user._id)
        : orders.map((o) => applyGuestOrderListGate(o, req.user));
    return res.json({
      success: true,
      count: data.length,
      data,
    });
  }

  const { limit, offset } = pagination;
  const batch = await orderDetailQuery(
    Order.find(publicFilter).sort(ORDERS_LIST_SORT).skip(offset).limit(limit + 1),
  ).lean();
  const hasMore = batch.length > limit;
  const pageOrders = hasMore ? batch.slice(0, limit) : batch;
  const items =
    req.user && req.user.role === "master"
      ? await applyMasterContactGateToOrders(pageOrders, req.user._id)
      : pageOrders.map((o) => applyGuestOrderListGate(o, req.user));
  const payload = {
    success: true,
    items,
    hasMore,
    limit,
    offset,
  };
  if (hasMore) {
    payload.nextOffset = offset + limit;
  }
  return res.json(payload);
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

  const {
    title,
    description,
    scheduledAt,
    price,
    budget: budgetRaw,
    location: locationRaw,
  } = req.body || {};
  const categoryRaw = parseCategoriesInput(req.body || {});
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
  if (budgetRaw !== undefined) {
    update.budget = parseBudget(budgetRaw);
  }
  if (locationRaw !== undefined) {
    update.location = parseLocation(locationRaw);
  }
  if (categoryRaw !== undefined) {
    const catResult = validateOrderCategory(categoryRaw);
    if (!catResult.ok) {
      const err = new Error(catResult.message);
      err.statusCode = 400;
      throw err;
    }
    update.categories = catResult.category;
  }

  if (req.body.customerNameSnapshot !== undefined) {
    update.customerNameSnapshot =
      req.body.customerNameSnapshot == null
        ? ""
        : String(req.body.customerNameSnapshot).trim();
  }
  if (req.body.customerPhoneSnapshot !== undefined) {
    update.customerPhoneSnapshot =
      req.body.customerPhoneSnapshot == null
        ? ""
        : String(req.body.customerPhoneSnapshot).trim();
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

  if (req.user.role === "user" && update.title !== undefined) {
    await User.updateOne(
      { _id: req.user._id, "orders.orderId": new mongoose.Types.ObjectId(id) },
      { $set: { "orders.$.title": update.title } },
    );
  }

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

// @desc    Owner deletes their order (customer: Order.user; master: Order.orderingMaster). Pending only, same as PATCH.
// @route   DELETE /api/orders/:id
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

  if (!USER_EDITABLE_STATUSES.includes(order.status)) {
    const err = new Error("Order can only be deleted while status is pending");
    err.statusCode = 400;
    throw err;
  }

  (order.attachments || []).forEach(unlinkAttachment);
  await Master.updateMany({ favoriteOrders: id }, { $pull: { favoriteOrders: id } });
  await CreditUnlock.deleteMany({ targetId: String(id) });
  if (req.user.role === "user") {
    await pullUserOrderRef(req.user._id, id);
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
