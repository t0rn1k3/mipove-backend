const express = require("express");
const cors = require("cors");
const artisanRoutes = require("./routes/artisanRoutes");
const authRoutes = require("./routes/authRoutes");
const {
  globalErrorHandler,
  pageNotFound,
} = require("./middlewares/errorHandler");

const app = express();

// CORS: allow frontend origin from env (like school-system)
const frontendOrigin = process.env.FRONTEND_URL || "http://localhost:3000";
app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  })
);

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Mipove API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/artisans", artisanRoutes);

// 404 - must be after all routes (like school-system)
app.use(pageNotFound);
app.use(globalErrorHandler);

module.exports = app;
