const express = require("express");
const router = express.Router();
const {
  registerUser,
  registerMaster,
  login,
  getMe,
} = require("../controllers/authController");
const { protect, authorize } = require("../middlewares/auth");

router.post("/register/user", registerUser);
router.post("/register/master", registerMaster);
router.post("/login", login);

router.get("/me", protect, getMe);

module.exports = router;
