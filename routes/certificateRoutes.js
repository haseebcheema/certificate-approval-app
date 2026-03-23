const express = require("express");
const router = express.Router();

const {
  getMyCertificates,
  downloadCertificate,
} = require("../controllers/certificateController");

const {
  isAuthenticated,
  isRequester,
} = require("../middleware/authMiddleware");

router.get("/certificates", isAuthenticated, isRequester, getMyCertificates);
router.get("/certificates/:id/download", isAuthenticated, isRequester, downloadCertificate);

module.exports = router;