const mongoose = require("mongoose");

const ORDER_STATUSES = ["pending", "accepted", "in_progress", "completed", "cancelled"];

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
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

const Order = mongoose.model("Order", orderSchema);
Order.ORDER_STATUSES = ORDER_STATUSES;
module.exports = Order;
