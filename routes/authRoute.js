const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const asyncHandler = require("../middleware/asyncHandler");
const { validateRegister, validateLogin } = require("../middleware/validateRequest");

const {
  registerUser,
  loginUser,
  logoutUser,
  refresh,
  getCurrentUser,
} = require("../controllers/authController");

router.post("/register", validateRegister, asyncHandler(registerUser));
router.post("/login", validateLogin, asyncHandler(loginUser));
router.post("/logout", asyncHandler(logoutUser));
router.post("/refresh", asyncHandler(refresh));
router.get("/me", authMiddleware, asyncHandler(getCurrentUser));

module.exports = router;
