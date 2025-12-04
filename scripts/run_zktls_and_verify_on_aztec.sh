#!/bin/bash
set -e
set -x

curdir=$(pwd)

echo "Run zktls to generate attestation"
cd ${curdir}/dvc_client/
node src/demo_binance.js

echo "Verify on Aztec chain"
cd ${curdir}/js_test/
# # deoploy + verify
# yarn start ../dvc_client/binance-attestation.json

# # deploy contracts (could be deployed once)
# yarn start:deploy

# verify attestation
yarn start:verify ../dvc_client/binance-attestation.json
