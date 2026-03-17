const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
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
    isBlocked: { type: Boolean, default: false },
    lastActiveAt: { type: Date, default: null },
    image: { type: String, default: "", trim: true },
  },
  { timestamps: true, collection: "admins" }
);

module.exports = mongoose.model("Admin", adminSchema);
