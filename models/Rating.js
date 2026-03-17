const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema(
  {
    raterId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "raterType",
    },
    raterType: {
      type: String,
      required: true,
      enum: ["User", "Master"],
    },
    master: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Master",
      required: true,
    },
    stars: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
  },
  { timestamps: true }
);

ratingSchema.index({ raterId: 1, master: 1 }, { unique: true });

module.exports = mongoose.model("Rating", ratingSchema);
