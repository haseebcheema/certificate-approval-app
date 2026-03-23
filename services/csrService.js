const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const generateCsr = async ({
  commonName,
  organization,
  organizationalUnit,
  country,
  email,
}) => {
  const tempId = crypto.randomBytes(8).toString("hex");
  const tempDir = os.tmpdir();

  const keyPath = path.join(tempDir, `key-${tempId}.pem`);
  const csrPath = path.join(tempDir, `csr-${tempId}.pem`);

  const subj = `/C=${country}/O=${organization}/OU=${organizationalUnit}/CN=${commonName}/emailAddress=${email}`;

  try {
    await execFileAsync("openssl", [
      "req",
      "-new",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      csrPath,
      "-subj",
      subj,
    ]);

    const [privateKeyPem, csrPem] = await Promise.all([
      fs.readFile(keyPath, "utf8"),
      fs.readFile(csrPath, "utf8"),
    ]);

    return {
      privateKeyPem,
      csrPem,
    };
  } finally {
    await Promise.allSettled([
      fs.unlink(keyPath),
      fs.unlink(csrPath),
    ]);
  }
};

module.exports = {
  generateCsr,
};