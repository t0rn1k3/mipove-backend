/**
 * Migrate existing "artisans" collection to "masters" collection.
 * Run once if you have existing artisan data: node scripts/migrate-artisans-to-masters.js
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

  const artisans = db.collection("artisans");
  const masters = db.collection("masters");

  const count = await artisans.countDocuments();
  if (count === 0) {
    console.log("No artisans to migrate.");
    process.exit(0);
  }

  const docs = await artisans.find({}).toArray();
  for (const doc of docs) {
    await masters.insertOne(doc);
  }
  console.log(`Migrated ${docs.length} artisans to masters.`);
  console.log("You may now drop the artisans collection if desired.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
