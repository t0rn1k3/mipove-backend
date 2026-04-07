const mongoose = require("mongoose");

const creditUnlockSchema = new mongoose.Schema(
  {
    master: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Master",
      required: true,
    },
    /**view_contact... */
    action: {
      type: String,
      required: true,
      trim: true,
    },
    /** orderId — idempotency key together with master + action */
    targetId: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "credit_unlocks",
  },
);

creditUnlockSchema.index({ master: 1, action: 1, targetId: 1 }, { unique: true });

module.exports = mongoose.model("CreditUnlock", creditUnlockSchema);
