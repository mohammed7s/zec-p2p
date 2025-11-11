const ccxt = require('ccxt');
require('dotenv').config();

const { doProve, saveToFile } = require("./utils.js")

function getBinanaceRequestParams() {
  const key = process.env[`BINANCE_API_KEY`];
  const secret = process.env[`BINANCE_API_SECRET`];
  const recvWindow = Number(process.env.BINANCE_RECV_WINDOW) || 60;

  const exchange = new ccxt['binance']({
    apiKey: key,
    secret: secret
  });

  let signParams = { recvWindow: recvWindow * 1000, omitZeroBalances: true };
  let origRequest = exchange.sign('account', 'private', 'GET', signParams);
  // console.log("origRequest:", origRequest);

  const requests = [
    {
      url: origRequest.url,
      method: "GET",
      header: { ...origRequest.headers },
      body: "",
    },
  ];

  const responseResolves = [
    [
      {
        keyName: "hash-of-balances",
        parseType: "json",
        parsePath: "$.balances",
        op: "SHA256_EX"
      },
    ],
  ];
  return { requests, responseResolves };
}

async function main() {
  const { requests, responseResolves } = getBinanaceRequestParams();
  const zkvmReqeustData = await doProve(requests, responseResolves, {
    requestParamsCallback: getBinanaceRequestParams,
  });
  // console.log("zkvmReqeustData:", JSON.stringify(zkvmReqeustData));
  if (zkvmReqeustData && zkvmReqeustData.attestationData) {
    saveToFile("binance-attestation.json", JSON.stringify(zkvmReqeustData.attestationData));
  }
}

main();
