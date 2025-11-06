import { keccak_256 } from "@noble/hashes/sha3";

// normalize recovery id to 0 or 1
export function normalizeV(v: number): number {
  if (v === 27 || v === 28) return v - 27;
  if (v >= 35) return (v - 35) % 2; // EIP-155
  if (v === 0 || v === 1) return v;
  throw new Error(`Unsupported recovery id: ${v}`);
}

// derive Ethereum address from uncompressed pubkey
export function pubkeyToEthAddress(pubkey: Uint8Array): string {
  if (pubkey.length !== 65 || pubkey[0] !== 0x04) {
    throw new Error("Expected uncompressed pubkey (65 bytes, 0x04 prefix)");
  }
  const hash = keccak_256(pubkey.slice(1)); // hash x||y
  return "0x" + Buffer.from(hash.slice(-20)).toString("hex");
}
