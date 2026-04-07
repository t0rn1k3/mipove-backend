const express = require("express");
const multer = require("multer");
const asyncHandler = require("express-async-handler");
const { protect } = require("../middlewares/auth");
const { uploadToB2 } = require("../utils/uploadToB2");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

router.post(
  "/",
  protect,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        err.statusCode = 400;
        return next(err);
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) {
      const err = new Error("No file");
      err.statusCode = 400;
      throw err;
    }

    const url = await uploadToB2(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    );

    res.json({ success: true, url });
  }),
);

module.exports = router;
