const mongoose = require("mongoose");
const User = require("../models/User");
const Master = require("../models/Master");
const CreditTransaction = require("../models/CreditTransaction");
const slugify = require("../utils/slugify");
const asyncHandler = require("express-async-handler");
const { hashPassword } = require("../utils/helpers");

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (admin)
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find()
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    count: users.length,
    data: users,
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
    data: masters,
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
    data: users,
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
    data: users,
  });
});

// @desc    Get new users from past month
// @route   GET /api/admin/users/new
// @access  Private (admin)
const getNewUsers = asyncHandler(async (req, res) => {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const users = await User.find({ createdAt: { $gte: oneMonthAgo } })
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    count: users.length,
    data: users,
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
  const { name, email, phone, password } = req.body;
  const emailNorm = email.toLowerCase().trim();

  if (!name || !email || !password) {
    const err = new Error("Please provide name, email, and password");
    err.statusCode = 400;
    throw err;
  }

  const [existingUser, existingMaster] = await Promise.all([
    User.findOne({ email: emailNorm }),
    Master.findOne({ email: emailNorm }),
  ]);
  if (existingUser || existingMaster) {
    const err = new Error("Account with this email already exists");
    err.statusCode = 409;
    throw err;
  }

  const hashedPassword = await hashPassword(password);
  const slug = slugify(name) + "-" + Date.now().toString(36).slice(-6);
  const master = await Master.create({
    name,
    email: emailNorm,
    phone: phone || "",
    password: hashedPassword,
    slug,
  });

  const data = master.toObject();
  delete data.password;

  res.status(201).json({
    success: true,
    data: { ...data, role: "master" },
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
    data: user,
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
    data: { ...master, role: "master" },
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
    data: user,
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
    data: user,
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

  const data = master.toObject ? master.toObject() : master;
  data.role = "master";
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

  const data = master.toObject ? master.toObject() : master;
  data.role = "master";
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
      totalUsers,
      totalMasters,
      activeUsers,
      blockedUsers,
      newUsersLastMonth: newUsers,
      growthRate: Math.round(growthRate * 10) / 10,
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
  if (!Number.isFinite(amount) || amount === 0) {
    const err = new Error("amount must be a non-zero number");
    err.statusCode = 400;
    throw err;
  }

  const note =
    rawNote != null && typeof rawNote === "string" ? rawNote.trim() : "";
  if (!note) {
    const err = new Error("note is required");
    err.statusCode = 400;
    throw err;
  }

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
          metadata: { note },
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
  adjustMasterCredits,
};
