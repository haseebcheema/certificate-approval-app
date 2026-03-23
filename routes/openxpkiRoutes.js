const express = require("express");
const router = express.Router();

const { testConnection } = require("../services/openxpkiService");
const { isAuthenticated, isApprover } = require("../middleware/authMiddleware");

router.get("/openxpki/test", isAuthenticated, isApprover, async (req, res) => {
  try {
    const result = await testConnection();
    res.json(result);
  } catch (error) {
    console.error("OpenXPKI test error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;