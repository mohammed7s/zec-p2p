# aztec-demo


## Overview

[Origin README](./README_ORIG.md).

Prove that you hold spot ETH on Binance and that your ETH balance (free + locked) is greater than 0.1.

## Installation

Follow the documentation [here](https://nodejs.org/en/download) to install the nodejs (v22+) and enable yarn.

Follow the documentation [here](https://docs.aztec.network/nightly/developers/getting_started_on_sandbox) to install the sandbox.

**IMPORTANT!** Using the Aztec Sandbox version `3.0.0-nightly20251016`:

```sh
aztec-up 3.0.0-nightly.20251016
docker tag aztecprotocol/aztec:3.0.0-nightly.20251016 aztecprotocol/aztec:latest
```

Checking by `aztec --version` will output `3.0.0-nightly.20251016`.


## Quick Start

1. Start an Aztec sandbox

```sh
PXE_PROVER_ENABLED=1 aztec start --sandbox
```

2. Compile att_verifier and real_business_program

```sh
# in current folder
bash ./compile_verifier_and_program.sh
```

3. Prepare the client environment

```sh
# inside dvc_client/
npm install

# inside js_test/
yarn
```

4. Configure `.env` inside `dvc_client/`.

- Copy `.env.example` to `.env`.
- Set your `PRIVATE_KEY` start with `0x`.
- Set your `BINANCE_API_KEY` and `BINANCE_API_SECRET`.
- Switch the `CHAIN_ID` and `RPC_URL` if you want to run on different chain. (The default is Base Sepolia)


***The previous steps are all preparatory.***


5. Run zktls to generate attestation.

For convenience: This step and the next step can be combined into one step (See 7).

```sh
# inside dvc_client/
node src/demo_binance.js
```

This will generate a `binance-attestation.json` file if successed.

6. Verify on Aztec chain.

```sh
# inside js_test/
yarn start ../dvc_client/binance-attestation.json
```

7. Combine step 5 and step 6.

```sh
bash ./run_zktls_and_verify_on_aztec.sh
```
