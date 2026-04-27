const jwt = require("jsonwebtoken");
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
const {
  uploadToB2,
  deleteFromB2ByPublicUrl,
  buildPortfolioImageKey,
  getPresignedPutPortfolio,
  assertPortfolioObjectExists,
  getPublicBaseUrl,
} = require("../utils/uploadToB2");
const {
  MAX_PORTFOLIO_IMAGES,
  MAX_IMAGE_FILE_BYTES,
  ALLOWED_IMAGE_MIMETYPES,
} = require("../config/memoryMulter");
const { applyMasterContactGateToOrders } = require("../utils/orderContactGate");
const { serializeOrdersForApi } = require("../utils/serializeOrder");
const { hashPassword } = require("../utils/helpers");

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PORTFOLIO_COMMIT_JWT_TYP = "b2_portfolio_put";
const PRESIGN_MAX_FILES_PER_REQUEST = 15;

function signPortfolioCommitToken(key, masterId) {
  return jwt.sign(
    { typ: PORTFOLIO_COMMIT_JWT_TYP, k: key, sub: String(masterId) },
    process.env.JWT_SECRET || "mipove-secret",
    { expiresIn: "15m" },
  );
}

function verifyPortfolioCommitToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET || "mipove-secret");
  if (decoded.typ !== PORTFOLIO_COMMIT_JWT_TYP) {
    const err = new Error("Invalid commit token");
    err.statusCode = 400;
    throw err;
  }
  return decoded;
}

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

  const data = serializeOrdersForApi(
    await applyMasterContactGateToOrders(orders, req.user._id),
  );

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

// @desc    Public limits for portfolio upload (field name, size, types) — use in client validation
// @route   GET /api/masters/portfolio/upload-limits
// @access  Public
const getPortfolioUploadLimits = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      fieldName: "images",
      maxFileSizeBytes: MAX_IMAGE_FILE_BYTES,
      maxFilesPerRequest: MAX_PORTFOLIO_IMAGES,
      maxPortfolioImagesTotal: MAX_PORTFOLIO_IMAGES,
      allowedMimeTypes: [...ALLOWED_IMAGE_MIMETYPES],
      note:
        "The reverse proxy in front of Node may enforce a smaller request body than this API; " +
        "if large phone photos fail with 'Failed to fetch', increase proxy client_max_body_size (e.g. nginx 25m), " +
        "or use directToB2 to upload file bytes to storage without sending them through this API.",
      directToB2: {
        presign: { method: "POST", path: "/api/masters/me/portfolio/presign" },
        commit: { method: "POST", path: "/api/masters/me/portfolio/commit" },
        requestPresign: { body: { files: [{ name: "photo.jpg", contentType: "image/jpeg" }] } },
        thenPutEach: "PUT file bytes to each returned putUrl with header Content-Type exactly as returned",
        thenCommit: { body: { items: [{ commitToken: "from presign response" }] } },
        b2Cors:
          "Backblaze B2 bucket CORS must allow PUT (and often HEAD) from your website origin, or the browser will block direct uploads.",
      },
    },
  });
});

// @desc    Presign PUT URLs for direct browser → B2 (bypasses proxy body limits on this API)
// @route   POST /api/masters/me/portfolio/presign
// @access  Private (master)
// Body:   { files: [ { name: "a.jpg", contentType: "image/jpeg" } ] }
const presignPortfolioUploads = asyncHandler(async (req, res) => {
  const raw = req.body?.files;
  if (!Array.isArray(raw) || raw.length === 0) {
    const err = new Error(
      'Body "files" must be a non-empty array of { name, contentType }',
    );
    err.statusCode = 400;
    throw err;
  }
  if (raw.length > PRESIGN_MAX_FILES_PER_REQUEST) {
    const err = new Error(
      `At most ${PRESIGN_MAX_FILES_PER_REQUEST} files per presign request`,
    );
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
  if (existing + raw.length > MAX_PORTFOLIO_IMAGES) {
    const err = new Error(
      `Portfolio limit exceeded. You have ${existing} images and requested ${raw.length} new slots. Maximum is ${MAX_PORTFOLIO_IMAGES}.`,
    );
    err.statusCode = 400;
    throw err;
  }

  const base = getPublicBaseUrl().replace(/\/+$/, "");
  const uploads = [];

  for (const f of raw) {
    const name = f?.name != null && typeof f.name === "string" ? f.name.trim() : "";
    const contentType =
      f?.contentType != null && typeof f.contentType === "string"
        ? f.contentType.trim()
        : "";
    if (!name || !contentType) {
      const err = new Error("Each file needs non-empty name and contentType");
      err.statusCode = 400;
      throw err;
    }
    if (!ALLOWED_IMAGE_MIMETYPES.includes(contentType)) {
      const err = new Error(
        `Invalid content type. Allowed: ${ALLOWED_IMAGE_MIMETYPES.join(", ")}`,
      );
      err.statusCode = 400;
      throw err;
    }
    const key = buildPortfolioImageKey(name);
    const putUrl = await getPresignedPutPortfolio(key, contentType, 900);
    const publicUrl = `${base}/${key}`;
    const commitToken = signPortfolioCommitToken(key, master._id);
    uploads.push({
      key,
      putUrl,
      publicUrl,
      contentType,
      commitToken,
      expiresInSeconds: 900,
    });
  }

  res.json({ success: true, data: { uploads } });
});

// @desc    After PUT to B2, register portfolio URLs
// @route   POST /api/masters/me/portfolio/commit
// @access  Private (master)
// Body:   { items: [ { commitToken: "…" } ] }
const commitPortfolioUploads = asyncHandler(async (req, res) => {
  const raw = req.body?.items;
  if (!Array.isArray(raw) || raw.length === 0) {
    const err = new Error(
      'Body "items" must be a non-empty array of { commitToken }',
    );
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
  if (existing + raw.length > MAX_PORTFOLIO_IMAGES) {
    const err = new Error(
      `Portfolio limit exceeded. You have ${existing} images and are adding ${raw.length} more. Maximum is ${MAX_PORTFOLIO_IMAGES}.`,
    );
    err.statusCode = 400;
    throw err;
  }

  const base = getPublicBaseUrl().replace(/\/+$/, "");
  const newUrls = [];
  const seenKeys = new Set();

  for (const item of raw) {
    const token =
      item?.commitToken != null && typeof item.commitToken === "string"
        ? item.commitToken.trim()
        : "";
    if (!token) {
      const err = new Error("Each item must include commitToken");
      err.statusCode = 400;
      throw err;
    }

    let decoded;
    try {
      decoded = verifyPortfolioCommitToken(token);
    } catch (e) {
      if (e.name === "JsonWebTokenError" || e.name === "TokenExpiredError") {
        const err = new Error("Invalid or expired commit token");
        err.statusCode = 400;
        throw err;
      }
      throw e;
    }

    if (decoded.sub !== String(req.user._id)) {
      const err = new Error("Commit token does not match this user");
      err.statusCode = 403;
      throw err;
    }

    const key = decoded.k;
    if (!key || !/^uploads\/portfolio\/[^/]+$/i.test(String(key))) {
      const err = new Error("Invalid key in commit token");
      err.statusCode = 400;
      throw err;
    }
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);

    try {
      await assertPortfolioObjectExists(key);
    } catch (e) {
      const err = new Error(
        "One or more files are not in storage yet. PUT each file to the returned putUrl with the exact Content-Type, then call commit again.",
      );
      err.statusCode = 400;
      if (process.env.NODE_ENV === "development") {
        err.cause = e;
      }
      throw err;
    }

    newUrls.push(`${base}/${key}`);
  }

  if (newUrls.length === 0) {
    const err = new Error("No new images to add (duplicate commit tokens?)");
    err.statusCode = 400;
    throw err;
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

  if (existing + incoming > MAX_PORTFOLIO_IMAGES) {
    const err = new Error(
      `Portfolio limit exceeded. You have ${existing} images and tried to add ${incoming}. Maximum is ${MAX_PORTFOLIO_IMAGES}.`,
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
  getPortfolioUploadLimits,
  presignPortfolioUploads,
  commitPortfolioUploads,
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
