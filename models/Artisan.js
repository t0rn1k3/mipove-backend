const mongoose = require("mongoose");

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

export default mongoose.model("Artisan", artisanSchema);
