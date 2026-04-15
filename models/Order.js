const mongoose = require("mongoose");
const { ORDER_CATEGORY_ID_SET } = require("../config/orderCategories");

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
    /** Scheduled work date/time from the client (ISO date or datetime). */
    scheduledAt: { type: Date, default: null },
    price: { type: Number, min: 0, default: null },
    attachments: {
      type: [String],
      default: [],
    },
    /** Smart-filter categories (see GET /api/orders/categories) */
    categories: {
      type: [String],
      default: [],
      index: true,
      validate: {
        validator(v) {
          if (!Array.isArray(v)) return false;
          return v.every((id) => ORDER_CATEGORY_ID_SET.has(id));
        },
        message: "Invalid order category list",
      },
    },
    /** Free/structured location from order submission form */
    location: {
      city: { type: String, trim: true, default: "" },
      addressText: { type: String, trim: true, default: "" },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    /**
     * If true, the client may show a "Negotiable" label instead of the numeric range.
     * Budget min/max remain stored as sent (filters / analytics); the API does not clear them.
     */
    priceNegotiable: { type: Boolean, default: false },
    /** Budget range from order submission form */
    budget: {
      min: { type: Number, min: 0, default: null },
      max: { type: Number, min: 0, default: null },
      currency: { type: String, trim: true, default: "GEL" },
    },
    /** Customer contact snapshot at submission time */
    customerNameSnapshot: { type: String, trim: true, default: "" },
    customerPhoneSnapshot: { type: String, trim: true, default: "" },
  },
  { timestamps: true, collection: "orders" }
);

orderSchema.pre("validate", function () {
  const hasUser = !!this.user;
  const hasOrderingMaster = !!this.orderingMaster;
  if (hasUser === hasOrderingMaster) {
    throw new Error("Order must be placed by exactly one of: user or orderingMaster");
  }
  if (
    this.budget &&
    this.budget.min != null &&
    this.budget.max != null &&
    this.budget.max < this.budget.min
  ) {
    throw new Error("budget.max must be greater than or equal to budget.min");
  }
});

const Order = mongoose.model("Order", orderSchema);
Order.ORDER_STATUSES = ORDER_STATUSES;
module.exports = Order;
