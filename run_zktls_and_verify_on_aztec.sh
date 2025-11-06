#!/bin/bash
set -e
set -x

curdir=$(pwd)

echo "Run zktls to generate attestation"
cd ${curdir}/dvc_client/
node src/demo_binance.js

echo "Verify on Aztec chain"
cd ${curdir}/js_test/
yarn start ../dvc_client/binance-attestation.json
