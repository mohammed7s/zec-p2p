# Primus Attestation Logic Verifier Contracts

## Workflow

Based on:
https://hackmd.io/zIFf5ChpRfGcT60e2KCRAQ?stext=1549%3A62%3A0%3A1759918279%3AuB_AXk&view=

1. Dapp request data attestation from Primus App
2. Primus runs zktls to generate attestation
3. Primus Apps return attestation
4. Dapp obtains the TLS AES session key from Primus
5. Dapp parses attestation data with primus zkTLS SDK and send a transaction to AttVerifier contract

--------------------on Aztec chain--------------------

6. AttVerifier contract verifies signature, check allowed urls, and decrypts the ciphertext
7. AttVerifier calls BusinessProgram which includes the customized conditions and is deployed by the developers
8. BusinessProgram checks the condition and returns to AttVerifier
9. AttVerifier sends a public "success" event and returns the result


## Components

### att_verifier
Main attestation verifier contract. Includes the logic for signature verification, url check and AES decryption.

### basic_business_program
An interface contract for business program. Provide the ABI for custom business program.

### real_business_program
A testing business program. This is the contract that will be deployed by the developers.

### js_test
JS scripts to deploy and interact with the contracts 

## Installation and versioning

This flow works with the Aztec Sandbox version `3.0.0-nightly20251017`. Follow the documentation [here](https://docs.aztec.network/nightly/developers/getting_started_on_sandbox) to install the sandbox.

This version of the sandbox contains fixes that allows the analysis via [flamegraph](https://docs.aztec.network/nightly/developers/docs/guides/smart_contracts/advanced/writing_efficient_contracts#inspecting-with-flamegraph) of the circuit. Version 2.0.2 has a bug in that functionality. 

## QuickStart
1. Start an Aztec sandbox 
```
PXE_PROVER_ENABLED=1 aztec start --sandbox
```
2. compile att_verifier and real_business_program
```
# inside att_verifier
aztec-nargo compile
aztec-postprocess-contract
aztec codegen -o src/artifacts target

# inside real_business_program
aztec-nargo compile
aztec-postprocess-contract
aztec codegen -o src/artifacts target
```
3. move `---.ts` in `src/artifacts/` and `---.json` in `target` from both `att_verifier` and `real_budiness_program` to `js_test/bindings/`. (Update the import path in `---.ts` for the jsons)

4. run script
```
# inside js_test
yarn
yarn start
```

## Adjust business logic

The current demo in `js_test` and specific business implementation in `real_business_program` takes `js_test/test_data/attestation_data.json` and:
- verifies it is a valid attestation (`AttVerifier`)
- checks the obtained plaintext has screen_name "primus_labs" and a followers_count larger than 1000 ( `BusinessProgram`)

### Aztec business contract

To write a different demo, create your own [Aztec contract](https://docs.aztec.network/) that implements the function
```rust
#[private]
fn verify(plaintext: BoundedVec<u8, 4096>) -> bool {
    // TODO
}
```

See `/real_business_program` for an example of how to parse the plaintext to JSON and obtain values from it. 

### Deploying and calling the contract

In the script you have to:
1. Deploy the `AttVerifier` (ultimately this could be deployed once).
2. Deploy the `BusinessProgram`, specific for your usecase.
3. Parse the data from the `attestation_json` correctly to input to the Aztec smart contract.
4. Call `attVerifierContract.methods.verify_attestation` using the contract address of step (2) as one of the inputs.

See for an example `js_test/index.ts`. Note that currently the [Aztec js SDK](https://docs.aztec.network/nightly/developers/docs/guides/aztec-js) is the only SDK available for contract interaction. 


## Functionality details and limitations

All functionality mentioned below is in the circuit, hence constrained, unless prefaced by "(unconstrained)". The unconstrained functions are used to optimize the circuit by preventing computation from happening withing the circuit itself. 

Note that the call to emit a public log after the attestation is verified is not included in this functionality. (This is not working after upgrade to version `3.0.0-nightly`)

`AttVerifier.verify_attestation`: 
- verifies signature
- verifies `request_url` is the start of 1 of the `allowed_urls`. This is done in 2 steps:
  - (unconstrained) obtain the index of the `allowed_url` it matches with
  - verifies that `allowed_url` is indeed the start of the `request_url`
- decrypts ciphertext
- extract the json part from the plaintext. This is done in 2 steps:
  - (unconstrained) create a new vector `extracted_json` that only contains the json data, using the json_blocks input values
  - verify that `extracted_json` indeed consists of the expected values from the plaintext
- calls `BusinessProgram.verify` with the plaintext

`BusinessProgram.verify`:
- (unconstrained) replaces any non-ascii tokens by a fixed token `?`
- verifies the sanitized array is correct
- parses plaintext into json
- obtains 2 values from the json
- performs assertions on the 2 obtained values

### Design choices / limitations Aztec

The main reason for the form that the current functionality has, is because of the limitations that (private) Aztec smart contract functions have. Mainly:
- limits on input sizes
- limits on memory or circuitsize (we're sometimes not sure what exactly causes the issue)

When a limit seems to be crossed, compilation fails without an error message. 

We've [asked](https://discord.com/channels/1113924620781883405/1425901440748224635) Aztec about the limits and given [example code](https://github.com/ewynx/aztec-contract-question) which crosses the limits. For this, we are awaiting response.  

Design differences because of the limitations (note that "not supported" or "not possible" means compilation fails when incorporating it):
- Input is split into all the different parts obtained from the `attestation_json`, because inputting the full byte array and parsing it is not possible.
- `ciphertexts`: fixed size input instead of using a BoundedVec & small size of ciphertexts array, since a larger array is not supported. Ideally we would offer more flexibility here to support different usecases.
- `allowed_urls`: saving/setting this in storage in either `AttVerifier` or `BusinessProgram` and obtaining it is not supported, so this is currently a direct input value to `verify_attestation`. Furthermore, this is an array of size 2 because larger is not supported.
- `plaintext`: currently the size is set to 4096. Before, we were working with the assumption this could have size 8192 (or larger).
- plaintext sanitization and json parsing is not done in the `AttVerifier`, but in the business logic, otherwise it doesn't work. 


### Limitations of the implementation

- There is no public event emitted after verifying the attestation. We added this previously when still working with `v2.0.2`, and are still trying to make this work after the update
- Only 2 `allowed_urls` are inputted at the moment and they are not public data, as they should be
- This is using a custom fork of the [Noir json_parser](https://github.com/hashcloak/noir_json_parser/releases/tag/v0.4.1-hc.1) that contains a few necessary tweaks

## Benchmarks
### Timing
Calling `verify_attestation` in the ts script using a local Sandbox takes ~10s. 

### Gatecount

`AttVerifier.verify`:

Opcode count: 71055, Total gates by opcodes: 546716, Circuit size: 550167

`BusinessProgram.verify`:

Opcode count: 190939, Total gates by opcodes: 346369, Circuit size: 356400

For flamegraphs of both functions, see `att_verifier-AttVerifier-verify_attestation-flamegraph.svg` and `real_business_program-BusinessProgram-verify-flamegraph.svg`. Note that these can be obtained following [these steps](https://docs.aztec.network/nightly/developers/docs/guides/smart_contracts/advanced/writing_efficient_contracts#inspecting-with-flamegraph). 