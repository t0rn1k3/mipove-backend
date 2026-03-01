const express = require("express");
const cors = require("cors");
const artisanRoutes = require("./routes/artisanRoutes");
const errorHandler = require("./middlewares/errorHandler");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/artisans", artisanRoutes);

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Mipove API is running" });
});

app.use(errorHandler);

module.exports = app;
