
import fs from "fs";
import { keccak_256 } from "@noble/hashes/sha3";
import { secp256k1 } from "@noble/curves/secp256k1";
import { encodePacked, padTo } from "./lib/encoding";
import { normalizeV } from "./lib/crypto";
import { AttVerifierContract, SuccessEvent } from "./bindings/AttVerifier.js";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { TestWallet } from "@aztec/test-wallet/server";
import { createStore } from "@aztec/kv-store/lmdb";
import { createPXE, getPXEConfig, PXE } from "@aztec/pxe/server";
import { BusinessProgramContract } from "./bindings/BusinessProgram.js";
import { performance } from "perf_hooks";
import { createAztecNodeClient, getDecodedPublicEvents } from "@aztec/aztec.js";
import { Barretenberg, Fr } from "@aztec/bb.js";
import { url } from "inspector";
import { error } from "console";


const MAX_RESPONSE_NUM = 1;
const AllOWED_URL = ["https://api.binance.com/api/v3/account"];
// const ATT_PATH = process.argv[2] ?? "testdata/eth_hash.json";
const ATT_PATH = process.argv[2] ?? "testdata/binance-balances.json";

const node = createAztecNodeClient("http://localhost:8080");
const config = getPXEConfig();
config.proverEnabled = true;
const wallet = await TestWallet.create(node, config);
const [aliceAccount, bobAccount] = await getInitialTestAccountsData();
let alice = await wallet.createSchnorrAccount(aliceAccount.secret, aliceAccount.salt);
let bob = await wallet.createSchnorrAccount(bobAccount.secret, bobAccount.salt);

// deploy attVerifierContract
const attVerifierContract = await AttVerifierContract.deploy(wallet).send({ from: aliceAccount.address })
  .deployed();
console.log("deployed attverifier");

// load attestation testdata
const obj = JSON.parse(fs.readFileSync(ATT_PATH, "utf-8"));

// pack data
const packedArr = encodePacked(obj.public_data[0].attestation);

// signature is 65 bytes (r||s||v)
const sigHex = obj.public_data[0].signature.slice(2);
const sigBytes = Buffer.from(sigHex, "hex");

// extract r, s, v
const r = BigInt("0x" + sigBytes.slice(0, 32).toString("hex"));
const s = BigInt("0x" + sigBytes.slice(32, 64).toString("hex"));
let v = sigBytes[64];
if (v === 27 || v === 28) v -= 27;
const sig = new secp256k1.Signature(r, s, v);

// prepare 64-byte compact signature for Noir circuit input
const signature = Array.from(sig.toCompactRawBytes());

// hash of packed data
const msgHash = keccak_256(new Uint8Array(packedArr));
const hash = Array.from(msgHash);

// recover pubkey
const pubkey = sig.recoverPublicKey(msgHash);

// get raw uncompressed 65 bytes (04 || x || y)
const pubBytes = pubkey.toRawBytes(false);
const public_key_x = Array.from(pubBytes.slice(1, 33));
const public_key_y = Array.from(pubBytes.slice(33, 65));

// request_url
// check if request num > MAX_RESPONSE_NUM
if (obj.public_data[0].attestation.request.length > MAX_RESPONSE_NUM) {
  throw new Error(`request length (${obj.public_data[0].attestation.request.length}) > MAX_RESPONSE_NUM (${MAX_RESPONSE_NUM})`)
}
const requestUrls: (bigint | number)[][] = [];
for (const req of obj.public_data[0].attestation.request) {
  const urlBytes = Array.from(new TextEncoder().encode(req.url));
  requestUrls.push(urlBytes)
}

// repeat the last element till MAX_RESPONSE_NUM 
const diff = MAX_RESPONSE_NUM - requestUrls.length;
for (let i = 0; i < diff; i++) {
  requestUrls.push(requestUrls.at(-1) as number[]);
}

// allowed urls
const allowedUrls: (bigint | number)[][] = [];
for (const url of AllOWED_URL) {
  const url_bytes = Array.from(new TextEncoder().encode(url));
  allowedUrls.push(url_bytes)
}


const id = Math.floor(Math.random() * 9999999999);

// Collect all hashes from public_data.attestation.data
const data_hashes: number[][] = [];
const attData = JSON.parse(obj.public_data[0].attestation.data);
for (const [key, value] of Object.entries(attData)) {
  // for attestation_data_hash.json
  if (key.startsWith("uuid-") && typeof value === "string" && value.length === 64) {
    // Convert each 32-byte hex string into an array of bytes
    const hashBytes = Array.from(Buffer.from(value, "hex"));
    data_hashes.push(hashBytes);
  }
  // for eth_hash.json/binance-balances.json
  if (key.startsWith("hash-of") && typeof value === "string" && value.length === 64) {
    // Convert each 32-byte hex string into an array of bytes
    const hashBytes = Array.from(Buffer.from(value, "hex"));
    data_hashes.push(hashBytes);
  }
}
// repeat the last element of data_hashes till MAX_RESPONSE_NUM 
const data_diff = MAX_RESPONSE_NUM - data_hashes.length;
for (let i = 0; i < data_diff; i++) {
  data_hashes.push(data_hashes.at(-1) as number[]);
}

const plain_json_response: number[][] = [];

if (obj.private_data && Array.isArray(obj.private_data.plain_json_response)) {
  for (const entry of obj.private_data.plain_json_response) {
    if (entry.id && entry.content) {
      // const hashContent = entry.content;
      const hashContent = JSON.stringify(JSON.parse(entry.content)["balances"]);
      // console.log("hashContent:", hashContent);
      const jsonBytes = Array.from(new TextEncoder().encode(hashContent));
      plain_json_response.push(jsonBytes);
    }
  }
}
// repeat the last element of plain_json_response till MAX_RESPONSE_NUM 
const plain_json_diff = MAX_RESPONSE_NUM - plain_json_response.length;
for (let i = 0; i < plain_json_diff; i++) {
  plain_json_response.push(plain_json_response.at(-1) as number[]);
}

const bb = await Barretenberg.new();
const hashedUrls: bigint[] = [];

for (let url of allowedUrls) {
  url = url.slice();
  // pad with zeros to length 1024
  while (url.length < 1024) {
    url.push(0);
  }

  const frArray = url.map(b => new Fr(BigInt(b)));
  const hashFr = await bb.poseidon2Hash(frArray);
  const hashBigInt = BigInt(hashFr.toString());
  hashedUrls.push(hashBigInt);
}

// deploy business program
const businessProgram = await BusinessProgramContract.deploy(wallet, alice.address, hashedUrls)
  .send({ from: aliceAccount.address }) // testAccount has fee juice and is registered in the deployer_wallet
  .deployed();
console.log("deployed business program");

console.log("start verify");
const start = performance.now();
let result: any;
try {
  result = await attVerifierContract.methods.verify_attestation(
    public_key_x,
    public_key_y,
    hash,
    signature,
    requestUrls,
    allowedUrls,
    data_hashes,
    plain_json_response,
    businessProgram.address,
    id
  ).send({ from: aliceAccount.address }).wait();

  // This works for AttVerifier without event emission
  const end = performance.now();
  const duration = (end - start).toFixed(2);

  console.log(result);
  console.log(`Verification call took ${duration} ms`);

  if (result.status != "success") {
    console.log("verification failed");
  }

  const success_event = await getDecodedPublicEvents<SuccessEvent>(
    node,
    AttVerifierContract.events.SuccessEvent,
    result.blockNumber!,
    2
  );
  console.log("Get success event: ", success_event);
} catch (err) {
  if (err && err.message) {
    console.log("verify_attestation failed:", err.message)
  } else {
    console.log("verify_attestation failed:", err)
  }
}
await bb.destroy()
