/**
 * Create the first admin user.
 * Run: node scripts/create-admin.js
 *
 * Requires ADMIN_SECRET in .env (or pass via ADMIN_SECRET env var).
 * Prompts for name, email, password via env vars or edit this script.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const readline = require("readline");
const Admin = require("../models/Admin");
const { hashPassword } = require("../utils/helpers");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function createAdmin() {
  const mongoUri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    "mongodb://localhost:27017/mipove";
  const defaultDbName = process.env.MONGO_DB_NAME || "mipove";
  let dbName = "";
  try {
    dbName = new URL(mongoUri).pathname.replace(/^\//, "").trim();
  } catch {
    dbName = "";
  }
  await mongoose.connect(mongoUri, dbName ? {} : { dbName: defaultDbName });

  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    const secret = await ask("Enter ADMIN_SECRET: ");
    if (secret.trim() !== adminSecret) {
      console.error("Invalid admin secret.");
      process.exit(1);
    }
  }

  const name = (await ask("Admin name: ")).trim();
  const email = (await ask("Admin email: ")).trim().toLowerCase();
  const password = (await ask("Admin password: ")).trim();

  if (!name || !email || !password) {
    console.error("Name, email, and password are required.");
    process.exit(1);
  }

  const existing = await Admin.findOne({ email });
  if (existing) {
    console.error("Admin with this email already exists.");
    process.exit(1);
  }

  const hashed = await hashPassword(password);
  const admin = await Admin.create({
    name,
    email,
    phone: "",
    password: hashed,
  });

  console.log("\nAdmin created successfully:");
  console.log("  ID:", admin._id.toString());
  console.log("  Email:", admin.email);
  console.log(
    "\nLogin at /join and use this account. The Admin link will appear in the navbar.",
  );
  rl.close();
  process.exit(0);
}

createAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
