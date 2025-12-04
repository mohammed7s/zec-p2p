# aztec-demo


## Overview

[Origin README](./README_ORIG.md).

Prove and verify that your spot wallet balance on Binance exceeds 10 USDT.

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

> If you have modified `att_verifier` or `real_business_program`, please rerun this command.


3. Prepare the client environment

```sh
# inside dvc_client/
npm install

# inside js_test/
yarn
```


4. Deploy contracts on Aztec chain.

```sh
# inside js_test/
# deploy contracts (could be deployed once)
yarn start:deploy
```

> If you have modified `att_verifier` or `real_business_program`, please rerun this command.


5. Configure `.env` inside `dvc_client/`.

- Copy `.env.example` to `.env`.
- Set your `PRIVATE_KEY` start with `0x`.
- Set your `BINANCE_API_KEY` and `BINANCE_API_SECRET`.
- Switch the `CHAIN_ID` and `RPC_URL` if you want to run on different chain. (The default is Base Sepolia)


***The previous steps are all preparatory.***


6. Run zktls to generate attestation.

For convenience: This step and the next step can be combined into one step (See 8).

```sh
# inside dvc_client/
node src/demo_binance.js
```

This will generate a `binance-attestation.json` file if successed.

7. Verify on Aztec chain.

```sh
# inside js_test/
yarn start:verify ../dvc_client/binance-attestation.json
```

8. Combine step 6 and step 7.

```sh
bash ./run_zktls_and_verify_on_aztec.sh
```
