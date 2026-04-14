const CreditUnlock = require("../models/CreditUnlock");

/** Must match `action` used in POST /api/credits/spend for contact unlocks. */
const CONTACT_UNLOCK_ACTION = "view_contact";

function masterIsOrderPublisher(viewerMasterId, order) {
  if (!viewerMasterId || !order) return false;
  return (
    order.orderingMaster &&
    order.orderingMaster._id &&
    String(order.orderingMaster._id) === String(viewerMasterId)
  );
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

/** Anonymous / non-master viewers: redact publisher profiles and contact snapshots on list cards. */
function applyGuestOrderListGate(order) {
  const out = applyMasterContactGate(order, null, new Set());
  out.customerNameSnapshot = "";
  out.customerPhoneSnapshot = "";
  return out;
}

module.exports = {
  CONTACT_UNLOCK_ACTION,
  masterIsOrderPublisher,
  loadContactUnlockedSet,
  applyMasterContactGate,
  applyMasterContactGateToOrders,
  applyGuestOrderListGate,
};
