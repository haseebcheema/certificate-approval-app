const CertificateRequest = require("../models/CertificateRequest");
const { generateCsr } = require("../services/csrService");
const Certificate = require("../models/Certificate");
const {
  pickupCertificate,
  searchCertificate,
} = require("../services/openxpkiService");

const getRequestForm = (req, res) => {
  res.render("request-form", { error: null, success: null });
};

const submitCertificateRequest = async (req, res) => {
  const isJson = req.is("application/json");

  const sendError = (message) => {
    if (isJson) return res.status(400).json({ success: false, error: message });
    return res.render("request-form", { error: message, success: null });
  };

  try {
    const {
      commonName,
      organization,
      organizationalUnit,
      country,
      email,
      csrPem: clientCsrPem,
      clientSideCsr,
    } = req.body;

    if (!commonName || !organization || !organizationalUnit || !country || !email) {
      return sendError("All fields are required.");
    }

    if (country.trim().length !== 2) {
      return sendError("Country must be a 2-letter code, e.g. US, DE, PK.");
    }

    const normalizedCN = commonName.trim();
    const normalizedOrg = organization.trim();
    const normalizedOU = organizationalUnit.trim();
    const normalizedCountry = country.trim().toUpperCase();
    const normalizedEmail = email.trim().toLowerCase();

    const existingActive = await CertificateRequest.findOne({
      commonName: normalizedCN,
      status: { $in: ["PENDING", "APPROVED", "ISSUED", "FALLBACK_ISSUED"] },
    });

    if (existingActive) {
      return sendError("A certificate for this common name is already active.");
    }

    const isClientSide =
      clientSideCsr === "true" &&
      clientCsrPem &&
      clientCsrPem.trim().length > 0;

    let csrPem = "";
    let privateKeyPem = "";

    if (isClientSide) {
      const pem = clientCsrPem.trim();
      if (
        !pem.includes("-----BEGIN CERTIFICATE REQUEST-----") &&
        !pem.includes("-----BEGIN NEW CERTIFICATE REQUEST-----")
      ) {
         return sendError("Key generation failed. Please refresh and try again.");
      }
      csrPem = pem;
      privateKeyPem = "";
    } else {
      const generated = await generateCsr({
        commonName: normalizedCN,
        organization: normalizedOrg,
        organizationalUnit: normalizedOU,
        country: normalizedCountry,
        email: normalizedEmail,
      });
      csrPem = generated.csrPem;
      privateKeyPem = generated.privateKeyPem;
    }

    await new CertificateRequest({
      requesterId: req.session.user.id,
      requesterUsername: req.session.user.username,
      commonName: normalizedCN,
      organization: normalizedOrg,
      organizationalUnit: normalizedOU,
      country: normalizedCountry,
      email: normalizedEmail,
      csrPem,
      privateKeyPem,
      clientSideCsr: Boolean(isClientSide),
      status: "PENDING",
    }).save();

    if (isJson) {
      return res.json({
        success: true,
        message: "Request submitted. You will be notified once it is approved.",
      });
    }
    return res.render("request-form", {
      error:   null,
      success: "Request submitted. You will be notified once it is approved.",
    });

  } catch (error) {
    console.error("[requesterController] submitCertificateRequest:", error.message);
    return sendError("Something went wrong. Please try again.");
  }
};

const getMyRequests = async (req, res) => {
  try {
    const requests = await CertificateRequest
      .find({ requesterId: req.session.user.id })
      .sort({ createdAt: -1 });

    res.render("my-requests", {
      requests,
      issuanceMessage: "",
      issuanceMessageType: "",
      issuanceError: "",
    });
  } catch (error) {
    console.error("[requesterController] getMyRequests:", error.message);
    res.status(500).send("Error fetching your requests");
  }
};

const checkMyRequestIssuance = async (req, res) => {
  const renderMyRequests = async (issuanceMessage, issuanceMessageType, issuanceError) => {
    const requests = await CertificateRequest
      .find({ requesterId: req.session.user.id })
      .sort({ createdAt: -1 });
    return res.render("my-requests", {
      requests,
      issuanceMessage,
      issuanceMessageType,
      issuanceError,
    });
  };

  try {
    const { requestId } = req.params;

    const request = await CertificateRequest.findOne({
      _id: requestId,
      requesterId: req.session.user.id,
    });

    if (!request) return res.status(404).send("Request not found");

    if (request.status !== "APPROVED" && request.status !== "ISSUED") {
      return res.status(400).send("This request must be approved before its issuance status can be checked.");
    }

    // Primary: pickup using transaction_id
    if (request.openxpkiTransactionId) {
      const pickupResult = await pickupCertificate({
        transactionId: request.openxpkiTransactionId,
      });

      const state = (pickupResult?.state || "").toUpperCase();
      const procState = (pickupResult?.proc_state || "").toLowerCase();
      const certId = pickupResult?.data?.cert_identifier || "";
      const certificatePem = pickupResult?.data?.certificate || "";
      const errorCode = pickupResult?.data?.error_code || "";

      // Rejected or failed
      if (state === "FAILURE" || state === "REJECTED" ||
          (procState === "finished" && errorCode)) {
        request.status          = "REJECTED";
        request.rejectionReason = errorCode || "Rejected by the certificate authority";
        request.openxpkiError   = errorCode || "Request was rejected";
        await request.save();

        return renderMyRequests(
          "",
          "error",
          "Your certificate request was declined by the certificate authority."
        );
      }

      // Successfully issued
      if (state === "SUCCESS" && certId) {
        request.status = "ISSUED";
        request.openxpkiError = "";
        request.openxpkiCertIdentifier = certId;
        await request.save();

        if (certificatePem && certificatePem.trim()) {
          const existingCert = await Certificate.findOne({ requestId: request._id });
          if (!existingCert) {
            await Certificate.create({
              requestId: request._id,
              requesterId: request.requesterId,
              requesterUsername: request.requesterUsername,
              commonName: request.commonName,
              pemCertificate: certificatePem,
              privateKey: request.privateKeyPem || "",
              issuedAt: new Date(),
            });
          } else {
            existingCert.pemCertificate = certificatePem;
            existingCert.issuedAt = existingCert.issuedAt || new Date();
            await existingCert.save();
          }
          return renderMyRequests(
            "Certificate issued successfully and is ready to download.",
            "success",
            ""
          );
        }

        return renderMyRequests(
          "Certificate issued. Contact your administrator to retrieve it.",
          "info",
          ""
        );
      }

      // Still pending
      return renderMyRequests(
        "Your request is being processed. Check back shortly.",
        "info",
        ""
      );
    }

    // Fallback: search by common name
    const searchResult = await searchCertificate({ commonName: request.commonName });
    const resultData = Array.isArray(searchResult?.data)
      ? searchResult.data[0] || {}
      : searchResult?.data || searchResult || {};

    const certStatus = (resultData?.status || "").toUpperCase();
    const certificatePem = resultData?.certificate || resultData?.pem || resultData?.cert_pem || "";
    const certIdentifier = resultData?.cert_identifier || "";

    if (certStatus !== "ISSUED") {
      return renderMyRequests(
        "Your request is being processed. Check back shortly.",
        "info",
        ""
      );
    }

    request.status = "ISSUED";
    request.openxpkiError = "";
    if (certIdentifier) request.openxpkiCertIdentifier = certIdentifier;
    await request.save();

    if (certificatePem && certificatePem.trim()) {
      const existingCert = await Certificate.findOne({ requestId: request._id });
      if (!existingCert) {
        await Certificate.create({
          requestId: request._id,
          requesterId: request.requesterId,
          requesterUsername: request.requesterUsername,
          commonName: request.commonName,
          pemCertificate: certificatePem,
          privateKey: request.privateKeyPem || "",
          issuedAt: new Date(),
        });
      } else {
        existingCert.pemCertificate = certificatePem;
        existingCert.issuedAt = existingCert.issuedAt || new Date();
        await existingCert.save();
      }
      return renderMyRequests(
        "Certificate issued successfully and is ready to download.",
        "success",
        ""
      );
    }

    return renderMyRequests(
      "Certificate issued. Contact your administrator to retrieve it.",
      "info",
      ""
    );

  } catch (error) {
    console.error("[requesterController] checkMyRequestIssuance:", error.message);
    const requests = await CertificateRequest
      .find({ requesterId: req.session.user.id })
      .sort({ createdAt: -1 });
    return res.render("my-requests", {
      requests,
      issuanceMessage: "",
      issuanceMessageType: "",
      issuanceError: "Could not check status. Please try again.",
    });
  }
};

module.exports = {
  getRequestForm,
  submitCertificateRequest,
  getMyRequests,
  checkMyRequestIssuance,
};