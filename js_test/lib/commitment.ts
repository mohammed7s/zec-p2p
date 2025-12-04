/**
 * Computes the commitment hash for a Revolut transaction
 * Must match the Noir implementation in BusinessProgram.verify()
 */

import { Barretenberg, Fr } from "@aztec/bb.js";

/**
 * Hash a bounded vec (string) to a Field
 * Matches hash_bounded_vec() in Noir
 */
async function hashBoundedVec(bb: Barretenberg, str: string): Promise<Fr> {
    const bytes = Array.from(new TextEncoder().encode(str));
    const fields: Fr[] = [];

    // Fixed size array of 64 (matching Noir)
    for (let i = 0; i < 64; i++) {
        fields.push(new Fr(BigInt(i < bytes.length ? bytes[i] : 0)));
    }

    return await bb.poseidon2Hash(fields);
}

/**
 * Compute commitment hash from Revolut transaction fields
 * @param amount - Transaction amount as string (e.g. "1500")
 * @param currency - Currency code (e.g. "GBP")
 * @param username - Revolut username (e.g. "@seller123")
 * @param txId - Transaction ID (e.g. "abc-123-def")
 * @returns Commitment hash as bigint
 */
export async function computeCommitmentHash(
    amount: string,
    currency: string,
    username: string,
    txId: string
): Promise<bigint> {
    const bb = await Barretenberg.new();

    try {
        // Hash each field separately
        const amountHash = await hashBoundedVec(bb, amount);
        const currencyHash = await hashBoundedVec(bb, currency);
        const usernameHash = await hashBoundedVec(bb, username);
        const txIdHash = await hashBoundedVec(bb, txId);

        // Combine hashes (matching Noir: poseidon2_hash([amount_hash, currency_hash, username_hash, tx_id_hash]))
        const commitmentHash = await bb.poseidon2Hash([
            amountHash,
            currencyHash,
            usernameHash,
            txIdHash
        ]);

        return BigInt(commitmentHash.toString());
    } finally {
        await bb.destroy();
    }
}
