const express = require("express");
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const masterRoutes = require("./routes/masterRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const geocodeRoutes = require("./routes/geocodeRoutes");
const {
  globalErrorHandler,
  pageNotFound,
} = require("./middlewares/errorHandler");

const app = express();

// CORS: allow frontend origin (must be specific for credentials)
const frontendOrigin = process.env.FRONTEND_URL || "http://localhost:3000";
app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(
  express.json({
    type: (req) => {
      const ct = req.headers["content-type"] || "";
      return ct.includes("application/json") && !ct.includes("multipart");
    },
  }),
);

// Serve uploaded profile images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Mipove API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/masters", masterRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/geocode", geocodeRoutes);

// 404 - must be after all routes (like school-system)
app.use(pageNotFound);
app.use(globalErrorHandler);

module.exports = app;
