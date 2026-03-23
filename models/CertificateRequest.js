const mongoose = require("mongoose");

const certificateRequestSchema = new mongoose.Schema(
  {
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requesterUsername: {
      type: String,
      required: true,
    },
    commonName: {
      type: String,
      required: true,
      trim: true,
    },
    organization: {
      type: String,
      required: true,
      trim: true,
    },
    organizationalUnit: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    csrPem: {
      type: String,
      required: true,
      trim: true,
    },
    privateKeyPem: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "ISSUED", "OPENXPKI_FAILED"],
      default: "PENDING",
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    openxpkiRequestId: {
      type: String,
      default: "",
    },
    openxpkiWorkflowId: {
      type: String,
      default: "",
    },
    openxpkiTransactionId: {
      type: String,
      default: "",
    },
    openxpkiCertIdentifier: {
      type: String,
      default: "",
    },
    openxpkiError: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("CertificateRequest", certificateRequestSchema);