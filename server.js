require("dotenv").config();
const app = require("./app");
const connectDB = require("./src/config/db");
const { migrateLegacyUserOrderRefs } = require("./utils/migrateUserOrderRefs");
const { backfillMasterRatings } = require("./utils/migrateMasterRatings");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  await migrateLegacyUserOrderRefs();
  await backfillMasterRatings();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
