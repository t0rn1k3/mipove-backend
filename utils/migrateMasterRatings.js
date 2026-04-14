const Rating = require("../models/Rating");
const Master = require("../models/Master");

/**
 * Backfill rating + reviewCount on every master document from the ratings collection.
 * Idempotent — safe to run on every startup (only writes when values differ).
 */
async function backfillMasterRatings() {
  const stats = await Rating.aggregate([
    {
      $group: {
        _id: "$master",
        average: { $avg: "$stars" },
        count: { $sum: 1 },
      },
    },
  ]);

  let updated = 0;
  for (const s of stats) {
    const avg = Math.round(s.average * 10) / 10;
    const cnt = s.count;
    const res = await Master.updateOne(
      {
        _id: s._id,
        $or: [
          { rating: { $ne: avg } },
          { reviewCount: { $ne: cnt } },
        ],
      },
      { $set: { rating: avg, reviewCount: cnt } },
    );
    if (res.modifiedCount) updated++;
  }

  if (updated) {
    console.log(
      `Master ratings: backfilled ${updated} master(s) from ratings collection`,
    );
  }
  return updated;
}

module.exports = { backfillMasterRatings };
