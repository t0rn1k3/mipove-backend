const mongoose = require("mongoose");

const userOrderRefSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    title: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, trim: true },
    /** City / free-text location for client profile (same idea as Master.location) */
    location: { type: String, trim: true, default: "" },
    password: { type: String, required: true, minlength: 6, select: false },
    role: {
      type: String,
      enum: ["user"],
      required: true,
      default: "user",
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    lastActiveAt: {
      type: Date,
      default: null,
    },
    image: {
      type: String,
      default: "",
      trim: true,
    },
    /** Orders placed by this customer (denormalized id + title; source of truth is Order collection) */
    orders: {
      type: [userOrderRefSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
