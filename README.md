# Zec-p2p

> Trustless peer-to-peer ZEC-fiat offramp exchange using zkTLS attestations of Revolut payment (using Aztec Network) 

## Overview

**zec-p2p** enables Zcash (ZEC) holders to trustlessly sell their holdings to fiat buyers who pay via Revolut. The system uses [primus-zkTLS](https://docs.primuslabs.xyz/data-verification/tech-intro/) to cryptographically prove off-chain fiat payments, eliminating counterparty risk in P2P crypto-to-fiat exchanges.

### Key Features

- **Trustless Escrow**: ZEC holders deposit tokens into an Aztec smart contract escrow
- **Cryptographic Payment Proofs**: Buyers prove Revolut payments using zkTLS attestations
- **Privacy-Preserving**: Leverages Aztec Network's privacy features for confidential transactions
- **No Intermediaries**: Direct P2P exchange without centralized custody

## Architecture

```
┌──────────────┐  1. Bridge ZEC      ┌──────────────┐  4. Submit Proof   ┌──────────────┐
│    Seller    │  2. Deploy Escrow   │    Aztec     │    + Verify        │    Buyer     │
│ (ZEC Holder) │────────────────────▶│   Network    │◀───────────────────│  (Fiat Payer)│
└──────────────┘  3. Deposit Tokens  │   (Escrow)   │  5. Release Tokens └──────┬───────┘
                                      └──────────────┘                           │
                                                                                  │
                                                              2. Pay Fiat         │
                                                              3. Capture zkTLS    │
                                                                                  │
                                                                                  ▼
                                                                          ┌──────────────┐
                                                                          │   Revolut    │
                                                                          │    UI        │
                                                                          └──────────────┘
```

## User Flow

### For Sellers (ZEC Holders)

1. **Bridge ZEC to Aztec**: Convert ZEC to wrapped tokens on Aztec Network
2. **Create Escrow**: Deploy escrow contract with:
   - Token amount to sell
   - Expected fiat amount & currency (e.g., "10 GBP")
   - Buyer's Revolut username
   - Commitment hash binding these parameters
3. **Deposit Tokens**: Lock tokens in escrow contract
4. **Wait for Payment**: Buyer sends fiat via Revolut off-chain
5. **Automatic Release**: Tokens released to buyer upon valid proof submission

### For Buyers (Fiat Senders)

1. **Find Offer**: Discover seller's escrow offer (off-chain coordination)
2. **Send Fiat Payment**: Transfer exact amount via Revolut to seller
3. **Generate zkTLS Proof**: Capture TLS session with Revolut API proving the transaction
4. **Submit Proof**: Call `fulfill_with_attestation()` with:
   - TLS signature & public key
   - Encrypted Revolut API response
   - Transaction details (amount, username, tx ID)
5. **Receive Tokens**: Escrowed tokens automatically transferred upon proof verification

### Components

1. **Bridge Token**: ZEC is bridged to Aztec Network as a wrapped token
2. **Escrow Contract** (`nr/escrow/`): Holds bridged tokens until payment proof is verified
3. **zkTLS Verifier** (`nr/att_verifier/`): Validates TLS session attestations
4. **Business Logic** (`nr/real_business_program/`): Parses and verifies Revolut transaction data. Could add other payment methods here. 
5. **Commitment Hash**: Binds escrow to specific payment details (amount, currency, recipient, txid)


## Technical Details

### zkTLS Attestation Flow

```
1. Buyer makes Revolut payment (off-chain)
2. Buyer uses primus-zktls extension to notarize the revolut https request returning a tx list
3. Generate attestation:
   - TLS session signature
   - Server public key
   - Encrypted response containing transaction data
4. Submit to AttVerifier contract
5. AttVerifier validates TLS signature
6. BusinessProgram parses transaction JSON
7. Compute commitment hash from parsed data
8. Compare against escrow's expected commitment
9. If match → release tokens to buyer
```

### Commitment Hash

Prevents front-running and binds escrow to specific payment:

```
commitment_hash = poseidon2_hash([
    hash(amount),      // e.g., "-10" (negative = outgoing)
    hash(currency),    // e.g., "GBP"
    hash(username),    // Revolut username
    hash(tx_id)        // Unique transaction ID
])
```

Seller computes this off-chain and includes it in escrow deployment. Buyer's zkTLS proof must produce the same hash.

## Project Structure

```
zec-p2p/
├── nr/                              # Noir smart contracts
│   ├── att_verifier/               # zkTLS attestation verifier
│   ├── real_business_program/      # Revolut transaction parser
│   └── escrow/                     # Token escrow with attestation fulfillment
│
├── js_test/                         # TypeScript SDK & tests
│   ├── bindings/                   # Generated contract bindings
│   ├── lib/                        # Helper libraries
│   │   ├── commitment.ts           # Commitment hash computation
│   │   └── encoding.ts             # Data encoding utilities
│   ├── test/                       # E2E tests
│   │   └── escrow-e2e.test.ts     # Full flow test
│   ├── testdata/                   # Sample zkTLS attestations
│   ├── deploy.ts                   # Contract deployment script
│   └── verify_att.ts               # Standalone attestation verification
│
├── primus-attestation-frontend/    # Demo FE/BE to capture Revolut attestations (from primus-labs/zktls-demo)
│   ├── client/                     # Vite React app (Primus zkTLS JS SDK)
│   └── server/                     # Signing server for attestation requests
│
├── scripts/                         # Build automation
│   ├── build-all.sh                # Compile all contracts & generate bindings
│   ├── build-token.sh              # Build Aztec Token contract
│   └── compile_verifier_and_program.sh
│
└── deps/                            # Build dependencies (gitignored)
```

## Prerequisite

- Aztec CLI/sandbox matching `v3.0.0-nightly.20251016` (installs aztec-nargo)

### Start local sandbox

```bash
PXE_PROVER_ENABLED=1 aztec start --sandbox
```

## Install & Build

```bash
# JS deps
cd js_test
yarn install

# Build contracts + bindings (from js_test/)
yarn build           # runs scripts/build-all.sh and scripts/build-token.sh
# or run individual pieces:
# yarn build:contracts   # AttVerifier, BusinessProgram, Escrow
# yarn build:token       # Token bindings
```

## Running Tests

### E2E Test

Runs full escrow flow with zkTLS proof:

```bash
cd js_test
yarn test:e2e
```

### Generating Your Own Revolut Attestation (Primus zkTLS frontend)

A demo frontend/backend (`primus-attestation-frontend/`, copied from https://github.com/primus-labs/zktls-demo) can capture Revolut attestations:

```bash
# Terminal 1: start the signing server
cd primus-attestation-frontend/server
npm install
node index.js

# Terminal 2: start the client
cd primus-attestation-frontend/client
npm install
npm run dev
```

Open the client in your browser, run the flow, and copy the attestation object printed in the console. Save it to `js_test/testdata/your-attestation.json` (matching the structure of the existing Revolut example) and point your verifier/test to that file.


## Acknowledgments & Inspiration

This project builds upon pioneering work:

- **[zkp2p.xyz](https://zkp2p.xyz)**: Inspiration for trustless fiat on/off-ramping using payment proofs
- **[Primus zkTLS](https://github.com/Envoy-VC/primus-zktls)**: Reference implementation for TLS attestation verification on Aztec
- **[Aztec Pioneers OTC](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts/contracts/otc_escrow_contract)**: Base escrow contract pattern

## Security Considerations

⚠️ **Experimental Software**: This is a proof-of-concept. Do not use with mainnet funds.

## Known Limitations / TODOs

- No seller cancel/refund path yet; once deposited, funds only release via `fulfill_with_attestation()`. Add a private cancel/timeout flow to reclaim escrowed tokens.

## License

MIT


---

**Built with privacy-first principles on [Aztec Network](https://aztec.network)**
