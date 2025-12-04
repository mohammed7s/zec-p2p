#!/bin/bash
set -e

echo "compile att_verifier ..."
cd att_verifier
aztec-nargo compile
aztec-postprocess-contract
aztec codegen -o src/artifacts target

cd ..
echo "compile real_business_program ..."
cd real_business_program
aztec-nargo compile
aztec-postprocess-contract
aztec codegen -o src/artifacts target

cd ..
cp -f real_business_program/target/real_business_program-BusinessProgram.json js_test/bindings/
cp -f real_business_program/src/artifacts/BusinessProgram.ts js_test/bindings/
sed -i "s|\./\.\./target||" js_test/bindings/BusinessProgram.ts

cp -f att_verifier/target/att_verifier-AttVerifier.json js_test/bindings/
cp -f att_verifier/src/artifacts/AttVerifier.ts js_test/bindings/
sed -i "s|\./\.\./target||" js_test/bindings/AttVerifier.ts

echo "DONE"
