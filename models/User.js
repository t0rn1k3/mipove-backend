const mongoose = require("mongoose");

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
    /** Orders placed by this customer (denormalized; same as Order.user) */
    orders: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
