const CreditUnlock = require("../models/CreditUnlock");

/** Must match `action` used in POST /api/credits/spend for contact unlocks. */
const CONTACT_UNLOCK_ACTION = "view_contact";

/** Ref id whether populate ran or field is still an ObjectId. */
function publisherOrderingMasterId(order) {
  if (!order || order.orderingMaster == null) return null;
  const m = order.orderingMaster;
  if (typeof m === "object" && m !== null && m._id != null) return String(m._id);
  return String(m);
}

function publisherUserId(order) {
  if (!order || order.user == null) return null;
  const u = order.user;
  if (typeof u === "object" && u !== null && u._id != null) return String(u._id);
  return String(u);
}

function masterIsOrderPublisher(viewerMasterId, order) {
  if (!viewerMasterId || !order) return false;
  const pid = publisherOrderingMasterId(order);
  return pid != null && pid === String(viewerMasterId);
}

async function loadContactUnlockedSet(viewerMasterId, orderIdStrings) {
  const unique = [...new Set((orderIdStrings || []).map(String))];
  if (!unique.length) return new Set();
  const rows = await CreditUnlock.find({
    master: viewerMasterId,
    action: CONTACT_UNLOCK_ACTION,
    targetId: { $in: unique },
  })
    .select("targetId")
    .lean();
  return new Set(rows.map((r) => String(r.targetId)));
}

function redactPublisherProfile(person) {
  if (!person || !person._id) return person;
  return {
    _id: person._id,
    image: person.image || "",
  };
}

function applyMasterContactGate(order, viewerMasterId, unlockedSet) {
  const out = { ...order };
  const idStr = String(order._id);
  const contactUnlocked =
    masterIsOrderPublisher(viewerMasterId, order) || unlockedSet.has(idStr);
  out.contactUnlocked = contactUnlocked;

  if (contactUnlocked) {
    return out;
  }

  if (out.user && out.user._id) {
    out.user = redactPublisherProfile(out.user);
  }
  if (out.orderingMaster && out.orderingMaster._id) {
    out.orderingMaster = redactPublisherProfile(out.orderingMaster);
  }
  return out;
}

async function applyMasterContactGateToOrders(orders, viewerMasterId) {
  const ids = orders.map((o) => String(o._id));
  const unlockedSet = await loadContactUnlockedSet(viewerMasterId, ids);
  return orders.map((o) => applyMasterContactGate(o, viewerMasterId, unlockedSet));
}

function orderPublisherMatchesViewer(order, viewer) {
  if (!viewer || !viewer._id) return false;
  const id = String(viewer._id);
  if (viewer.role === "master") {
    const pid = publisherOrderingMasterId(order);
    return pid != null && pid === id;
  }
  if (viewer.role === "user") {
    const pid = publisherUserId(order);
    return pid != null && pid === id;
  }
  return false;
}

/**
 * Redact publisher profiles and contact snapshots for public list cards.
 * If `viewer` is the order publisher, return the row unchanged so their reload shows contact.
 */
function applyGuestOrderListGate(order, viewer) {
  if (orderPublisherMatchesViewer(order, viewer)) {
    return { ...order, contactUnlocked: true };
  }
  const out = applyMasterContactGate(order, null, new Set());
  out.customerNameSnapshot = "";
  out.customerPhoneSnapshot = "";
  return out;
}

module.exports = {
  CONTACT_UNLOCK_ACTION,
  masterIsOrderPublisher,
  publisherUserId,
  publisherOrderingMasterId,
  orderPublisherMatchesViewer,
  loadContactUnlockedSet,
  applyMasterContactGate,
  applyMasterContactGateToOrders,
  applyGuestOrderListGate,
};
