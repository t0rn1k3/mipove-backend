const mongoose = require("mongoose");

const CREDIT_TRANSACTION_TYPES = [
  "grant",
  "purchase",
  "spend",
  "refund",
  "admin_adjust",
];

const metadataSchema = new mongoose.Schema(
  {
    orderId: { type: String, trim: true },
    packId: { type: String, trim: true },
    paymentId: { type: String, trim: true },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const creditTransactionSchema = new mongoose.Schema(
  {
    master: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Master",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: CREDIT_TRANSACTION_TYPES,
    },
    /** Positive = credits added, negative = spent */
    amount: {
      type: Number,
      required: true,
    },
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    action: {
      type: String,
      trim: true,
    },
    metadata: {
      type: metadataSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "credit_transactions",
  },
);

creditTransactionSchema.index({ master: 1, createdAt: -1 });

const CreditTransaction = mongoose.model("CreditTransaction", creditTransactionSchema);
CreditTransaction.TYPES = CREDIT_TRANSACTION_TYPES;
module.exports = CreditTransaction;
