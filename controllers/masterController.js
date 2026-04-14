const mongoose = require("mongoose");
const Master = require("../models/Master");
const Order = require("../models/Order");
const asyncHandler = require("express-async-handler");
const {
  MASTER_PROFESSIONS,
  PROFESSION_IDS,
  validateSpecialty,
  getSpecialtyLabel,
} = require("../config/masterProfessions");
const { uploadToB2, deleteFromB2ByPublicUrl } = require("../utils/uploadToB2");
const { applyMasterContactGateToOrders } = require("../utils/orderContactGate");
const { hashPassword } = require("../utils/helpers");

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const orderUserSummary = "name email phone image";
const orderOrderingMasterSummary = "name email phone image slug specialty";

// @desc    List orders this master saved as favourites
// @route   GET /api/masters/me/favorite-orders
// @access  Private (master)
const getMyFavoriteOrders = asyncHandler(async (req, res) => {
  const master = await Master.findById(req.user._id).select("favoriteOrders").lean();
  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }
  const ids = master.favoriteOrders || [];
  const orders = await Order.find({ _id: { $in: ids } })
    .populate("user", orderUserSummary)
    .populate("orderingMaster", orderOrderingMasterSummary)
    .populate("master", "name slug image specialty")
    .sort({ createdAt: -1 })
    .lean();

  const data = await applyMasterContactGateToOrders(orders, req.user._id);

  res.json({
    success: true,
    count: data.length,
    data,
  });
});

// @desc    Add an order to this master's favourites
// @route   POST /api/masters/me/favorite-orders
// @access  Private (master)
// Body: { "orderId": "<ObjectId>" }
const addFavoriteOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.body || {};
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    const err = new Error("Valid orderId is required");
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.findById(orderId).lean();
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  await Master.findByIdAndUpdate(req.user._id, {
    $addToSet: { favoriteOrders: orderId },
  });

  res.json({
    success: true,
    message: "Order added to favourites",
  });
});

// @desc    Remove an order from this master's favourites
// @route   DELETE /api/masters/me/favorite-orders/:orderId
//          DELETE /api/masters/me/favorite-orders  body: { "orderId": "..." } or ?orderId=
// @access  Private (master)
const removeFavoriteOrder = asyncHandler(async (req, res) => {
  const orderId =
    req.params.orderId ||
    (req.body && req.body.orderId) ||
    (req.query && req.query.orderId);

  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    const err = new Error(
      "Valid orderId is required (URL param, JSON body, or query)",
    );
    err.statusCode = 400;
    throw err;
  }

  const master = await Master.findById(req.user._id).select("favoriteOrders").lean();
  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  const favorited = (master.favoriteOrders || []).some(
    (id) => String(id) === String(orderId),
  );
  if (!favorited) {
    const err = new Error("Order is not in your favourites");
    err.statusCode = 404;
    throw err;
  }

  await Master.findByIdAndUpdate(req.user._id, {
    $pull: { favoriteOrders: orderId },
  });

  res.json({
    success: true,
    message: "Order removed from favourites",
  });
});

// @desc    List allowed master professions (for dropdowns)
// @route   GET /api/masters/professions
// @access  Public
const getProfessions = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: MASTER_PROFESSIONS,
  });
});

// @desc    Get my portfolio images
// @route   GET /api/masters/me/portfolio
// @access  Private (master)
const getMyPortfolio = asyncHandler(async (req, res) => {
  const master = await Master.findById(req.user._id).select("portfolioImages");
  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }
  res.json({
    success: true,
    data: {
      portfolioImages: master.portfolioImages || [],
    },
  });
});

// @desc    Add portfolio images (append; max 30 total)
// @route   POST /api/masters/me/portfolio
// @access  Private (master)
const addPortfolioImages = asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (!files.length) {
    const err = new Error("Please upload at least one image (field name: images).");
    err.statusCode = 400;
    throw err;
  }

  const master = await Master.findById(req.user._id);
  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  const existing = Array.isArray(master.portfolioImages)
    ? master.portfolioImages.length
    : 0;
  const incoming = files.length;
  const maxTotal = 30;

  if (existing + incoming > maxTotal) {
    const err = new Error(
      `Portfolio limit exceeded. You have ${existing} images and tried to add ${incoming}. Maximum is ${maxTotal}.`,
    );
    err.statusCode = 400;
    throw err;
  }

  const newUrls = [];
  for (const f of files) {
    if (f && f.buffer) {
      newUrls.push(
        await uploadToB2(f.buffer, f.originalname, f.mimetype, "portfolio"),
      );
    }
  }

  master.portfolioImages = [...(master.portfolioImages || []), ...newUrls];
  await master.save();

  const data = master.toObject();
  delete data.password;

  res.status(201).json({
    success: true,
    data,
    message: "Portfolio images added successfully",
  });
});

// @desc    Remove portfolio image(s) from B2 and from this master
// @route   DELETE /api/masters/me/portfolio
// @access  Private (master)
// Body:   { url: string } or { urls: string[] } — exact URLs as returned by GET /me/portfolio
const removePortfolioImages = asyncHandler(async (req, res) => {
  const { url: rawUrl, urls: rawUrls } = req.body || {};
  let toRemove = [];
  if (Array.isArray(rawUrls) && rawUrls.length) {
    toRemove = rawUrls
      .map((u) => (typeof u === "string" ? u.trim() : ""))
      .filter(Boolean);
  } else if (rawUrl != null && typeof rawUrl === "string" && rawUrl.trim()) {
    toRemove = [rawUrl.trim()];
  } else {
    const err = new Error('Body must include "url" or non-empty "urls" array');
    err.statusCode = 400;
    throw err;
  }

  const seen = new Set();
  toRemove = toRemove.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  const master = await Master.findById(req.user._id);
  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  const current = Array.isArray(master.portfolioImages)
    ? [...master.portfolioImages]
    : [];

  for (const u of toRemove) {
    if (!current.includes(u)) {
      const err = new Error("Image URL not found in your portfolio");
      err.statusCode = 404;
      throw err;
    }
  }

  for (const u of toRemove) {
    await deleteFromB2ByPublicUrl(u);
  }

  const removeSet = new Set(toRemove);
  master.portfolioImages = current.filter((x) => !removeSet.has(x));
  await master.save();

  const data = master.toObject();
  delete data.password;

  res.json({
    success: true,
    data,
    message:
      toRemove.length === 1
        ? "Portfolio image removed"
        : `${toRemove.length} portfolio images removed`,
  });
});

// @desc    Get all masters (public list, non-blocked only)
// @route   GET /api/masters
// @access  Public
// Query: specialty, search (name or specialty), location (city/country)
const getMasters = asyncHandler(async (req, res) => {
  const { specialty, search, location } = req.query;
  const filter = { isBlocked: false };

  if (specialty && String(specialty).trim()) {
    const spec = String(specialty).trim().toLowerCase().replace(/\s+/g, "_");
    if (PROFESSION_IDS.has(spec)) {
      filter.specialty = spec;
    } else {
      filter.specialty = new RegExp(escapeRegex(String(specialty).trim()), "i");
    }
  }
  if (search && String(search).trim()) {
    const term = new RegExp(String(search).trim(), "i");
    filter.$or = [
      { name: term },
      { specialty: term },
    ];
  }
  if (location && String(location).trim()) {
    filter.location = new RegExp(escapeRegex(String(location).trim()), "i");
  }

  const masters = await Master.find(filter)
    .select("name slug image specialty location bio rating reviewCount")
    .lean();

  const data = masters.map((m) => {
    const spec = m.specialty || "";
    const avg = Number.isFinite(m.rating) ? m.rating : 0;
    const cnt =
      Number.isFinite(m.reviewCount) && m.reviewCount >= 0
        ? m.reviewCount
        : 0;
    return {
      _id: m._id,
      name: m.name,
      slug: m.slug,
      image: m.image || "",
      specialty: spec,
      specialtyLabel: getSpecialtyLabel(spec),
      location: m.location || "",
      bio: m.bio || "",
      rating: { average: avg, count: cnt },
    };
  });

  res.json({
    success: true,
    count: data.length,
    data,
  });
});

// @desc    Get master by slug (persisted rating/reviewCount, same shape as list)
// @route   GET /api/masters/:slug
// @access  Public
const getMasterBySlug = asyncHandler(async (req, res) => {
  const master = await Master.findOne({ slug: req.params.slug })
    .select("-__v")
    .lean();

  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  const avg = Number.isFinite(master.rating) ? master.rating : 0;
  const cnt =
    Number.isFinite(master.reviewCount) && master.reviewCount >= 0
      ? master.reviewCount
      : 0;
  master.rating = { average: avg, count: cnt };
  delete master.reviewCount;

  master.specialtyLabel = getSpecialtyLabel(master.specialty || "");

  res.json({
    success: true,
    data: master,
  });
});

// @desc    Create master (admin only - masters register via /auth/masters/register)
// @route   POST /api/masters
// @access  Private (admin)
const createMaster = asyncHandler(async (req, res) => {
  const { name, email, password, specialty, ...rest } = req.body;
  if (!name || !email || !password) {
    const err = new Error("Please provide name, email, and password");
    err.statusCode = 400;
    throw err;
  }
  if (specialty !== undefined) {
    const v = validateSpecialty(specialty);
    if (!v.ok) {
      const err = new Error(v.message);
      err.statusCode = 400;
      throw err;
    }
    rest.specialty = v.specialty;
  }
  const slugify = require("../utils/slugify");
  const existing = await Master.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    const err = new Error("Master with this email already exists");
    err.statusCode = 409;
    throw err;
  }
  const slug = slugify(name) + "-" + Date.now().toString(36).slice(-6);
  const master = await Master.create({
    name,
    email: email.toLowerCase().trim(),
    password: await hashPassword(password),
    slug,
    ...rest,
  });
  const data = master.toObject();
  delete data.password;
  res.status(201).json({
    success: true,
    data,
  });
});

// @desc    Update master
// @route   PUT /api/masters/:slug
// @access  Private (master, own profile only)
const updateMaster = asyncHandler(async (req, res) => {
  if (req.body?.image !== undefined) {
    const err = new Error(
      "Profile image must be uploaded via /api/auth/me as multipart/form-data (field name: image).",
    );
    err.statusCode = 400;
    throw err;
  }

  const body = { ...req.body };
  if (body.specialty !== undefined) {
    const v = validateSpecialty(body.specialty);
    if (!v.ok) {
      const err = new Error(v.message);
      err.statusCode = 400;
      throw err;
    }
    body.specialty = v.specialty;
  }

  const master = await Master.findOneAndUpdate(
    { slug: req.params.slug, _id: req.user._id },
    body,
    { new: true, runValidators: true }
  ).select("-__v");

  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  res.json({
    success: true,
    data: master,
  });
});

// @desc    Delete master
// @route   DELETE /api/masters/:slug
// @access  Private (master, own profile only)
const deleteMaster = asyncHandler(async (req, res) => {
  const master = await Master.findOneAndDelete({
    slug: req.params.slug,
    _id: req.user._id,
  });

  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  res.json({
    success: true,
    data: {},
  });
});

module.exports = {
  getProfessions,
  getMasters,
  getMasterBySlug,
  createMaster,
  updateMaster,
  deleteMaster,
  getMyPortfolio,
  addPortfolioImages,
  removePortfolioImages,
  getMyFavoriteOrders,
  addFavoriteOrder,
  removeFavoriteOrder,
};
