const mongoose = require("mongoose");
const Master = require("../models/Master");
const Order = require("../models/Order");
const CreditPack = require("../models/CreditPack");
const PendingPurchase = require("../models/PendingPurchase");
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

function requiredEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    const err = new Error(`Missing required env var: ${name}`);
    err.statusCode = 500;
    throw err;
  }
  return String(v).trim();
}

async function createBogIpayCheckoutSession({ amountGel, orderId, callbackUrl, returnUrl }) {
  const url = process.env.PAYMENT_BOG_IPAY_URL || "https://api.bog.ge/payments/v1/ecommerce/orders";
  const token = requiredEnv("PAYMENT_BOG_IPAY_TOKEN");

  const payload = {
    amount: amountGel,
    currency: "GEL",
    external_order_id: String(orderId),
    callback_url: callbackUrl,
    redirect_urls: {
      success: returnUrl,
      fail: returnUrl,
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const rawText = await resp.text();
  let body = null;
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    body = { raw: rawText };
  }

  if (!resp.ok) {
    const err = new Error(`Payment provider create session failed (${resp.status})`);
    err.statusCode = 502;
    err.details = body;
    throw err;
  }

  return body || {};
}

function firstHttpUrl(...candidates) {
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const t = c.trim();
    if (t.startsWith("http://") || t.startsWith("https://")) return t;
  }
  return null;
}

/** BOG iPay / ecommerce order responses vary; collect known checkout URL fields. */
function extractBogPaymentUrl(provider) {
  if (!provider || typeof provider !== "object") return null;
  const links = provider.links;
  return firstHttpUrl(
    links?.payment,
    links?.checkout,
    provider.checkout_url,
    provider.redirect_url,
    provider.payment_url,
    provider.paymentUrl,
    provider.payment?.redirect_url,
    provider.payment?.url,
    provider.payment?.checkout_url,
    provider.data?.checkout_url,
    provider.data?.redirect_url,
  );
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

// @desc    List active credit packs
// @route   GET /api/credits/packs
// @access  Public
const getPacks = asyncHandler(async (req, res) => {
  const rows = await CreditPack.find({ active: true })
    .select("_id name credits bonusCredits priceGel")
    .sort({ priceGel: 1 })
    .lean();
  res.json({ packs: rows });
});

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

// @desc    Start credit-pack purchase (BOG iPay checkout session)
// @route   POST /api/credits/purchase
// @access  Private (master)
// Body: { packId: "pro" }
const createPurchase = asyncHandler(async (req, res) => {
  const packIdRaw = req.body?.packId;
  const packId =
    packIdRaw != null && typeof packIdRaw === "string" ? packIdRaw.trim() : "";
  if (!packId) {
    const err = new Error("packId is required");
    err.statusCode = 400;
    throw err;
  }

  const pack = await CreditPack.findById(packId).lean();
  if (!pack || !pack.active) {
    const err = new Error("Credit pack not found or inactive");
    err.statusCode = 404;
    throw err;
  }

  const callbackUrl = requiredEnv("PAYMENT_CALLBACK_URL");
  const returnUrl = requiredEnv("PAYMENT_RETURN_URL");
  const credits = Number(pack.credits || 0) + Number(pack.bonusCredits || 0);

  const pending = await PendingPurchase.create({
    master: req.user._id,
    packId: pack._id,
    amountGel: Number(pack.priceGel || 0),
    credits,
    status: "pending",
  });

  try {
    const provider = await createBogIpayCheckoutSession({
      amountGel: pending.amountGel,
      orderId: pending._id,
      callbackUrl,
      returnUrl,
    });

    const providerTxId =
      provider?.id ||
      provider?.order_id ||
      provider?.payment_id ||
      provider?.data?.id ||
      null;

    if (providerTxId) {
      pending.providerTxId = String(providerTxId);
      await pending.save();
    }

    const paymentUrl = extractBogPaymentUrl(provider);
    if (!paymentUrl) {
      const err = new Error("Payment provider did not return a checkout URL");
      err.statusCode = 502;
      err.details = provider;
      throw err;
    }

    return res.status(201).json({ paymentUrl });
  } catch (err) {
    pending.status = "failed";
    pending.completedAt = new Date();
    await pending.save();
    throw err;
  }
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
  getPacks,
  getBalance,
  getHistory,
  getUnlocks,
  createPurchase,
  spendCredits,
};
