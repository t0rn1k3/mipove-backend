/**
 * Migrate Rating documents to current schema (raterId, raterType, master).
 * Run once if you have existing ratings: node scripts/migrate-ratings.js
 *
 * Handles: user->raterId/raterType, artisan->master, Artisan->Master raterType
 */
require("dotenv").config();
const mongoose = require("mongoose");

const mongoUri =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  "mongodb://localhost:27017/mipove";

async function migrate() {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const ratings = db.collection("ratings");

  let total = 0;

  // Old schema: user + artisan
  const withUser = await ratings.find({ user: { $exists: true } }).toArray();
  for (const r of withUser) {
    await ratings.updateOne(
      { _id: r._id },
      {
        $set: { raterId: r.user, raterType: "User", master: r.artisan || r.master },
        $unset: { user: "", artisan: "" },
      }
    );
    total++;
  }

  // Rename artisan -> master, Artisan -> Master raterType
  const withArtisan = await ratings.find({ artisan: { $exists: true } }).toArray();
  for (const r of withArtisan) {
    const update = { $set: { master: r.artisan } };
    if (r.raterType === "Artisan") update.$set.raterType = "Master";
    await ratings.updateOne(
      { _id: r._id },
      { ...update, $unset: { artisan: "" } }
    );
  }
  total += withArtisan.length;
  console.log(`Migrated ${total} ratings.`);
  process.exit(0);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
