const axios = require("axios");
const https = require("https");

const genericBaseUrl = process.env.OPENXPKI_RPC_GENERIC_URL;
const publicBaseUrl = process.env.OPENXPKI_RPC_PUBLIC_URL;
const rpcTimeoutMs = parseInt(process.env.OPENXPKI_TIMEOUT_MS || "20000", 10);

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const defaultHeaders = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

const handleRpcResponse = (data) => {
  if (!data) throw new Error("Empty response from OpenXPKI");
  if (data.error) throw new Error(`OpenXPKI error ${data.error.code}: ${data.error.message}`);
  if (!data.result) throw new Error("OpenXPKI response does not contain a result object");
  return data.result;
};

const rpcPost = async (url, payload) => {
  const response = await axios.post(url, payload, {
    httpsAgent,
    headers: defaultHeaders,
    timeout: rpcTimeoutMs,
  });
  return handleRpcResponse(response.data);
};

// Submit CSR to OpenXPKI
const requestCertificate = async ({ pkcs10, comment = "", profile = "" }) => {
  const payload = { pkcs10 };
  if (comment) payload.comment = comment;
  if (profile) payload.profile = profile;
  return rpcPost(`${genericBaseUrl}/RequestCertificate`, payload);
};

// Pick up result using transaction_id
const pickupCertificate = async ({ transactionId, pkcs10 }) => {
  if (!transactionId && !pkcs10) {
    throw new Error("pickupCertificate requires transactionId or pkcs10");
  }
  const payload = {};
  if (transactionId) payload.transaction_id = transactionId;
  if (pkcs10) payload.pkcs10 = pkcs10;
  return rpcPost(`${genericBaseUrl}/RequestCertificate`, payload);
};

// Search by common name — fallback only
const searchCertificate = async ({ commonName = "" }) => {
  if (!commonName.trim()) throw new Error("commonName is required for SearchCertificate");
  const response = await axios.post(
    `${publicBaseUrl}/SearchCertificate`,
    { common_name: commonName.trim() },
    { httpsAgent, headers: defaultHeaders, timeout: rpcTimeoutMs }
  );
  return handleRpcResponse(response.data);
};

const testConnection = async () => {
  return rpcPost(`${genericBaseUrl}/TestConnection`, {});
};

module.exports = {
  requestCertificate,
  pickupCertificate,
  searchCertificate,
  testConnection,
};