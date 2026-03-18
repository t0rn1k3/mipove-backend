const express = require("express");
const router = express.Router();
const {
  registerUser,
  registerAdmin,
  registerMaster,
  login,
  refresh,
  logout,
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

router.post("/users/register", registerUser);
router.post("/admin/register", registerAdmin);
router.post("/masters/register", registerMaster);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);

router.get(["/me", "/me/"], protect, getMe);
router.patch(["/me", "/me/"], protect, handleUpload, updateProfile);
router.put(["/me", "/me/"], protect, handleUpload, updateProfile);

router.get(["/profile", "/profile/"], protect, getMe);
router.put("/profile", protect, handleUpload, updateProfile);
router.patch("/profile", protect, handleUpload, updateProfile);
router.post("/profile", protect, handleUpload, updateProfile);

module.exports = router;
