const axios = require("axios");
const https = require("https");

const genericUrl = process.env.OPENXPKI_RPC_GENERIC_URL;
const publicUrl = process.env.OPENXPKI_RPC_PUBLIC_URL;

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

const handleRpcResponse = (data) => {
  if (!data) {
    throw new Error("Empty response from OpenXPKI");
  }

  if (data.error) {
    throw new Error(
      `OpenXPKI error ${data.error.code}: ${data.error.message}`
    );
  }

  if (!data.result) {
    throw new Error("OpenXPKI response does not contain a result object");
  }

  return data.result;
};

const requestCertificate = async ({ pkcs10, comment = "", profile = "" }) => {
  const payload = {
    pkcs10,
  };

  if (comment) payload.comment = comment;
  if (profile) payload.profile = profile;

  const response = await axios.post(
    `${genericUrl}/RequestCertificate`,
    payload,
    {
      httpsAgent,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 20000,
    }
  );

  return handleRpcResponse(response.data);
};

const searchCertificateOnce = async (payload, matchedBy) => {
  const response = await axios.post(
    `${publicUrl}/SearchCertificate`,
    payload,
    {
      httpsAgent,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 20000,
    }
  );

  const result = handleRpcResponse(response.data);
  return {
    ...result,
    matchedBy,
    searchPayload: payload,
  };
};

const searchCertificate = async ({ commonName = "" }) => {
  if (!commonName || !commonName.trim()) {
    throw new Error("commonName is required for SearchCertificate");
  }

  const payload = {
    common_name: commonName.trim(),
  };

  const response = await axios.post(
    `${publicUrl}/SearchCertificate`,
    payload,
    {
      httpsAgent,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 20000,
    }
  );

  const result = handleRpcResponse(response.data);

  return {
    ...result,
    matchedBy: "common_name",
    searchPayload: payload,
  };
};

const testConnection = async () => {
  const response = await axios.get(`${genericUrl}/TestConnection`, {
    httpsAgent,
    headers: {
      Accept: "application/json",
    },
    timeout: 15000,
  });

  return handleRpcResponse(response.data);
};

module.exports = {
  requestCertificate,
  searchCertificate,
  testConnection,
};