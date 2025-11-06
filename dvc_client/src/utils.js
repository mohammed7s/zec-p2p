const ccxt = require('ccxt');
const { PrimusNetwork } = require('@primuslabs/network-core-sdk/dist');
const { ethers } = require('ethers');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

function saveToFile(filepath, data) {
  fs.writeFileSync(filepath, data);
}

async function doProve(requests, responseResolves, options = {}) {
  const opts = getDefaultOptions(options);

  validateInput(requests, responseResolves);

  await validateEnvVars();

  const { PRIVATE_KEY, CHAIN_ID, RPC_URL } = process.env;
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const attestParams = { address: '0x810b7bacEfD5ba495bB688bbFD2501C904036AB7' };

  const primusNetwork = new PrimusNetwork();
  const startTime = Date.now();
  try {
    await initializePrimusNetwork(primusNetwork, wallet, CHAIN_ID);
    const submitResult = await submitTaskWithRetry(primusNetwork, opts, attestParams);
    const attestResult = await attestWithRetry(primusNetwork, requests, responseResolves, opts, attestParams, submitResult);
    const taskResult = await verifyAndPollTaskResultWithRetry(primusNetwork, attestResult);

    const zkVmRequestData = await prepareZkVmRequestData(primusNetwork, taskResult, attestResult);
    console.log(`Total time: ${Date.now() - startTime}ms`);
    return zkVmRequestData;
  } catch (err) {
    throw new Error(`Task execution failed: ${err.message || err}`);
  }
}

function getDefaultOptions(options) {
  const defaultOptions = {
    sslCipher: 'ECDHE-RSA-AES128-GCM-SHA256',
    algorithmType: 'mpctls',
    specialTask: undefined,
    noProxy: true,
    runZkvm: true,
    requestParamsCallback: undefined,
  };
  return { ...defaultOptions, ...options };
}

function validateInput(requests, responseResolves) {
  if (!Array.isArray(requests) || requests.length !== responseResolves.length || requests.length === 0) {
    throw new Error("Invalid 'requests' or 'responseResolves' size");
  }
}

async function validateEnvVars() {
  const requiredEnv = ["PRIVATE_KEY", "CHAIN_ID", "RPC_URL"];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      throw new Error(`Missing environment variable: ${key}`);
    }
  }
}

async function initializePrimusNetwork(primusNetwork, wallet, chainId) {
  try {
    console.log("🚀 Initializing PrimusNetwork...");
    const initResult = await primusNetwork.init(wallet, +chainId, 'native');
    console.log("✅ PrimusNetwork initialized:", initResult);
  } catch (err) {
    throw new Error(`PrimusNetwork init failed: ${err.message || err}`);
  }
}

async function submitTaskWithRetry(primusNetwork, opts, attestParams, maxRetries = 5, baseDelay = 1000) {
  let attempt = 0;

  console.log("📝 Submitting task...");
  const submitStart = Date.now();
  while (true) {
    try {
      const submitResult = await primusNetwork.submitTask(attestParams);
      console.log(`✅ submitTask done (${Date.now() - submitStart}ms):`, submitResult);
      return submitResult;
    } catch (err) {
      attempt++;
      console.warn(`⚠️ submitTask attempt ${attempt} failed:`, err?.message || err);
      if (attempt > maxRetries) {
        console.error(`❌ submitTask failed after ${maxRetries} retries`);
        throw err;
      }
      const delay = baseDelay * 2 ** (attempt - 1);
      console.log(`⏳ Retrying in ${delay} ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function attestWithRetry(primusNetwork, requests, responseResolves, opts, attestParams, submitResult, maxRetries = 3, baseDelay = 1000) {
  let attempt = 0;

  console.log("⚙️ Running attestation...");
  const attestStart = Date.now();
  while (true) {
    let reqs = requests;
    let resps = responseResolves;
    if (opts.requestParamsCallback) {
      const { requests, responseResolves } = opts.requestParamsCallback();
      reqs = requests;
      resps = responseResolves;
    }
    const attestParamsFull = {
      ...attestParams,
      ...submitResult,
      requests: reqs,
      responseResolves: resps,
      sslCipher: opts.sslCipher,
      attMode: { algorithmType: opts.algorithmType },
      specialTask: opts.specialTask,
      noProxy: opts.noProxy,
      getAllJsonResponse: "true",
    };

    try {
      const attestResult = await primusNetwork.attest(attestParamsFull, 5 * 60 * 1000);
      if (!attestResult?.[0]?.attestation) {
        throw new Error("Attestation result invalid or empty");
      }
      console.log(`✅ attest done (${Date.now() - attestStart}ms):`, attestResult);
      return attestResult;
    } catch (err) {
      attempt++;
      console.warn(`⚠️ attest attempt ${attempt} failed:`, err?.message || err);
      if (attempt > maxRetries) {
        console.error(`❌ attest failed after ${maxRetries} retries`);
        throw err;
      }
      const delay = baseDelay * 2 ** (attempt - 1);
      console.log(`⏳ Retrying in ${delay} ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function verifyAndPollTaskResultWithRetry(primusNetwork, attestResult, maxRetries = 5, baseDelay = 1000) {
  let attempt = 0;

  console.log("🔍 Verifying and polling task result...");
  const verifyStart = Date.now();
  while (true) {
    try {
      const taskResult = await primusNetwork.verifyAndPollTaskResult({
        taskId: attestResult[0].taskId,
        reportTxHash: attestResult[0].reportTxHash,
      });
      console.log(`✅ Verification done (${Date.now() - verifyStart}ms):`, taskResult);
      return taskResult;
    } catch (err) {
      attempt++;
      console.warn(`⚠️ verifyAndPollTaskResult attempt ${attempt} failed:`, err?.message || err);
      if (attempt > maxRetries) {
        console.error(`❌ verifyAndPollTaskResult failed after ${maxRetries} retries`);
        throw err;
      }
      const delay = baseDelay * 2 ** (attempt - 1);
      console.log(`⏳ Retrying in ${delay} ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function prepareZkVmRequestData(primusNetwork, taskResult, attestResult) {
  const taskId = attestResult[0].taskId;
  const allPlainResponse = primusNetwork.getAllJsonResponse(taskId);

  if (!allPlainResponse) {
    throw new Error("Unable to get plain JSON response");
  }

  return {
    attestationData: {
      verification_type: "HASH_COMPARSION",
      public_data: attestResult,
      private_data: { plain_json_response: allPlainResponse },
    },
    requestid: taskId,
  };
}

module.exports = { doProve, saveToFile };
