const Certificate = require("../models/Certificate");

const getMyCertificates = async (req, res) => {
  try {
    const certificates = await Certificate
      .find({ requesterId: req.session.user.id })
      .sort({ issuedAt: -1 });

    res.render("certificates", { certificates });
  } catch (error) {
    console.error("[certificateController] getMyCertificates:", error.message);
    res.status(500).send("Error fetching certificates");
  }
};

const downloadCertificate = async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id);

    if (!certificate) {
      return res.status(404).send("Certificate not found");
    }

    if (certificate.requesterId.toString() !== req.session.user.id) {
      return res.status(403).send("Access denied: You can only download your own certificate");
    }

    const safeName = certificate.commonName.replace(/[^\w.-]/g, "_");
    const format = req.query.format === "pem" ? "pem" : "crt";

    const filename = `${safeName}.${format}`;
    const mimeType = format === "crt"
      ? "application/x-x509-ca-cert"
      : "application/x-pem-file";

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.type(mimeType);
    res.send(certificate.pemCertificate);

  } catch (error) {
    console.error("[certificateController] downloadCertificate:", error.message);
    res.status(500).send("Error downloading certificate");
  }
};

module.exports = {
  getMyCertificates,
  downloadCertificate,
};