
import fs from "fs";
import { keccak_256 } from "@noble/hashes/sha3";
import { secp256k1 } from "@noble/curves/secp256k1";
import { encodePacked } from "./lib/encoding";
import { AttVerifierContract, SuccessEvent } from "./bindings/AttVerifier.js";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { TestWallet } from "@aztec/test-wallet/server";
import { getPXEConfig } from "@aztec/pxe/server";
import { Fr as aztec_fr } from "@aztec/aztec.js/fields";
import { BusinessProgramContract } from "./bindings/BusinessProgram.js";
import { performance } from "perf_hooks";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { getContractInstanceFromInstantiationParams } from "@aztec/aztec.js/contracts";
import { getDecodedPublicEvents } from "@aztec/aztec.js/events";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { poseidon2Hash } from "@aztec/foundation/crypto";
import { createHash } from "crypto";


const MAX_RESPONSE_NUM = 1;
// Allowed URL(s) for matching request; set to Revolut endpoint for this test case
const AllOWED_URL = ["https://app.revolut.com/api/retail/user/current/transactions/last?count=20&internalPocketId=24e2e5ad-b4f4-4d3b-ac68-0dbd75e021d1"];
// const ATT_PATH = process.argv[2] ?? "testdata/eth_hash.json";
const ATT_PATH = process.argv[2] ?? "testdata/wallet-balances.json";

const node = createAztecNodeClient("http://localhost:8080");
const config = getPXEConfig();
config.proverEnabled = true;
const wallet = await TestWallet.create(node, config);
const [aliceAccount] = await getInitialTestAccountsData();
let alice = await wallet.createSchnorrAccount(aliceAccount.secret, aliceAccount.salt);

// load contract instances data from JSON
const contract_instances_raw = fs.readFileSync("deployed_contract.json", "utf-8");
const contract_instances = JSON.parse(contract_instances_raw);
const att_instance_data = contract_instances.attVerifierContract;
const bp_instance_data = contract_instances.businessProgram;

// register attVerifierContract to the current wallet
const instance_a = await getContractInstanceFromInstantiationParams(AttVerifierContract.artifact, {
  constructorArgs: att_instance_data.constructorArgs,
  salt: aztec_fr.fromString(att_instance_data.salt),
  deployer: AztecAddress.fromString(att_instance_data.deployer),
});
const registered_instance_a = await wallet.registerContract(instance_a, AttVerifierContract.artifact);
const attVerifierContract = await AttVerifierContract.at(registered_instance_a.address, wallet)
// register BusinessProgramContract to the current wallet
const instance_b = await getContractInstanceFromInstantiationParams(BusinessProgramContract.artifact, {
  constructorArgs: bp_instance_data.constructorArgs,
  salt: aztec_fr.fromString(bp_instance_data.salt),
  deployer: AztecAddress.fromString(bp_instance_data.deployer),
});
const registered_instance_b = await wallet.registerContract(instance_b, BusinessProgramContract.artifact);
console.log("AttVerifier class hash:", AttVerifierContract.artifact.hash);
console.log("BusinessProgram class hash:", BusinessProgramContract.artifact.hash);
console.log("Registered AttVerifier address:", registered_instance_a.address.toString());
console.log("Registered BusinessProgram address:", registered_instance_b.address.toString());


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

// Collect hashes from attestation.data; if none exist, hash the full data payload as fallback
const data_hashes: number[][] = [];
const attData = JSON.parse(obj.public_data[0].attestation.data);
for (const [key, value] of Object.entries(attData)) {
  if ((key.startsWith("uuid-") || key.startsWith("hash-of")) && typeof value === "string" && value.length === 64) {
    const hashBytes = Array.from(Buffer.from(value, "hex"));
    data_hashes.push(hashBytes);
  }
}

const plain_json_response: number[][] = [];

if (obj.private_data && Array.isArray(obj.private_data.plain_json_response)) {
  for (const entry of obj.private_data.plain_json_response) {
    if (entry.id && entry.content) {
      const hashContent = entry.content;
      const jsonBytes = Array.from(new TextEncoder().encode(hashContent));
      plain_json_response.push(jsonBytes);
    }
  }
}
if (plain_json_response.length === 0) {
  // Provide the raw attestation.data JSON as the payload
  plain_json_response.push(Array.from(new TextEncoder().encode(obj.public_data[0].attestation.data)));
}
while (plain_json_response.length < MAX_RESPONSE_NUM) {
  plain_json_response.push(plain_json_response.at(-1) as number[]);
}

const hashedUrls: bigint[] = [];

// Align data_hashes[0] with AttVerifier's sha256_var over the actual payload bytes (override for this test)
if (plain_json_response.length > 0) {
  const payloadBuf = Buffer.from(plain_json_response[0]);
  const digest = createHash("sha256").update(payloadBuf).digest();
  data_hashes.length = 0;
  data_hashes.push(Array.from(digest));
}
while (data_hashes.length < MAX_RESPONSE_NUM) {
  data_hashes.push(data_hashes.at(-1) as number[]);
}

console.log("Payload length:", plain_json_response[0]?.length ?? 0);
console.log("Payload preview:", Buffer.from(plain_json_response[0] ?? []).toString().slice(0, 120));
console.log("Payload sha256:", Buffer.from(data_hashes[0] ?? []).toString("hex"));

for (let url of allowedUrls) {
  url = url.slice();
  // pad with zeros to length 1024
  while (url.length < 1024) {
    url.push(0);
  }

  const frArray = url.map(b => BigInt(b));
  const hashFr = await poseidon2Hash(frArray);
  const hashBigInt = hashFr.toBigInt ? hashFr.toBigInt() : BigInt(hashFr.toString());
  hashedUrls.push(hashBigInt);
}
console.log("Verify hashedUrls:", hashedUrls.map(h => "0x" + h.toString(16)));

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
    registered_instance_b.address,
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
