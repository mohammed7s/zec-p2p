import fs from "fs";
import { keccak_256 } from "@noble/hashes/sha3";
import { secp256k1 } from "@noble/curves/secp256k1";
import { encodePacked } from "./lib/encoding.js";
import crypto from "crypto";

const ATT_PATH = process.argv[2];
if (!ATT_PATH) {
  console.error("Usage: yarn tsx test-signature.ts <attestation.json>");
  process.exit(1);
}

const obj = JSON.parse(fs.readFileSync(ATT_PATH, "utf-8"));

// Detect attestation format
let attestation: any, signature: string;
if (obj.public_data && obj.public_data[0]) {
  console.log("Detected Binance/wrapped format");
  attestation = obj.public_data[0].attestation;
  signature = obj.public_data[0].signature;
} else if (obj.request && obj.signatures) {
  console.log("Detected raw Revolut/Primus format");
  attestation = obj;
  signature = obj.signatures[0];
} else {
  throw new Error("Unknown attestation format!");
}

// Pack data
const packedArr = encodePacked(attestation);
const msgHash = keccak_256(new Uint8Array(packedArr));
console.log("Message hash (keccak):", Buffer.from(msgHash).toString("hex"));

// Signature parsing
const sigHex = signature.slice(2);
const sigBytes = Buffer.from(sigHex, "hex");
const r = BigInt("0x" + sigBytes.slice(0, 32).toString("hex"));
const s = BigInt("0x" + sigBytes.slice(32, 64).toString("hex"));
let v = sigBytes[64];
if (v === 27 || v === 28) v -= 27;
const sig = new secp256k1.Signature(r, s, v);

// Recover pubkey and verify
const pubkey = sig.recoverPublicKey(msgHash);
const isValid = secp256k1.verify(sig, msgHash, pubkey.toRawBytes(false));
console.log("Local signature valid?", isValid);
console.log("Recovered pubkey:", Buffer.from(pubkey.toRawBytes(false)).toString("hex"));

// Show request URLs
const requestArray = Array.isArray(attestation.request) ? attestation.request : [attestation.request];
console.log("Request URLs:", requestArray.map((r: any) => r.url));

// Data hash
if (attestation.data) {
  console.log("attestation.data length:", attestation.data.length);
  console.log("attestation.data sha256:", crypto.createHash("sha256").update(attestation.data).digest("hex"));
}
