const mongoose = require("mongoose");
const slugify = require("../utils/slugify");

const workSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  image: String,
});
const artisanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    specialty: String,
    location: String,
    bio: String,
    phone: String,
    email: String,
    instagram: String,
    website: String,
    image: String,
    slug: { type: String, unique: true },
    works: [workSchema],
  },
  { timestamps: true },
);

artisanSchema.pre("save", function (next) {
  if (this.isModified("name") && !this.slug) {
    this.slug = slugify(this.name);
  }
  next();
});

module.exports = mongoose.model("Artisan", artisanSchema);
