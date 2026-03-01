const mongoose = require("mongoose");
const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");

const MONGO_URL =
  process.env.MONGODB_URI || process.env.MONGO_URL || "mongodb://localhost:27017/mipove";

const connectDB = async () => {
  try {
    const options = {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    };
    const conn = await mongoose.connect(MONGO_URL, options);
    console.log("DB Connected Successfully");
    return conn;
  } catch (err) {
    console.error("DB Connection Failed:", err.message);
    if (err.message.includes("timed out")) {
      console.error("\n⚠️ Connection Timeout! Check network or firewall.");
    } else if (err.message.includes("whitelist") || err.message.includes("IP")) {
      console.error("\n⚠️ IP Whitelist Issue! Add your IP in MongoDB Atlas.");
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
