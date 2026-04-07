const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const Master = require("../models/Master");
const PendingPurchase = require("../models/PendingPurchase");
const CreditTransaction = require("../models/CreditTransaction");
const {
  verifyPaymentWebhookRequest,
  parseBogPaymentCallbackPayload,
} = require("../utils/paymentWebhookVerify");

function normalizeBalance(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return 0;
}

// @desc    BOG Payments (or HMAC) webhook — no auth
// @route   POST /api/webhooks/payment
// @access  Public (provider only)
const handlePaymentWebhook = asyncHandler(async (req, res) => {
  const raw = req.body;
  if (!Buffer.isBuffer(raw)) {
    const err = new Error("Invalid request body");
    err.statusCode = 400;
    throw err;
  }

  if (!verifyPaymentWebhookRequest(req, raw)) {
    return res.sendStatus(401);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    const err = new Error("Invalid JSON");
    err.statusCode = 400;
    throw err;
  }

  const payload = parseBogPaymentCallbackPayload(parsed);
  if (!payload) {
    const err = new Error("Invalid callback payload");
    err.statusCode = 400;
    throw err;
  }

  const { externalOrderId, orderStatusKey, providerTxnId } = payload;

  if (!mongoose.Types.ObjectId.isValid(externalOrderId)) {
    return res.sendStatus(200);
  }

  if (orderStatusKey === "rejected") {
    await applyFailedIfPending(externalOrderId, providerTxnId);
    return res.sendStatus(200);
  }

  if (orderStatusKey === "completed") {
    await applyCompletedIfPending(externalOrderId, providerTxnId);
    return res.sendStatus(200);
  }

  return res.sendStatus(200);
});

async function applyFailedIfPending(orderIdStr, providerTxnId) {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const purchase = await PendingPurchase.findOne({
      _id: orderIdStr,
      status: "pending",
    }).session(session);
    if (!purchase) {
      await session.commitTransaction();
      return;
    }
    purchase.status = "failed";
    purchase.completedAt = new Date();
    purchase.expireAt = null;
    if (providerTxnId) {
      purchase.providerTxId = String(providerTxnId);
    }
    await purchase.save({ session });
    await session.commitTransaction();
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
}

async function applyCompletedIfPending(orderIdStr, providerTxnId) {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const purchase = await PendingPurchase.findOne({
      _id: orderIdStr,
      status: "pending",
    }).session(session);
    if (!purchase) {
      await session.commitTransaction();
      return;
    }

    const master = await Master.findById(purchase.master).session(session);
    if (!master) {
      purchase.status = "failed";
      purchase.completedAt = new Date();
      purchase.expireAt = null;
      if (providerTxnId) {
        purchase.providerTxId = String(providerTxnId);
      }
      await purchase.save({ session });
      await session.commitTransaction();
      return;
    }

    const balanceBefore = normalizeBalance(master.credits);
    const creditAmount = Number(purchase.credits || 0);
    master.credits = balanceBefore + creditAmount;
    await master.save({ session });

    await CreditTransaction.create(
      [
        {
          master: purchase.master,
          type: "purchase",
          amount: creditAmount,
          balanceBefore,
          balanceAfter: master.credits,
          metadata: {
            orderId: String(purchase._id),
            packId: purchase.packId,
            ...(providerTxnId ? { paymentId: String(providerTxnId) } : {}),
          },
        },
      ],
      { session },
    );

    purchase.status = "completed";
    purchase.completedAt = new Date();
    purchase.expireAt = null;
    if (providerTxnId) {
      purchase.providerTxId = String(providerTxnId);
    }
    await purchase.save({ session });
    await session.commitTransaction();
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
}

module.exports = {
  handlePaymentWebhook,
};
