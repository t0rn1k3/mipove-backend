/** Credit cost per spend action — extend here as new gated features ship. */

const CREDIT_SPEND_COSTS = {
  view_contact: 1,
  feature_gallery: 5,
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
