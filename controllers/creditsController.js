const mongoose = require("mongoose");
const Master = require("../models/Master");
const CreditTransaction = require("../models/CreditTransaction");
const CreditUnlock = require("../models/CreditUnlock");
const asyncHandler = require("express-async-handler");
const { getSpendCost, SPEND_ACTIONS } = require("../config/creditSpend");

function normalizeBalance(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return 0;
}

// @desc    Current credit balance for logged-in master
// @route   GET /api/credits/balance
// @access  Private (master)
const getBalance = asyncHandler(async (req, res) => {
  const master = await Master.findById(req.user._id).select("credits").lean();
  if (!master) {
    const err = new Error("Master not found");
    err.statusCode = 404;
    throw err;
  }
  res.json({ balance: normalizeBalance(master.credits) });
});

// @desc    Paginated credit ledger for logged-in master
// @route   GET /api/credits/history
// @access  Private (master)
const getHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const limitRaw = parseInt(String(req.query.limit || "20"), 10);
  const limit = Math.min(
    100,
    Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20),
  );
  const skip = (page - 1) * limit;

  const filter = { master: req.user._id };

  const [total, rows] = await Promise.all([
    CreditTransaction.countDocuments(filter),
    CreditTransaction.find(filter)
      .select("type amount action balanceAfter createdAt metadata")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const pages = total === 0 ? 0 : Math.ceil(total / limit);

  res.json({
    transactions: rows,
    total,
    page,
    pages,
  });
});

// @desc    Spend credits for a gated action (idempotent via CreditUnlock)
// @route   POST /api/credits/spend
// @access  Private (master)
const spendCredits = asyncHandler(async (req, res) => {
  const { action: rawAction, targetId: rawTarget } = req.body || {};
  const action =
    rawAction != null && typeof rawAction === "string" ? rawAction.trim() : "";
  const targetId =
    rawTarget != null && typeof rawTarget === "string" ? rawTarget.trim() : "";

  if (!action) {
    const err = new Error("action is required");
    err.statusCode = 400;
    throw err;
  }
  if (!targetId) {
    const err = new Error("targetId is required");
    err.statusCode = 400;
    throw err;
  }

  const cost = getSpendCost(action);
  if (cost === undefined) {
    const err = new Error(
      `Invalid action. Allowed: ${SPEND_ACTIONS.join(", ")}`,
    );
    err.statusCode = 400;
    throw err;
  }

  const masterId = req.user._id;
  let result = null;

  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const existingUnlock = await CreditUnlock.findOne({
      master: masterId,
      action,
      targetId,
    })
      .session(session)
      .lean();

    if (existingUnlock) {
      const m = await Master.findById(masterId)
        .session(session)
        .select("credits")
        .lean();
      await session.commitTransaction();
      result = {
        charged: false,
        idempotent: true,
        balance: normalizeBalance(m?.credits),
        action,
        targetId,
      };
    } else {
      const master = await Master.findById(masterId).session(session);
      if (!master) {
        const err = new Error("Master not found");
        err.statusCode = 404;
        throw err;
      }

      const balanceBefore = normalizeBalance(master.credits);
      if (balanceBefore < cost) {
        const err = new Error("Insufficient credits");
        err.statusCode = 402;
        throw err;
      }

      master.credits = balanceBefore - cost;
      await master.save({ session });

      await CreditTransaction.create(
        [
          {
            master: masterId,
            type: "spend",
            amount: -cost,
            balanceBefore: master.credits + cost,
            balanceAfter: master.credits,
            action,
            metadata: { orderId: targetId },
          },
        ],
        { session },
      );

      await CreditUnlock.create(
        [{ master: masterId, action, targetId }],
        { session },
      );

      await session.commitTransaction();
      result = {
        charged: true,
        balance: normalizeBalance(master.credits),
        cost,
        action,
        targetId,
      };
    }
  } catch (err) {
    try {
      await session.abortTransaction();
    } catch {
      /* already committed or aborted */
    }
    if (err && err.code === 11000) {
      const m = await Master.findById(masterId).select("credits").lean();
      result = {
        charged: false,
        idempotent: true,
        balance: normalizeBalance(m?.credits),
        action,
        targetId,
      };
    } else {
      throw err;
    }
  } finally {
    session.endSession();
  }

  res.json(result);
});

module.exports = {
  getBalance,
  getHistory,
  spendCredits,
};
