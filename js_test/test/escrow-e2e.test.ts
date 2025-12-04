/**
 * E2E Test for zkTLS Escrow
 *
 * Flow:
 * 1. Deploy AttVerifier + BusinessProgram + Token
 * 2. Compute commitment hash for expected Revolut transaction
 * 3. Deploy Escrow with commitment
 * 4. Seller deposits tokens
 * 5. Buyer provides zkTLS proof of Revolut payment
 * 6. Buyer receives tokens from escrow
 */

import { before, describe, test } from "node:test";
import assert from "node:assert";
import fs from "fs";
import { keccak_256 } from "@noble/hashes/sha3";
import { secp256k1 } from "@noble/curves/secp256k1";
import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { AztecAddress, createAztecNodeClient, type AztecNode, getDecodedPublicEvents } from "@aztec/aztec.js";
import { TestWallet } from '@aztec/test-wallet/server';
import { Barretenberg, Fr } from "@aztec/bb.js";
import { createHash } from "crypto";
import { getPXEConfig } from "@aztec/pxe/server";

import { TokenContract } from "../bindings/Token.js";
import { AttVerifierContract } from "../bindings/AttVerifier.js";
import { BusinessProgramContract } from "../bindings/BusinessProgram.js";
import { OTCEscrowContract } from "../bindings/OTCEscrow.js";
import { encodePacked } from "../lib/encoding.js";
import { computeCommitmentHash } from "../lib/commitment.js";

const { AZTEC_NODE_URL = "http://localhost:8080" } = process.env;

// Test constants matching revolut-transfer-wrapped.json
const REVOLUT_URL = "https://app.revolut.com/api/retail/user/current/transactions/last?count=20&internalPocketId=24e2e5ad-b4f4-4d3b-ac68-0dbd75e021d1";
const ATT_PATH = "testdata/revolut-transfer-wrapped.json";

// Transaction details (must match attestation file)
const TX_AMOUNT = "-10";
const TX_CURRENCY = "GBP";
const TX_USERNAME = "optimapqfu";
const TX_ID = "692edcae-8385-a702-8dde-7452105e2321";

const TOKEN_AMOUNT = 1000n * 1000000n; // 1000 USDC (6 decimals)

describe("zkTLS Escrow E2E Test", () => {
    let node: AztecNode;
    let sellerWallet: TestWallet;
    let buyerWallet: TestWallet;
    let sellerAddress: AztecAddress;
    let buyerAddress: AztecAddress;

    let token: TokenContract;
    let attVerifier: AttVerifierContract;
    let businessProgram: BusinessProgramContract;
    let escrow: OTCEscrowContract;

    let commitmentHash: bigint;

    before(async () => {
        console.log("Setting up test environment...");

        // Connect to node
        node = createAztecNodeClient(AZTEC_NODE_URL);
        const config = getPXEConfig();
        config.proverEnabled = true;

        // Create wallets
        sellerWallet = await TestWallet.create(node, config);
        buyerWallet = await TestWallet.create(node, config);

        const [sellerAccount, buyerAccount] = await getInitialTestAccountsData();
        await sellerWallet.createSchnorrAccount(sellerAccount.secret, sellerAccount.salt);
        await buyerWallet.createSchnorrAccount(buyerAccount.secret, buyerAccount.salt);

        sellerAddress = (await sellerWallet.getAccounts())[0].item;
        buyerAddress = (await buyerWallet.getAccounts())[0].item;

        console.log("Seller:", sellerAddress.toString());
        console.log("Buyer:", buyerAddress.toString());

        // Register accounts with each other
        await sellerWallet.registerSender(buyerAddress);
        await buyerWallet.registerSender(sellerAddress);

        // Compute commitment hash
        console.log("Computing commitment hash...");
        commitmentHash = await computeCommitmentHash(TX_AMOUNT, TX_CURRENCY, TX_USERNAME, TX_ID);
        console.log("Commitment hash:", "0x" + commitmentHash.toString(16));

        // Deploy Token
        console.log("Deploying Token...");
        token = await TokenContract.deploy(sellerWallet, sellerAddress, "USDC", "USDC", 6)
            .send({ from: sellerAddress })
            .deployed();
        console.log("Token deployed:", token.address.toString());

        // Mint tokens to seller
        console.log("Minting tokens to seller...");
        await token.methods.mint_to_private(sellerAddress, TOKEN_AMOUNT)
            .send({ from: sellerAddress })
            .wait();

        // Deploy AttVerifier
        console.log("Deploying AttVerifier...");
        attVerifier = await AttVerifierContract.deploy(sellerWallet)
            .send({ from: sellerAddress })
            .deployed();
        console.log("AttVerifier deployed:", attVerifier.address.toString());

        // Hash allowed URL
        const bb = await Barretenberg.new();
        const urlBytes = Array.from(new TextEncoder().encode(REVOLUT_URL));
        while (urlBytes.length < 1024) urlBytes.push(0);
        const frArray = urlBytes.map(b => new Fr(BigInt(b)));
        const hashFr = await bb.poseidon2Hash(frArray);
        const hashedUrl = BigInt(hashFr.toString());
        await bb.destroy();

        // Deploy BusinessProgram
        console.log("Deploying BusinessProgram...");
        businessProgram = await BusinessProgramContract.deploy(sellerWallet, sellerAddress, [hashedUrl])
            .send({ from: sellerAddress })
            .deployed();
        console.log("BusinessProgram deployed:", businessProgram.address.toString());

        // Deploy Escrow
        console.log("Deploying Escrow...");
        escrow = await OTCEscrowContract.deploy(
            sellerWallet,
            token.address,
            TOKEN_AMOUNT,
            commitmentHash,
            attVerifier.address,
            businessProgram.address
        ).send({ from: sellerAddress }).deployed();
        console.log("Escrow deployed:", escrow.address.toString());

        // Register contracts in buyer wallet
        await buyerWallet.registerContract(token);
        await buyerWallet.registerContract(attVerifier);
        await buyerWallet.registerContract(businessProgram);
        await buyerWallet.registerContract(escrow);
    });

    test("full escrow flow", async () => {
        console.log("\n=== Starting Escrow Flow ===\n");

        // 1. Check initial balances
        const sellerBalanceInitial = await token.methods.balance_of_private(sellerAddress).simulate({ from: sellerAddress });
        console.log("Seller initial balance:", sellerBalanceInitial);
        assert.strictEqual(sellerBalanceInitial, TOKEN_AMOUNT);

        // 2. Seller deposits tokens
        console.log("Seller depositing tokens...");

        // Generate nonce and create authwit for the escrow to transfer tokens
        const nonce = BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000));
        const action = token.methods.transfer_in_private(
            sellerAddress,
            escrow.address,
            TOKEN_AMOUNT,
            nonce
        );
        await sellerWallet.createAuthWit(sellerAddress, { caller: escrow.address, action });

        // Now seller can deposit with the authorized nonce
        await escrow.methods.deposit_tokens(nonce)
            .send({ from: sellerAddress })
            .wait();

        const sellerBalanceAfterDeposit = await token.methods.balance_of_private(sellerAddress).simulate({ from: sellerAddress });
        const escrowBalanceAfterDeposit = await token.methods.balance_of_private(escrow.address).simulate({ from: sellerAddress });
        console.log("Seller balance after deposit:", sellerBalanceAfterDeposit);
        console.log("Escrow balance after deposit:", escrowBalanceAfterDeposit);
        assert.strictEqual(escrowBalanceAfterDeposit, TOKEN_AMOUNT);

        // 3. Buyer makes Revolut payment (off-chain - simulated with test data)
        console.log("\n[OFF-CHAIN] Buyer sends Revolut payment...");

        // 4. Buyer prepares attestation proof
        console.log("Buyer preparing attestation proof...");
        const obj = JSON.parse(fs.readFileSync(ATT_PATH, "utf-8"));

        const packedArr = encodePacked(obj.public_data[0].attestation);
        const sigHex = obj.public_data[0].signature.slice(2);
        const sigBytes = Buffer.from(sigHex, "hex");

        const r = BigInt("0x" + sigBytes.slice(0, 32).toString("hex"));
        const s = BigInt("0x" + sigBytes.slice(32, 64).toString("hex"));
        let v = sigBytes[64];
        if (v === 27 || v === 28) v -= 27;
        const sig = new secp256k1.Signature(r, s, v);

        const signature = Array.from(sig.toCompactRawBytes());
        const msgHash = keccak_256(new Uint8Array(packedArr));
        const hash = Array.from(msgHash);

        const pubkey = sig.recoverPublicKey(msgHash);
        const pubBytes = pubkey.toRawBytes(false);
        const public_key_x = Array.from(pubBytes.slice(1, 33));
        const public_key_y = Array.from(pubBytes.slice(33, 65));

        const requestUrls: (bigint | number)[][] = [];
        for (const req of obj.public_data[0].attestation.request) {
            requestUrls.push(Array.from(new TextEncoder().encode(req.url)));
        }

        const allowedUrls: (bigint | number)[][] = [Array.from(new TextEncoder().encode(REVOLUT_URL))];

        const plain_json_response: number[][] = [];
        if (obj.private_data?.plain_json_response) {
            for (const entry of obj.private_data.plain_json_response) {
                if (entry.content) {
                    plain_json_response.push(Array.from(new TextEncoder().encode(entry.content)));
                }
            }
        }
        if (plain_json_response.length === 0) {
            plain_json_response.push(Array.from(new TextEncoder().encode(obj.public_data[0].attestation.data)));
        }

        const data_hashes: number[][] = [];
        const payloadBuf = Buffer.from(plain_json_response[0]);
        const digest = createHash("sha256").update(payloadBuf).digest();
        data_hashes.push(Array.from(digest));

        const id = Math.floor(Math.random() * 9999999999);

        // 5. Buyer fulfills escrow with attestation
        console.log("Buyer calling fulfill_with_attestation...");
        await escrow.withWallet(buyerWallet)
            .methods.fulfill_with_attestation(
                public_key_x,
                public_key_y,
                hash,
                signature,
                requestUrls,
                allowedUrls,
                data_hashes,
                plain_json_response,
                id
            )
            .send({ from: buyerAddress })
            .wait();

        // 6. Verify final balances
        console.log("\n=== Verifying Final Balances ===");
        const buyerBalanceFinal = await token.methods.balance_of_private(buyerAddress).simulate({ from: buyerAddress });
        const escrowBalanceFinal = await token.methods.balance_of_private(escrow.address).simulate({ from: buyerAddress });

        console.log("Buyer final balance:", buyerBalanceFinal);
        console.log("Escrow final balance:", escrowBalanceFinal);

        assert.strictEqual(buyerBalanceFinal, TOKEN_AMOUNT);
        assert.strictEqual(escrowBalanceFinal, 0n);

        console.log("\n✅ E2E Test Passed!");
    });
});
