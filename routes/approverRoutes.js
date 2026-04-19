const express = require("express");
const router = express.Router();

const {
  getPendingRequests,
  getRequestDetails,
  approveRequest,
  retryRequest,
  rejectRequest,
  getApprovedRequests,
  getFailedRequests,
} = require("../controllers/approverController");

const {
  isAuthenticated,
  isApprover,
} = require("../middleware/authMiddleware");

router.get("/pending", isAuthenticated, isApprover, getPendingRequests);
router.get("/pending/:requestId", isAuthenticated, isApprover, getRequestDetails);
router.post("/approve/:requestId", isAuthenticated, isApprover, approveRequest);
router.post("/reject/:requestId", isAuthenticated, isApprover, rejectRequest);
router.post("/retry/:requestId", isAuthenticated, isApprover, retryRequest);
router.get("/approved", isAuthenticated, isApprover, getApprovedRequests);
router.get("/failed", isAuthenticated, isApprover, getFailedRequests);

module.exports = router;