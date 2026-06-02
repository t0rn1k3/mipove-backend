const mongoose = require("mongoose");
const User = require("../models/User");
const Master = require("../models/Master");
const CreditTransaction = require("../models/CreditTransaction");
const slugify = require("../utils/slugify");
const asyncHandler = require("express-async-handler");
const { hashPassword } = require("../utils/helpers");

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function toAdminUserShape(entity, forcedRole) {
  const src = entity && entity.toObject ? entity.toObject() : entity || {};
  const role = forcedRole || src.role;
  return {
    ...src,
    role,
    blocked: Boolean(src.isBlocked),
  };
}

function parseOptionalTrimmedString(rawValue) {
  if (rawValue === undefined) return undefined;
  if (typeof rawValue !== "string") return null;
  return rawValue.trim();
}

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (admin)
const getAllUsers = asyncHandler(async (req, res) => {
  const statusRaw =
    req.query?.status != null && typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "all";

  if (!["all", "active", "blocked", "new"].includes(statusRaw)) {
    const err = new Error("status is invalid");
    err.statusCode = 400;
    throw err;
  }

  const filter = {};
  if (statusRaw === "active") filter.isBlocked = false;
  if (statusRaw === "blocked") filter.isBlocked = true;
  if (statusRaw === "new") {
    filter.createdAt = { $gte: new Date(Date.now() - SEVEN_DAYS_MS) };
  }

  const users = await User.find(filter)
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    count: users.length,
    data: users.map((user) => toAdminUserShape(user)),
  });
});

// @desc    Get all masters (from masters collection)
// @route   GET /api/admin/masters
// @access  Private (admin)
const getAllMasters = asyncHandler(async (req, res) => {
  const masters = await Master.find()
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    count: masters.length,
    data: masters.map((master) => toAdminUserShape(master, "master")),
  });
});

// @desc    Get active users (not blocked)
// @route   GET /api/admin/users/active
// @access  Private (admin)
const getActiveUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ isBlocked: false })
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    count: users.length,
    data: users.map((user) => toAdminUserShape(user)),
  });
});

// @desc    Get blocked users
// @route   GET /api/admin/users/blocked
// @access  Private (admin)
const getBlockedUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ isBlocked: true })
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    count: users.length,
    data: users.map((user) => toAdminUserShape(user)),
  });
});

// @desc    Get new users from past month
// @route   GET /api/admin/users/new
// @access  Private (admin)
const getNewUsers = asyncHandler(async (req, res) => {
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);

  const users = await User.find({ createdAt: { $gte: sevenDaysAgo } })
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    count: users.length,
    data: users.map((user) => toAdminUserShape(user)),
  });
});

// @desc    Get growth rate stats
// @route   GET /api/admin/stats/growth
// @access  Private (admin)
const getGrowthRate = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [thisMonthCount, lastMonthCount] = await Promise.all([
    User.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
    User.countDocuments({
      createdAt: { $gte: startOfLastMonth, $lt: startOfThisMonth },
    }),
  ]);

  let growthRate = 0;
  if (lastMonthCount > 0) {
    growthRate = ((thisMonthCount - lastMonthCount) / lastMonthCount) * 100;
  } else if (thisMonthCount > 0) {
    growthRate = 100;
  }

  res.json({
    success: true,
    data: {
      thisMonth: thisMonthCount,
      lastMonth: lastMonthCount,
      growthRate: Math.round(growthRate * 10) / 10,
    },
  });
});

// @desc    Create new master (by admin) - creates in masters collection
// @route   POST /api/admin/masters
// @access  Private (admin)
const createMaster = asyncHandler(async (req, res) => {
  const name = parseOptionalTrimmedString(req.body?.name);
  const email = parseOptionalTrimmedString(req.body?.email);
  const password = req.body?.password;
  const phone = parseOptionalTrimmedString(req.body?.phone);
  const specialty = parseOptionalTrimmedString(req.body?.specialty);
  const location = parseOptionalTrimmedString(req.body?.location);

  if (!name || !email || typeof password !== "string" || !password.trim()) {
    const err = new Error("Please provide name, email, and password");
    err.statusCode = 400;
    throw err;
  }
  const emailNorm = email.toLowerCase();

  const [existingUser, existingMaster] = await Promise.all([
    User.findOne({ email: emailNorm }),
    Master.findOne({ email: emailNorm }),
  ]);
  if (existingUser || existingMaster) {
    const err = new Error("Account with this email already exists");
    err.statusCode = 400;
    throw err;
  }

  const hashedPassword = await hashPassword(password.trim());
  const slug = slugify(name) + "-" + Date.now().toString(36).slice(-6);
  const master = await Master.create({
    name,
    email: emailNorm,
    phone: phone || "",
    password: hashedPassword,
    slug,
    specialty: specialty || "",
    location: location || "",
  });

  const data = toAdminUserShape(master, "master");
  delete data.password;
  delete data.isBlocked;

  res.status(201).json({
    success: true,
    data,
    message: "Master created successfully",
  });
});

// @desc    Get single user by ID (users collection only)
// @route   GET /api/admin/users/:id
// @access  Private (admin)
const getUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id).select("-password").lean();

  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  res.json({
    success: true,
    data: toAdminUserShape(user),
  });
});

// @desc    Get single master by ID
// @route   GET /api/admin/masters/:id
// @access  Private (admin)
const getMaster = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const master = await Master.findById(id).select("-password").lean();

  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  res.json({
    success: true,
    data: toAdminUserShape(master, "master"),
  });
});

// @desc    Block user
// @route   PUT /api/admin/users/:id/block
// @access  Private (admin)
const blockUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const { blocked } = body;

  const user = await User.findByIdAndUpdate(
    id,
    { isBlocked: blocked !== false },
    { new: true }
  ).select("-password");

  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  res.json({
    success: true,
    data: toAdminUserShape(user),
    message: user.isBlocked ? "User blocked" : "User unblocked",
  });
});

// @desc    Unblock user
// @route   PUT /api/admin/users/:id/unblock
// @access  Private (admin)
const unblockUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findByIdAndUpdate(
    id,
    { isBlocked: false },
    { new: true }
  ).select("-password");

  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  res.json({
    success: true,
    data: toAdminUserShape(user),
    message: "User unblocked",
  });
});

// @desc    Block master
// @route   PUT /api/admin/masters/:id/block
// @access  Private (admin)
const blockMaster = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const { blocked } = body;

  const master = await Master.findByIdAndUpdate(
    id,
    { isBlocked: blocked !== false },
    { new: true }
  ).select("-password");

  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  const data = toAdminUserShape(master, "master");
  res.json({
    success: true,
    data,
    message: master.isBlocked ? "Master blocked" : "Master unblocked",
  });
});

// @desc    Unblock master
// @route   PUT /api/admin/masters/:id/unblock
// @access  Private (admin)
const unblockMaster = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const master = await Master.findByIdAndUpdate(
    id,
    { isBlocked: false },
    { new: true }
  ).select("-password");

  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  const data = toAdminUserShape(master, "master");
  res.json({
    success: true,
    data,
    message: "Master unblocked",
  });
});

// @desc    Get dashboard stats summary
// @route   GET /api/admin/stats
// @access  Private (admin)
const getDashboardStats = asyncHandler(async (req, res) => {
  const [totalUsers, totalMasters, activeUsers, blockedUsers, newUsers] =
    await Promise.all([
      User.countDocuments(),
      Master.countDocuments(),
      User.countDocuments({ isBlocked: false }),
      User.countDocuments({ isBlocked: true }),
      User.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      }),
    ]);

  const startOfThisMonth = new Date();
  startOfThisMonth.setDate(1);
  startOfThisMonth.setHours(0, 0, 0, 0);
  const startOfLastMonth = new Date(
    startOfThisMonth.getFullYear(),
    startOfThisMonth.getMonth() - 1,
    1
  );

  const [thisMonthCount, lastMonthCount] = await Promise.all([
    User.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
    User.countDocuments({
      createdAt: { $gte: startOfLastMonth, $lt: startOfThisMonth },
    }),
  ]);

  let growthRate = 0;
  if (lastMonthCount > 0) {
    growthRate =
      ((thisMonthCount - lastMonthCount) / lastMonthCount) * 100;
  } else if (thisMonthCount > 0) {
    growthRate = 100;
  }

  res.json({
    success: true,
    data: {
      users: totalUsers,
      masters: totalMasters,
      totalUsers,
      totalMasters,
      activeUsers,
      blockedUsers,
      newUsersLastMonth: newUsers,
      growthRate: Math.round(growthRate * 10) / 10,
    },
  });
});

// @desc    Get master credits balance by master id
// @route   GET /api/admin/credits/balance?masterId=<id>
// @access  Private (admin)
const getMasterCreditsBalance = asyncHandler(async (req, res) => {
  const rawMasterId = req.query?.masterId;
  const masterId = typeof rawMasterId === "string" ? rawMasterId.trim() : "";

  if (!masterId || !mongoose.Types.ObjectId.isValid(masterId)) {
    const err = new Error("masterId is invalid");
    err.statusCode = 400;
    throw err;
  }

  const master = await Master.findById(masterId).select("credits").lean();
  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  const balance =
    typeof master.credits === "number" && Number.isFinite(master.credits)
      ? master.credits
      : 0;

  res.json({
    success: true,
    data: {
      balance,
      currentBalance: balance,
    },
  });
});

// @desc    Get master credits transaction history by master id
// @route   GET /api/admin/credits/history?masterId=<id>&page=<n>&limit=<n>
// @access  Private (admin)
const getMasterCreditsHistory = asyncHandler(async (req, res) => {
  const rawMasterId = req.query?.masterId;
  const masterId = typeof rawMasterId === "string" ? rawMasterId.trim() : "";

  if (!masterId || !mongoose.Types.ObjectId.isValid(masterId)) {
    const err = new Error("masterId is invalid");
    err.statusCode = 400;
    throw err;
  }

  const masterExists = await Master.exists({ _id: masterId });
  if (!masterExists) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const limitRaw = parseInt(String(req.query.limit || "20"), 10);
  const limit = Math.min(
    100,
    Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20),
  );
  const skip = (page - 1) * limit;

  const filter = { master: masterId };
  const [total, transactions] = await Promise.all([
    CreditTransaction.countDocuments(filter),
    CreditTransaction.find(filter)
      .select("type amount action balanceAfter metadata createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const pages = total === 0 ? 0 : Math.ceil(total / limit);

  res.json({
    success: true,
    data: {
      transactions,
      total,
      page,
      pages,
    },
  });
});

// @desc    Adjust master credits (grant or deduct)
// @route   POST /api/admin/credits/adjust
// @access  Private (admin)
// Body:   { masterId, amount, note } — amount may be negative; result cannot go below 0
const adjustMasterCredits = asyncHandler(async (req, res) => {
  const rawId = req.body?.masterId;
  const rawAmount = req.body?.amount;
  const rawNote = req.body?.note;

  const masterIdStr =
    rawId != null && typeof rawId === "string" ? rawId.trim() : "";
  if (!masterIdStr || !mongoose.Types.ObjectId.isValid(masterIdStr)) {
    const err = new Error("Valid masterId is required");
    err.statusCode = 400;
    throw err;
  }

  const amount = Number(rawAmount);
  if (!Number.isInteger(amount) || amount === 0) {
    const err = new Error("amount must be a non-zero integer");
    err.statusCode = 400;
    throw err;
  }

  if (rawNote != null && typeof rawNote !== "string") {
    const err = new Error("note is invalid");
    err.statusCode = 400;
    throw err;
  }
  const note = typeof rawNote === "string" ? rawNote.trim() : "";

  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const master = await Master.findById(masterIdStr).session(session);
    if (!master) {
      const err = new Error("Master not found");
      err.statusCode = 404;
      throw err;
    }

    const balanceBefore =
      typeof master.credits === "number" &&
      Number.isFinite(master.credits) &&
      master.credits >= 0
        ? master.credits
        : 0;
    const balanceAfter = balanceBefore + amount;
    if (balanceAfter < 0) {
      const err = new Error("Adjustment would make credits negative");
      err.statusCode = 400;
      throw err;
    }

    master.credits = balanceAfter;
    await master.save({ session });

    await CreditTransaction.create(
      [
        {
          master: master._id,
          type: "admin_adjust",
          amount,
          balanceBefore,
          balanceAfter,
          action: "admin_adjust",
          metadata: note ? { note } : {},
        },
      ],
      { session },
    );

    await session.commitTransaction();

    res.json({
      success: true,
      data: {
        masterId: String(master._id),
        credits: balanceAfter,
        amount,
      },
    });
  } catch (err) {
    try {
      await session.abortTransaction();
    } catch {
      /* noop */
    }
    throw err;
  } finally {
    session.endSession();
  }
});

// @desc    Update master profile fields
// @route   PATCH /api/admin/masters/:id
// @access  Private (admin)
const updateMaster = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  const fieldNames = ["name", "email", "phone", "specialty", "location", "bio"];
  const updates = {};

  for (const field of fieldNames) {
    const parsed = parseOptionalTrimmedString(req.body?.[field]);
    if (parsed === null) {
      const err = new Error(`${field} is invalid`);
      err.statusCode = 400;
      throw err;
    }
    if (parsed !== undefined) {
      updates[field] = parsed;
    }
  }

  if (!Object.keys(updates).length) {
    const err = new Error("At least one field is required");
    err.statusCode = 400;
    throw err;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "name")) {
    if (!updates.name || updates.name.length > 100) {
      const err = new Error("name is invalid");
      err.statusCode = 400;
      throw err;
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, "email")) {
    if (!updates.email) {
      const err = new Error("email is invalid");
      err.statusCode = 400;
      throw err;
    }
    updates.email = updates.email.toLowerCase();

    const [existingUser, existingMaster] = await Promise.all([
      User.exists({ email: updates.email }),
      Master.exists({ email: updates.email, _id: { $ne: id } }),
    ]);
    if (existingUser || existingMaster) {
      const err = new Error("Email already in use");
      err.statusCode = 409;
      throw err;
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, "bio")) {
    if (updates.bio.length > 1000) {
      const err = new Error("bio is invalid");
      err.statusCode = 400;
      throw err;
    }
  }

  const master = await Master.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  })
    .select("-password")
    .lean();

  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }

  res.json({
    data: toAdminUserShape(master, "master"),
  });
});

module.exports = {
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
  getMasterCreditsBalance,
  getMasterCreditsHistory,
  adjustMasterCredits,
  updateMaster,
};
