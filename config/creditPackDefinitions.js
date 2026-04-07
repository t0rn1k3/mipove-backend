

const CREDIT_PACK_IDS = ["starter", "pro", "business"];

const DEFAULT_CREDIT_PACKS = [
  {
    _id: "starter",
    name: "Starter",
    credits: 30,
    bonusCredits: 0,
    priceGel: 15,
    active: true,
  },
  {
    _id: "pro",
    name: "Pro",
    credits: 75,
    bonusCredits: 15,
    priceGel: 30,
    active: true,
  },
  {
    _id: "business",
    name: "Business",
    credits: 200,
    bonusCredits: 50,
    priceGel: 70,
    active: true,
  },
];

module.exports = {
  CREDIT_PACK_IDS,
  DEFAULT_CREDIT_PACKS,
};
