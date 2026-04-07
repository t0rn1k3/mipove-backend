const mongoose = require("mongoose");

const ORDER_STATUSES = ["pending", "accepted", "in_progress", "completed", "cancelled"];

const orderSchema = new mongoose.Schema(
  {
    /** Client user (regular customer) — mutually exclusive with orderingMaster */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    /** Master requesting service from another professional — mutually exclusive with user */
    orderingMaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Master",
      default: null,
      index: true,
    },
    /** Assigned / target professional (optional) */
    master: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Master",
      default: null,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "pending",
    },
    scheduledAt: { type: Date, default: null },
    price: { type: Number, min: 0, default: null },
    attachments: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true, collection: "orders" }
);

orderSchema.pre("validate", function (next) {
  const hasUser = !!this.user;
  const hasOrderingMaster = !!this.orderingMaster;
  if (hasUser === hasOrderingMaster) {
    return next(
      new Error("Order must be placed by exactly one of: user or orderingMaster"),
    );
  }
  next();
});

const Order = mongoose.model("Order", orderSchema);
Order.ORDER_STATUSES = ORDER_STATUSES;
module.exports = Order;
