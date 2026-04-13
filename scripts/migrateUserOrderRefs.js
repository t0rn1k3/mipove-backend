require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const {
  migrateLegacyUserOrderRefs,
  pruneOrphanUserOrderRefs,
} = require("../utils/migrateUserOrderRefs");

async function main() {
  const prune = process.argv.includes("--prune");
  await connectDB();
  await migrateLegacyUserOrderRefs();
  if (prune) {
    await pruneOrphanUserOrderRefs();
  }
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
