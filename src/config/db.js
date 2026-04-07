const mongoose = require("mongoose");
const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");

const MONGO_URL =
  process.env.MONGODB_URI || process.env.MONGO_URL || "mongodb://localhost:27017/mipove";
const DEFAULT_DB_NAME = process.env.MONGO_DB_NAME || "mipove";

function getDbNameFromUri(uri) {
  if (typeof uri !== "string" || !uri) return "";
  try {
    const parsed = new URL(uri);
    const dbName = parsed.pathname.replace(/^\//, "").trim();
    return dbName;
  } catch {
    return "";
  }
}

const connectDB = async () => {
  try {
    // On some Windows networks, Node's DNS (c-ares) may fail SRV lookups even when
    // system tools succeed. If you're using mongodb+srv, allow forcing known-good DNS.
    if (typeof MONGO_URL === "string" && MONGO_URL.startsWith("mongodb+srv://")) {
      const forced = (process.env.DNS_SERVERS || "1.1.1.1,1.0.0.1")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (forced.length) dns.setServers(forced);
    }

    const options = {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    };
    // If URI doesn't include a DB name (Atlas defaults to "test"), pin to mipove.
    if (!getDbNameFromUri(MONGO_URL)) {
      options.dbName = DEFAULT_DB_NAME;
    }
    const conn = await mongoose.connect(MONGO_URL, options);
    console.log("DB Connected Successfully");
    return conn;
  } catch (err) {
    console.error("DB Connection Failed:", err.message);
    if (err.cause) console.error("Underlying error:", err.cause.message || err.cause);
    if (err.message.includes("timed out") || (err.cause && err.cause.code === "ETIMEDOUT")) {
      console.error("\n⚠️ Connection Timeout! Check network, firewall, or antivirus.");
    } else if (err.message.includes("whitelist") || err.message.includes("IP")) {
      console.error("\n⚠️ If IP is whitelisted: try Standard (non-SRV) connection string in Atlas.");
    }
    process.exit(1);
  }
};

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected");
});

mongoose.connection.on("reconnected", () => {
  console.log("MongoDB reconnected");
});

module.exports = connectDB;
