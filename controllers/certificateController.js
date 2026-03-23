const Certificate = require("../models/Certificate");

const getMyCertificates = async (req, res) => {
  try {
    const certificates = await Certificate.find({
      requesterId: req.session.user.id,
    }).sort({ issuedAt: -1 });

    res.render("certificates", { certificates });
  } catch (error) {
    console.error("Get certificates error:", error.message);
    res.status(500).send("Error fetching certificates");
  }
};

const downloadCertificate = async (req, res) => {
  try {
    const { id } = req.params;

    const certificate = await Certificate.findById(id);

    if (!certificate) {
      return res.status(404).send("Certificate not found");
    }

    if (certificate.requesterId.toString() !== req.session.user.id) {
      return res.status(403).send("Access denied: You can only download your own certificate");
    }

    const safeName = certificate.commonName.replace(/[^\w.-]/g, "_");

    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pem"`);
    res.type("application/x-pem-file");
    res.send(certificate.pemCertificate);
  } catch (error) {
    console.error("Download certificate error:", error.message);
    res.status(500).send("Error downloading certificate");
  }
};

module.exports = {
  getMyCertificates,
  downloadCertificate,
};