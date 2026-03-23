const CertificateRequest = require("../models/CertificateRequest");
const { generateCsr } = require("../services/csrService");
const Certificate = require("../models/Certificate");
const { searchCertificate } = require("../services/openxpkiService");

const getRequestForm = (req, res) => {
  res.render("request-form", {
    error: null,
    success: null,
  });
};

const submitCertificateRequest = async (req, res) => {
  try {
    const {
      commonName,
      organization,
      organizationalUnit,
      country,
      email,
    } = req.body;

    if (
      !commonName ||
      !organization ||
      !organizationalUnit ||
      !country ||
      !email
    ) {
      return res.render("request-form", {
        error: "All fields are required",
        success: null,
      });
    }

    if (country.trim().length !== 2) {
      return res.render("request-form", {
        error: "Country must be a 2-letter code, e.g. PK, DE, US",
        success: null,
      });
    }

    const normalizedCommonName = commonName.trim();
    const normalizedOrganization = organization.trim();
    const normalizedOU = organizationalUnit.trim();
    const normalizedCountry = country.trim().toUpperCase();
    const normalizedEmail = email.trim().toLowerCase();

    const existingRequest = await CertificateRequest.findOne({
      commonName: normalizedCommonName,
    });

    if (existingRequest) {
      return res.render("request-form", {
        error:
          "A certificate request with this common name already exists.",
        success: null,
      });
    }

    const { csrPem, privateKeyPem } = await generateCsr({
      commonName: normalizedCommonName,
      organization: normalizedOrganization,
      organizationalUnit: normalizedOU,
      country: normalizedCountry,
      email: normalizedEmail,
    });

    const newRequest = new CertificateRequest({
      requesterId: req.session.user.id,
      requesterUsername: req.session.user.username,
      commonName: normalizedCommonName,
      organization: normalizedOrganization,
      organizationalUnit: normalizedOU,
      country: normalizedCountry,
      email: normalizedEmail,
      csrPem,
      privateKeyPem,
      status: "PENDING",
    });

    await newRequest.save();

    return res.render("request-form", {
      error: null,
      success: "Certificate request submitted successfully.",
    });
  } catch (error) {
    console.error("Submit request error:", error.message);
    return res.render("request-form", {
      error: `Something went wrong while generating the CSR: ${error.message}`,
      success: null,
    });
  }
};

const getMyRequests = async (req, res) => {
  try {
    const requests = await CertificateRequest.find({
      requesterId: req.session.user.id,
    }).sort({ createdAt: -1 });

    res.render("my-requests", {
      requests,
      issuanceMessage: "",
      issuanceMessageType: "",
      issuanceError: "",
    });
  } catch (error) {
    console.error("Get my requests error:", error.message);
    res.status(500).send("Error fetching your requests");
  }
};

const checkMyRequestIssuance = async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await CertificateRequest.findOne({
      _id: requestId,
      requesterId: req.session.user.id,
    });

    if (!request) {
      return res.status(404).send("Request not found");
    }

    if (request.status !== "APPROVED" && request.status !== "ISSUED") {
      return res
        .status(400)
        .send("This request must be approved before its issuance status can be checked.");
    }

    const searchResult = await searchCertificate({
      commonName: request.commonName,
    });

    console.log("Requester side - OpenXPKI SearchCertificate response:");
    console.dir(searchResult, { depth: null });

    const resultData = Array.isArray(searchResult?.data)
      ? searchResult.data[0] || {}
      : searchResult?.data || searchResult || {};

    console.log("Normalized resultData:");
    console.dir(resultData, { depth: null });

    const certIdentifier = resultData?.cert_identifier || "";
    const certStatus = (resultData?.status || "").toUpperCase();
    const certificatePem =
      resultData?.certificate ||
      resultData?.pem ||
      resultData?.cert_pem ||
      "";

    console.log("Extracted values:");
    console.log({
      certIdentifier,
      certStatus,
      hasCertificatePem: Boolean(certificatePem && certificatePem.trim()),
      certificatePreview: certificatePem ? certificatePem.slice(0, 80) : "",
    });

    let issuanceMessage = "";
    let issuanceMessageType = "";
    let issuanceError = "";

    const isIssued = certStatus === "ISSUED";
    const hasDownloadableCertificate = Boolean(
      certificatePem && certificatePem.trim()
    );

    if (!isIssued) {
      issuanceMessage = "Certificate is not issued yet.";
      issuanceMessageType = "info";
    } else {
      request.status = "ISSUED";
      request.openxpkiError = "";

      if (certIdentifier && !request.openxpkiCertIdentifier) {
        request.openxpkiCertIdentifier = certIdentifier;
      }

      await request.save();

      if (hasDownloadableCertificate) {
        const existingCertificate = await Certificate.findOne({
          requestId: request._id,
        });

        if (!existingCertificate) {
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
          existingCertificate.pemCertificate = certificatePem;
          existingCertificate.privateKey =
            request.privateKeyPem || existingCertificate.privateKey || "";
          existingCertificate.issuedAt =
            existingCertificate.issuedAt || new Date();
          await existingCertificate.save();
        }

        issuanceMessage = "Certificate has been issued successfully.";
        issuanceMessageType = "success";
      } else {
        issuanceMessage =
          "Certificate is marked as issued in OpenXPKI, but the PEM certificate was not returned by SearchCertificate.";
        issuanceMessageType = "info";
      }
    }

    const requests = await CertificateRequest.find({
      requesterId: req.session.user.id,
    }).sort({ createdAt: -1 });

    return res.render("my-requests", {
      requests,
      issuanceMessage,
      issuanceMessageType,
      issuanceError,
    });
  } catch (error) {
    console.error("Requester check issuance error:");
    console.dir(error.response?.data || error.message, { depth: null });

    const requests = await CertificateRequest.find({
      requesterId: req.session.user.id,
    }).sort({ createdAt: -1 });

    return res.render("my-requests", {
      requests,
      issuanceMessage: "",
      issuanceMessageType: "",
      issuanceError: "Error checking certificate issuance.",
    });
  }
};

module.exports = {
  getRequestForm,
  submitCertificateRequest,
  getMyRequests,
  checkMyRequestIssuance,
};