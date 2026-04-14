const mongoose = require("mongoose");
const slugify = require("../utils/slugify");

const workSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  image: String,
});

const masterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 6, select: false },
    phone: String,
    isBlocked: { type: Boolean, default: false },
    lastActiveAt: { type: Date, default: null },
    credits: { type: Number, default: 0, min: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    specialty: String,
    location: String,
    bio: String,
    instagram: String,
    website: String,
    image: String,
    portfolioImages: {
      type: [String],
      default: [],
    },
    slug: { type: String, unique: true },
    works: [workSchema],
    /** Orders (from users) this master bookmarked — omitted from default queries */
    favoriteOrders: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
      default: [],
      select: false,
    },
  },
  { timestamps: true, collection: "masters" }
);

masterSchema.pre("save", async function () {
  if (this.isModified("name") && !this.slug) {
    this.slug = slugify(this.name);
  }
});

module.exports = mongoose.model("Master", masterSchema);
