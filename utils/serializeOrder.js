/**
 * Ensure `priceNegotiable` is always true|false in JSON (legacy docs may omit the field).
 */
function serializeOrderForApi(order) {
  if (!order || typeof order !== "object") return order;
  return { ...order, priceNegotiable: order.priceNegotiable === true };
}

function serializeOrdersForApi(orders) {
  if (!Array.isArray(orders)) return orders;
  return orders.map(serializeOrderForApi);
}

module.exports = { serializeOrderForApi, serializeOrdersForApi };
