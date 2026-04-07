
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const CreditPack = require("../models/CreditPack");
const { DEFAULT_CREDIT_PACKS } = require("../config/creditPackDefinitions");

async function main() {
  await connectDB();

  for (const pack of DEFAULT_CREDIT_PACKS) {
    const { _id, ...fields } = pack;
    await CreditPack.findOneAndUpdate(
      { _id },
      { $set: fields },
      { upsert: true, returnDocument: "after" },
    );
  }

  console.log(`Seeded ${DEFAULT_CREDIT_PACKS.length} credit pack(s).`);
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
