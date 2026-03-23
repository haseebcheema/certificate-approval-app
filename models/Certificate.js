const mongoose = require("mongoose");

const certificateSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CertificateRequest",
      required: true,
      unique: true,
    },
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
    pemCertificate: {
      type: String,
      required: true,
    },
    privateKey: {
      type: String,
      default: "",
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Certificate", certificateSchema);