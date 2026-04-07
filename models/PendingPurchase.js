const mongoose = require("mongoose");
const { CREDIT_PACK_IDS } = require("../config/creditPackDefinitions");

/** Lifecycle for a credit-pack checkout (e.g. BOG iPay → callback). */
const PENDING_PURCHASE_STATUSES = [
  "pending",
  "completed",
  "failed",
  "expired",
];

const pendingPurchaseSchema = new mongoose.Schema(
  {
    master: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Master",
      required: true,
      index: true,
    },
    packId: {
      type: String,
      required: true,
      enum: CREDIT_PACK_IDS,
      trim: true,
    },
    amountGel: { type: Number, required: true, min: 0 },
    /** Total credits to grant: pack.credits + pack.bonusCredits */
    credits: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      required: true,
      enum: PENDING_PURCHASE_STATUSES,
      default: "pending",
    },
    /** BOG iPay */
    providerTxId: {
      type: String,
      trim: true,
      default: null,
    },
    completedAt: { type: Date, default: null },
    /** Set on creation; cleared when status moves to completed/failed. Mongo TTL removes stale pending rows. */
    expireAt: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "pending_purchases",
  },
);

pendingPurchaseSchema.index({ master: 1, createdAt: -1 });
pendingPurchaseSchema.index(
  { providerTxId: 1 },
  { unique: true, sparse: true },
);
/**
 * Auto-expire documents still in "pending" after 30 min.
 * Mongo TTL worker runs ~every 60 s, so actual removal may lag slightly.
 * Only documents where `expireAt` is set (status === "pending" at creation) are affected;
 * the webhook handler clears `expireAt` when moving to "completed" / "failed".
 */
pendingPurchaseSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const PendingPurchase = mongoose.model("PendingPurchase", pendingPurchaseSchema);
PendingPurchase.STATUSES = PENDING_PURCHASE_STATUSES;
module.exports = PendingPurchase;
