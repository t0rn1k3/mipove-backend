const express = require("express");
const router = express.Router();
const {
  registerUser,
  registerAdmin,
  registerMaster,
  login,
  getMe,
  updateProfile,
} = require("../controllers/authController");
const { protect } = require("../middlewares/auth");
const upload = require("../config/multer");

const handleUpload = (req, res, next) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      err.statusCode = 400;
      return next(err);
    }
    next();
  });
};

router.post("/register/user", registerUser);
router.post("/register/admin", registerAdmin);
router.post("/register/master", registerMaster);
router.post("/login", login);

router.get("/me", protect, getMe);
router.get("/profile", protect, getMe);
router.put("/profile", protect, handleUpload, updateProfile);
router.patch("/profile", protect, handleUpload, updateProfile);
router.post("/profile", protect, handleUpload, updateProfile);

module.exports = router;
