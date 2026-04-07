/** Credit cost per spend action — extend here as new gated features ship. */

function parseNonNegativeInt(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

const CREDIT_SPEND_COSTS = {
  view_contact: parseNonNegativeInt(process.env.CREDIT_COST_VIEW_CONTACT, 1),
  feature_gallery: parseNonNegativeInt(process.env.CREDIT_COST_FEATURE_GALLERY, 5),
};

const SPEND_ACTIONS = Object.freeze(Object.keys(CREDIT_SPEND_COSTS));

function getSpendCost(action) {
  if (typeof action !== "string") return undefined;
  const key = action.trim();
  const cost = CREDIT_SPEND_COSTS[key];
  return typeof cost === "number" ? cost : undefined;
}

function isValidSpendAction(action) {
  return getSpendCost(action) !== undefined;
}

module.exports = {
  CREDIT_SPEND_COSTS,
  SPEND_ACTIONS,
  getSpendCost,
  isValidSpendAction,
};
