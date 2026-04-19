const CertificateRequest = require("../models/CertificateRequest");
const Certificate = require("../models/Certificate");
const { requestCertificate } = require("../services/openxpkiService");
const { generateCsr, generateSelfSignedCert } = require("../services/csrService");

// ─────────────────────────────────────────────────────────────────────────────
// Helper: persist an issued certificate (real or fallback)
// ─────────────────────────────────────────────────────────────────────────────

const persistCertificate = async (request, pemCertificate, isFallback) => {
  const newStatus = isFallback ? "FALLBACK_ISSUED" : "ISSUED";

  const existing = await Certificate.findOne({ requestId: request._id });
  if (existing) {
    existing.pemCertificate = pemCertificate;
    existing.isFallback = isFallback;
    existing.issuedAt = existing.issuedAt || new Date();
    await existing.save();
  } else {
    await Certificate.create({
      requestId: request._id,
      requesterId: request.requesterId,
      requesterUsername: request.requesterUsername,
      commonName: request.commonName,
      pemCertificate,
      privateKey: request.privateKeyPem || "",
      isFallback,
      issuedAt: new Date(),
    });
  }

  request.status = newStatus;
  request.isFallbackCert = isFallback;
  request.openxpkiError = isFallback ? request.openxpkiError : "";
  await request.save();
};

// ─────────────────────────────────────────────────────────────────────────────
// Core approval logic — shared by approveRequest and retryRequest
// ─────────────────────────────────────────────────────────────────────────────

const runApproval = async (request, approverUsername, approverUserId) => {
  request.approvedBy = approverUserId;
  request.approvedAt = new Date();

  try {
    if (!request.csrPem || !request.csrPem.trim()) {
      throw new Error("No CSR is attached to this request");
    }

    const rpcResult = await requestCertificate({
      pkcs10: request.csrPem,
      comment: `Approved by ${approverUsername} for ${request.commonName}`,
    });

    request.status = "APPROVED";
    request.openxpkiError = "";
    request.openxpkiTransactionId = rpcResult?.data?.transaction_id || "";
    request.openxpkiWorkflowId = String(rpcResult?.id || "");
    request.openxpkiCertIdentifier = rpcResult?.data?.cert_identifier || "";
    request.openxpkiRequestId =
      request.openxpkiTransactionId ||
      request.openxpkiCertIdentifier ||
      request.openxpkiWorkflowId;

    const directPem = rpcResult?.data?.certificate || rpcResult?.data?.cert_pem || "";
    if (directPem.trim()) {
      await persistCertificate(request, directPem, false);
      return { status: "ISSUED", usedFallback: false, openxpkiFailed: false };
    }

    await request.save();
    return { status: "APPROVED", usedFallback: false, openxpkiFailed: false };

  } catch (openxpkiErr) {
    const errMsg = openxpkiErr.response?.data?.error?.message || openxpkiErr.message;
    console.error("[approverController] OpenXPKI failed:", errMsg);

    try {
      if (!request.csrPem) {
        throw new Error("Cannot generate fallback: CSR missing on this request");
      }

      // If private key is missing (client-side CSR), generate a
      // fresh key pair server-side purely for the fallback certificate
      let fallbackCsrPem     = request.csrPem;
      let fallbackPrivateKey = request.privateKeyPem;

      if (!fallbackPrivateKey || !fallbackPrivateKey.trim()) {
        const generated = await generateCsr({
          commonName:         request.commonName,
          organization:       request.organization,
          organizationalUnit: request.organizationalUnit,
          country:            request.country,
          email:              request.email,
        });
        fallbackCsrPem     = generated.csrPem;
        fallbackPrivateKey = generated.privateKeyPem;
      }

      const fallback = await generateSelfSignedCert({
        commonName:         request.commonName,
        organization:       request.organization,
        organizationalUnit: request.organizationalUnit,
        country:            request.country,
        email:              request.email,
        csrPem:             fallbackCsrPem,
        privateKeyPem:      fallbackPrivateKey,
      });

      request.openxpkiError =
        `OpenXPKI unavailable: ${errMsg}. ` +
        `A self-signed fallback certificate has been issued instead.`;

      await persistCertificate(request, fallback.certPem, true);

      return { status: "FALLBACK_ISSUED", usedFallback: true, openxpkiFailed: true, errorMessage: errMsg };

    } catch (fallbackErr) {
      console.error("[approverController] Fallback cert generation failed:", fallbackErr.message);

      request.status        = "FAILED";
      request.openxpkiError = "Certificate authority was unreachable.";
      await request.save();

      return { status: "FAILED", usedFallback: false, openxpkiFailed: true, errorMessage: request.openxpkiError };
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Route handlers
// ─────────────────────────────────────────────────────────────────────────────

const getPendingRequests = async (req, res) => {
  try {
    const requests = await CertificateRequest.find({ status: "PENDING" }).sort({ createdAt: -1 });
    res.render("pending-requests", { requests });
  } catch (err) {
    console.error("[approverController] getPendingRequests:", err.message);
    res.status(500).send("Error fetching pending requests");
  }
};

const getRequestDetails = async (req, res) => {
  try {
    const request = await CertificateRequest.findById(req.params.requestId);
    if (!request) return res.status(404).send("Request not found");
    const backUrl = req.get("Referrer") || "/dashboard";
    return res.render("request-details", { request, backUrl, issuanceMessage: "", issuanceError: "" });
  } catch (err) {
    console.error("[approverController] getRequestDetails:", err.message);
    res.status(500).send("Error fetching request details");
  }
};

const approveRequest = async (req, res) => {
  try {
    const request = await CertificateRequest.findById(req.params.requestId);
    if (!request) return res.status(404).send("Request not found");
    if (request.status !== "PENDING") return res.status(400).send("Only PENDING requests can be approved");

    const result = await runApproval(request, req.session.user.username, req.session.user.id);
    const updated = await CertificateRequest.findById(req.params.requestId);

    let issuanceMessage = "";
    let issuanceError = "";

    if (result.status === "APPROVED") {
      issuanceMessage = "Request submitted for certificate issuance.";
    } else if (result.status === "ISSUED") {
      issuanceMessage = "Certificate issued successfully.";
    } else if (result.status === "FALLBACK_ISSUED") {
      issuanceMessage = "Certificate issued using a self-signed fallback.";
      issuanceError = "";
    } else {
      issuanceError = "Approval could not be completed. Use the Retry button to try again.";
    }

    return res.render("request-details", { request: updated, backUrl: "/pending", issuanceMessage, issuanceError });
  } catch (err) {
    console.error("[approverController] approveRequest:", err.message);
    return res.status(500).send("Something went wrong. Please try again.");
  }
};

const retryRequest = async (req, res) => {
  try {
    const request = await CertificateRequest.findById(req.params.requestId);
    if (!request) return res.status(404).send("Request not found");
    if (request.status !== "FAILED") return res.status(400).send("Only FAILED requests can be retried");

    request.retryCount             = (request.retryCount || 0) + 1;
    request.status                 = "PENDING";
    request.openxpkiTransactionId  = "";
    request.openxpkiWorkflowId     = "";
    request.openxpkiCertIdentifier = "";
    request.openxpkiRequestId      = "";
    request.openxpkiError          = "";
    await request.save();

    const result = await runApproval(request, req.session.user.username, req.session.user.id);
    const updated = await CertificateRequest.findById(req.params.requestId);

    let issuanceMessage = "";
    let issuanceError = "";

    if (result.status === "APPROVED") {
      issuanceMessage = "Request resubmitted successfully.";
    } else if (result.status === "ISSUED") {
      issuanceMessage = "Certificate issued successfully.";
    } else if (result.status === "FALLBACK_ISSUED") {
      issuanceMessage = "Certificate issued using a self-signed fallback.";
      issuanceError = "";
    } else {
      issuanceError = "Retry failed. Please check the certificate authority connection and try again.";
    }

    return res.render("request-details", { request: updated, backUrl: "/failed", issuanceMessage, issuanceError });
  } catch (err) {
    console.error("[approverController] retryRequest:", err.message);
    return res.status(500).send("Something went wrong. Please try again.");
  }
};

const rejectRequest = async (req, res) => {
  try {
    const request = await CertificateRequest.findById(req.params.requestId);
    if (!request) return res.status(404).send("Request not found");
    if (request.status !== "PENDING") return res.status(400).send("Only PENDING requests can be rejected");

    request.status = "REJECTED";
    request.rejectionReason = (req.body.rejectionReason || "").trim();
    request.approvedBy = req.session.user.id;
    request.approvedAt = new Date();
    await request.save();

    return res.redirect("/pending");
  } catch (err) {
    console.error("[approverController] rejectRequest:", err.message);
    return res.status(500).send("Something went wrong. Please try again.");
  }
};

const getApprovedRequests = async (req, res) => {
  try {
    const requests = await CertificateRequest.find({
      approvedBy: req.session.user.id,
      status: { $in: ["APPROVED", "ISSUED", "FALLBACK_ISSUED", "FAILED"] },
    }).sort({ approvedAt: -1, createdAt: -1 });
    res.render("approved-requests", { requests });
  } catch (err) {
    console.error("[approverController] getApprovedRequests:", err.message);
    res.status(500).send("Error fetching approved requests");
  }
};

const getFailedRequests = async (req, res) => {
  try {
    const requests = await CertificateRequest.find({ status: "FAILED" }).sort({ updatedAt: -1 });
    res.render("failed-requests", { requests });
  } catch (err) {
    console.error("[approverController] getFailedRequests:", err.message);
    res.status(500).send("Error fetching failed requests");
  }
};

module.exports = {
  getPendingRequests,
  getRequestDetails,
  approveRequest,
  retryRequest,
  rejectRequest,
  getApprovedRequests,
  getFailedRequests,
};