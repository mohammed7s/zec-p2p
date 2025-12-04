# zec-p2p

> Trustless peer-to-peer ZEC/fiat exchange using zkTLS attestations on Aztec Network

## Overview

**zec-p2p** enables Zcash (ZEC) holders to trustlessly sell their holdings to fiat buyers who pay via Revolut. The system uses zkTLS (zero-knowledge Transport Layer Security) to cryptographically prove off-chain fiat payments, eliminating counterparty risk in P2P crypto-to-fiat exchanges.

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
                                                                          │     API      │
                                                                          └──────────────┘
```

### Components

1. **Bridge Token**: ZEC is bridged to Aztec Network as a wrapped token
2. **Escrow Contract** (`nr/escrow/`): Holds bridged tokens until payment proof is verified
3. **zkTLS Verifier** (`nr/att_verifier/`): Validates TLS session attestations
4. **Business Logic** (`nr/real_business_program/`): Parses and verifies Revolut transaction data
5. **Commitment Hash**: Binds escrow to specific payment details (amount, currency, recipient)

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

## Technical Details

### zkTLS Attestation Flow

```
1. Buyer makes Revolut payment (off-chain)
2. Buyer intercepts TLS handshake with Revolut API
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
├── scripts/                         # Build automation
│   ├── build-all.sh                # Compile all contracts & generate bindings
│   ├── build-token.sh              # Build Aztec Token contract
│   └── compile_verifier_and_program.sh
│
└── deps/                            # Build dependencies (gitignored)
```

## Prerequisites

- **Node.js** 18+ and Yarn
- **Aztec Sandbox** or access to Aztec devnet
- **Aztec CLI Tools**:
  ```bash
  npm install -g @aztec/cli
  ```
- **Noir Compiler** (aztec-nargo):
  ```bash
  # Installed with Aztec CLI
  aztec-nargo --version  # Should be v3.0.0-nightly.20251016
  ```

## Installation

```bash
# Clone repository
git clone <repository-url>
cd aztec-demo

# Install dependencies
cd js_test
yarn install
```

## Building Contracts

### Build All Contracts

```bash
# From project root
./scripts/build-all.sh
```

This compiles:
- AttVerifier
- RealBusinessProgram (Revolut)
- OTCEscrow

And generates TypeScript bindings in `js_test/bindings/`.

### Build Token Contract

```bash
./scripts/build-token.sh
```

Clones Aztec packages and compiles the standard Token contract.

### Manual Build

```bash
# Compile individual contract
cd nr/escrow
aztec-nargo compile

# Post-process (from root)
aztec-postprocess-contract

# Generate bindings
aztec codegen nr/escrow/target/otc_escrow-OTCEscrow.json -o js_test/bindings
```

## Running Tests

### E2E Test

Runs full escrow flow with zkTLS proof:

```bash
cd js_test
yarn test:e2e
```

**Test Flow:**
1. Deploy Token, AttVerifier, BusinessProgram, Escrow
2. Mint tokens to seller
3. Seller deposits tokens into escrow
4. Buyer submits zkTLS proof of Revolut payment
5. Verify tokens transferred to buyer

**Test Data:**
- Amount: -10 GBP (negative = outgoing from seller)
- Revolut username: `optimapqfu`
- Transaction ID: `692edcae-8385-a702-8dde-7452105e2321`

### Standalone Attestation Verification

```bash
cd js_test
yarn verify_att
```

Tests zkTLS signature verification and JSON parsing without escrow.

## Development

### Modifying Business Logic

To support different payment providers:

1. Copy `nr/real_business_program/` to `nr/<provider>_business_program/`
2. Update `verify()` function to parse provider's API response format
3. Compute commitment hash from extracted fields
4. Update escrow to reference new business program address

### Adding Payment Fields

Edit commitment hash in:
- `nr/real_business_program/src/main.nr` (Noir)
- `js_test/lib/commitment.ts` (TypeScript)

Both must compute identical hashes.

### Testing with Real Attestations

1. Capture TLS session with Revolut API
2. Save to `js_test/testdata/`
3. Update test to use new attestation file

## Acknowledgments & Inspiration

This project builds upon pioneering work in zkTLS and decentralized finance:

- **[zkp2p.xyz](https://zkp2p.xyz)**: Inspiration for trustless fiat on/off-ramping using payment proofs
- **[Primus zkTLS](https://github.com/Envoy-VC/primus-zktls)**: Reference implementation for TLS attestation verification on Aztec
- **[Aztec Pioneers OTC](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts/contracts/otc_escrow_contract)**: Base escrow contract pattern

## Security Considerations

⚠️ **Experimental Software**: This is a proof-of-concept. Do not use with mainnet funds.

**Known Limitations:**
- No slashing mechanism for seller misbehavior
- Relies on Revolut API stability
- zkTLS session capture requires specialized tooling
- Bridge security depends on ZEC↔Aztec bridge implementation

## License

MIT

## Contributing

Contributions welcome! Areas for improvement:
- Support for additional payment providers (Venmo, PayPal, Wise)
- Mobile-friendly zkTLS capture tools
- Dispute resolution mechanisms
- Enhanced privacy features

---

**Built with privacy-first principles on [Aztec Network](https://aztec.network)**
