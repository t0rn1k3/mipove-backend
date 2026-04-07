const mongoose = require("mongoose");
const { CREDIT_PACK_IDS } = require("../config/creditPackDefinitions");

const creditPackSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
      enum: CREDIT_PACK_IDS,
    },
    name: { type: String, required: true, trim: true },
    credits: { type: Number, required: true, min: 0 },
    bonusCredits: { type: Number, required: true, min: 0 },
    priceGel: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: true },
  },
  { collection: "credit_packs" },
);

module.exports = mongoose.model("CreditPack", creditPackSchema);
