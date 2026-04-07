const mongoose = require("mongoose");
const Master = require("../models/Master");
const Order = require("../models/Order");
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

async function assertSpendTargetOk(action, targetId) {
  if (action === "view_contact") {
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      const err = new Error("Invalid order id");
      err.statusCode = 400;
      throw err;
    }
    const exists = await Order.exists({ _id: targetId });
    if (!exists) {
      const err = new Error("Order not found");
      err.statusCode = 404;
      throw err;
    }
    return;
  }
  if (action === "feature_gallery") {
    const q = mongoose.Types.ObjectId.isValid(targetId)
      ? { _id: targetId }
      : { slug: targetId };
    const exists = await Master.exists(q);
    if (!exists) {
      const err = new Error("Master not found");
      err.statusCode = 404;
      throw err;
    }
  }
}

/** Payload returned in `data` after a successful unlock (or idempotent replay). */
async function buildUnlockData(action, targetId) {
  if (action === "view_contact") {
    const order = await Order.findById(targetId)
      .populate("user", "email phone")
      .populate("orderingMaster", "email phone")
      .lean();
    if (!order) {
      return { email: "", phone: "" };
    }
    if (order.user && order.user._id) {
      return {
        email: String(order.user.email || ""),
        phone: String(order.user.phone || ""),
      };
    }
    if (order.orderingMaster && order.orderingMaster._id) {
      return {
        email: String(order.orderingMaster.email || ""),
        phone: String(order.orderingMaster.phone || ""),
      };
    }
    return { email: "", phone: "" };
  }
  if (action === "feature_gallery") {
    const q = mongoose.Types.ObjectId.isValid(targetId)
      ? { _id: targetId }
      : { slug: targetId };
    const m = await Master.findOne(q).select("portfolioImages").lean();
    return { images: m?.portfolioImages || [] };
  }
  return {};
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

// @desc    List target ids already unlocked for an action (e.g. order ids for view_contact)
// @route   GET /api/credits/unlocks
// @access  Private (master)
// Query:  action (required) — must be a configured spend action
const getUnlocks = asyncHandler(async (req, res) => {
  const actionParam = req.query.action;
  const action =
    actionParam != null && typeof actionParam === "string"
      ? actionParam.trim()
      : "";
  if (!action) {
    const err = new Error("action query parameter is required");
    err.statusCode = 400;
    throw err;
  }
  if (!SPEND_ACTIONS.includes(action)) {
    const err = new Error(
      `Invalid action. Allowed: ${SPEND_ACTIONS.join(", ")}`,
    );
    err.statusCode = 400;
    throw err;
  }

  const rows = await CreditUnlock.find({
    master: req.user._id,
    action,
  })
    .select("targetId -_id")
    .lean();

  const unlocks = rows.map((r) => String(r.targetId));
  res.json({ unlocks });
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

  await assertSpendTargetOk(action, targetId);

  const masterId = req.user._id;
  /** @type {{ remaining: number } | null} */
  let result = null;
  /** @type {{ message: string; required: number; balance: number } | null} */
  let insufficientPayload = null;

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
      result = { remaining: normalizeBalance(m?.credits) };
    } else {
      const master = await Master.findById(masterId).session(session);
      if (!master) {
        const err = new Error("Master not found");
        err.statusCode = 404;
        throw err;
      }

      const balanceBefore = normalizeBalance(master.credits);
      if (balanceBefore < cost) {
        await session.abortTransaction();
        insufficientPayload = {
          message: "Insufficient credits",
          required: cost,
          balance: balanceBefore,
        };
      } else {
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
              metadata:
                action === "view_contact"
                  ? { orderId: targetId }
                  : { note: targetId },
            },
          ],
          { session },
        );

        await CreditUnlock.create(
          [{ master: masterId, action, targetId }],
          { session },
        );

        await session.commitTransaction();
        result = { remaining: normalizeBalance(master.credits) };
      }
    }
  } catch (err) {
    try {
      await session.abortTransaction();
    } catch {
      /* already committed or aborted */
    }
    if (err && err.code === 11000) {
      const m = await Master.findById(masterId).select("credits").lean();
      result = { remaining: normalizeBalance(m?.credits) };
    } else {
      throw err;
    }
  } finally {
    session.endSession();
  }

  if (insufficientPayload) {
    return res.status(402).json(insufficientPayload);
  }

  if (!result) {
    const err = new Error("Spend failed");
    err.statusCode = 500;
    throw err;
  }

  const data = await buildUnlockData(action, targetId);
  return res.json({
    success: true,
    remaining: result.remaining,
    data,
  });
});

module.exports = {
  getBalance,
  getHistory,
  getUnlocks,
  spendCredits,
};
