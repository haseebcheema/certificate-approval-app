const express = require("express");
const router = express.Router();

const {
  getRequestForm,
  submitCertificateRequest,
  getMyRequests,
  checkMyRequestIssuance,
} = require("../controllers/requesterController");

const {
  isAuthenticated,
  isRequester,
} = require("../middleware/authMiddleware");

// Show request form
router.get("/request", isAuthenticated, isRequester, getRequestForm);

// Submit request
router.post("/request", isAuthenticated, isRequester, submitCertificateRequest);

// View my requests
router.get("/my-requests", isAuthenticated, isRequester, getMyRequests);

router.post(
  "/my-requests/check-issued/:requestId",
  isAuthenticated,
  isRequester,
  checkMyRequestIssuance
);

module.exports = router;