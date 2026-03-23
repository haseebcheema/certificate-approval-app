const CertificateRequest = require("../models/CertificateRequest");
const { requestCertificate } = require("../services/openxpkiService");

const getPendingRequests = async (req, res) => {
  try {
    const requests = await CertificateRequest.find({
      status: "PENDING",
    }).sort({ createdAt: -1 });

    res.render("pending-requests", { requests });
  } catch (error) {
    console.error("Get pending requests error:", error.message);
    res.status(500).send("Error fetching pending requests");
  }
};

const getRequestDetails = async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await CertificateRequest.findById(requestId);

    if (!request) {
      return res.status(404).send("Request not found");
    }

    const backUrl = req.get("Referrer") || "/dashboard";

    return res.render("request-details", {
      request,
      backUrl,
      issuanceMessage: "",
      issuanceError: "",
    });
  } catch (error) {
    console.error("Get request details error:", error.message);
    res.status(500).send("Error fetching request details");
  }
};

const approveRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await CertificateRequest.findById(requestId);

    if (!request) {
      return res.status(404).send("Request not found");
    }

    if (request.status !== "PENDING") {
      return res.status(400).send("Only pending requests can be approved");
    }

    if (!request.csrPem || !request.csrPem.trim()) {
      return res.status(400).send("CSR is required before sending to OpenXPKI");
    }

    const rpcResult = await requestCertificate({
      pkcs10: request.csrPem,
      comment: `Approved by ${req.session.user.username} for ${request.commonName}`,
    });

    console.log("OpenXPKI RequestCertificate response:");
    console.dir(rpcResult, { depth: null });

    const transactionId = rpcResult?.data?.transaction_id || "";
    const workflowId = String(rpcResult?.id || "");
    const certIdentifier = rpcResult?.data?.cert_identifier || "";

    request.status = "APPROVED";
    request.approvedBy = req.session.user.id;
    request.approvedAt = new Date();
    request.openxpkiError = "";
    request.openxpkiTransactionId = transactionId;
    request.openxpkiWorkflowId = workflowId;
    request.openxpkiCertIdentifier = certIdentifier;
    request.openxpkiRequestId = transactionId || certIdentifier || workflowId;

    await request.save();

    const updatedRequest = await CertificateRequest.findById(requestId);

    return res.render("request-details", {
      request: updatedRequest,
      backUrl: "/pending",
      issuanceMessage:
        "Request approved and sent for certificate issuance.",
      issuanceError: "",
    });
  } catch (error) {
    console.error("Approve request error:");
    console.error(error.response?.data || error.message);

    const request = await CertificateRequest.findById(req.params.requestId);
    if (request) {
      request.openxpkiError =
        error.response?.data?.error?.message || error.message;
      request.status = "OPENXPKI_FAILED";
      await request.save();
    }

    return res.status(500).send(
      `Error approving request: ${JSON.stringify(
        error.response?.data || error.message
      )}`
    );
  }
};

const rejectRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const normalizedRejectionReason = (req.body.rejectionReason || "").trim();

    const request = await CertificateRequest.findById(requestId);

    if (!request) {
      return res.status(404).send("Request not found");
    }

    if (request.status !== "PENDING") {
      return res.status(400).send("Only pending requests can be rejected");
    }

    request.status = "REJECTED";
    request.rejectionReason = normalizedRejectionReason;
    request.approvedBy = req.session.user.id;
    request.approvedAt = new Date();

    await request.save();

    return res.redirect("/pending");
  } catch (error) {
    console.error("Reject request error:", error.message);
    return res.status(500).send("Error rejecting request");
  }
};

const getApprovedRequests = async (req, res) => {
  try {
    const requests = await CertificateRequest.find({
      approvedBy: req.session.user.id,
      status: { $in: ["APPROVED", "ISSUED", "OPENXPKI_FAILED"] },
    }).sort({ approvedAt: -1, createdAt: -1 });

    res.render("approved-requests", { requests });
  } catch (error) {
    console.error("Get approved requests error:", error.message);
    res.status(500).send("Error fetching approved requests");
  }
};

module.exports = {
  getPendingRequests,
  getRequestDetails,
  approveRequest,
  rejectRequest,
  getApprovedRequests,
};
