const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
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
    if (process.env.NODE_ENV === "production") {
      console.log(
        "Upload tip: if portfolio/profile uploads fail in the browser with 'Failed to fetch' but work for small files, " +
          "increase the reverse proxy body limit (e.g. nginx client_max_body_size to 25m) — not Express.",
      );
    }
  });
};

startServer();
