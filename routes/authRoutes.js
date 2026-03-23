const express = require("express");
const router = express.Router();

const {
  getLoginPage,
  loginUser,
  logoutUser,
  getDashboard,
} = require("../controllers/authController");

const { isAuthenticated } = require("../middleware/authMiddleware");

// Login page
router.get("/", getLoginPage);

// Login form submit
router.post("/login", loginUser);

// Dashboard
router.get("/dashboard", isAuthenticated, getDashboard);

// Logout
router.post("/logout", logoutUser);

module.exports = router;