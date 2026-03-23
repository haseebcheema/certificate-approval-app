const express = require("express");
const router = express.Router();

const {
  getPendingRequests,
  getRequestDetails,
  approveRequest,
  rejectRequest,
  getApprovedRequests,
} = require("../controllers/approverController");

const {
  isAuthenticated,
  isApprover,
} = require("../middleware/authMiddleware");

router.get("/pending", isAuthenticated, isApprover, getPendingRequests);
router.get("/pending/:requestId", isAuthenticated, isApprover, getRequestDetails);
router.post("/approve/:requestId", isAuthenticated, isApprover, approveRequest);
router.post("/reject/:requestId", isAuthenticated, isApprover, rejectRequest);
router.get("/approved", isAuthenticated, isApprover, getApprovedRequests);

module.exports = router;