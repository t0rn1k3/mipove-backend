const mongoose = require("mongoose");

function isNewShapeEl(el) {
  return el && typeof el === "object" && el.orderId != null;
}

/**
 * Convert User.orders from legacy ObjectId[] to [{ orderId, title }].
 * Drops refs to deleted orders (no Order document).
 */
async function migrateLegacyUserOrderRefs() {
  const User = require("../models/User");
  const Order = require("../models/Order");

  const users = await User.find({
    orders: { $exists: true, $not: { $size: 0 } },
  })
    .select("_id orders")
    .lean();

  let fixed = 0;
  for (const u of users) {
    const raw = u.orders || [];
    if (!raw.length || !raw.some((el) => !isNewShapeEl(el))) continue;

    const newOrders = [];
    const seen = new Set();

    for (const el of raw) {
      if (isNewShapeEl(el)) {
        const oid =
          el.orderId instanceof mongoose.Types.ObjectId
            ? el.orderId
            : new mongoose.Types.ObjectId(el.orderId);
        const s = String(oid);
        if (seen.has(s)) continue;
        const exists = await Order.exists({ _id: oid });
        if (!exists) continue;
        seen.add(s);
        newOrders.push({
          orderId: oid,
          title: el.title != null ? String(el.title) : "",
        });
      } else if (mongoose.Types.ObjectId.isValid(el)) {
        const oid =
          el instanceof mongoose.Types.ObjectId
            ? el
            : new mongoose.Types.ObjectId(el);
        const s = String(oid);
        if (seen.has(s)) continue;
        const o = await Order.findById(oid).select("title").lean();
        if (!o) continue;
        seen.add(s);
        newOrders.push({
          orderId: oid,
          title: o.title != null ? String(o.title) : "",
        });
      }
    }

    await User.updateOne({ _id: u._id }, { $set: { orders: newOrders } });
    fixed++;
  }

  if (fixed) {
    console.log(
      `User.orders: migrated ${fixed} document(s) from ObjectId[] to { orderId, title }[]`,
    );
  }
  return fixed;
}

/**
 * Remove User.orders entries whose order no longer exists (e.g. stale after a bad delete).
 */
async function pruneOrphanUserOrderRefs() {
  const User = require("../models/User");
  const Order = require("../models/Order");

  const users = await User.find({ "orders.orderId": { $exists: true } })
    .select("_id orders")
    .lean();

  let pruned = 0;
  for (const u of users) {
    const raw = u.orders || [];
    const kept = [];
    for (const el of raw) {
      if (!el?.orderId) continue;
      const oid =
        el.orderId instanceof mongoose.Types.ObjectId
          ? el.orderId
          : new mongoose.Types.ObjectId(el.orderId);
      if (await Order.exists({ _id: oid })) {
        kept.push({
          orderId: oid,
          title: el.title != null ? String(el.title) : "",
        });
      }
    }
    if (kept.length !== raw.length) {
      await User.updateOne({ _id: u._id }, { $set: { orders: kept } });
      pruned++;
    }
  }

  if (pruned) {
    console.log(`User.orders: pruned orphan entries for ${pruned} user(s)`);
  }
  return pruned;
}

module.exports = {
  migrateLegacyUserOrderRefs,
  pruneOrphanUserOrderRefs,
};
