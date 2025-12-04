#!/bin/bash
set -e

echo "Setting up Token contract..."

# Create deps directory
mkdir -p deps
cd deps

# Clone aztec-packages if not exists
if [ ! -d "aztec-packages" ]; then
    echo "Cloning aztec-packages..."
    git clone --depth 1 --branch v3.0.0-nightly.20251016 https://github.com/AztecProtocol/aztec-packages.git
else
    echo "aztec-packages already exists"
fi

cd aztec-packages/noir-projects/noir-contracts

# Compile token contract with --package flag
echo "Compiling token contract..."
aztec-nargo compile --package token_contract

# Check if target was created
if [ ! -d "target" ]; then
    echo "ERROR: Compilation failed - no target directory created"
    exit 1
fi

echo "Postprocessing contract..."
cd ../../../..  # Back to aztec-demo root

# Note: Post-processing must run from root to find all contracts
aztec-postprocess-contract

echo "Generating TypeScript bindings..."
aztec codegen \
    deps/aztec-packages/noir-projects/noir-contracts/target/token_contract-Token.json \
    -o js_test/bindings \
    -f

# Copy artifact to bindings directory
echo "Copying artifacts..."
cp deps/aztec-packages/noir-projects/noir-contracts/target/token_contract-Token.json \
   js_test/bindings/

# Fix import path in generated binding
echo "Fixing import path..."
sed -i "s|'../../target/token_contract-Token.json'|'./token_contract-Token.json'|g" \
    js_test/bindings/Token.ts

echo "✅ Token contract built successfully!"
echo "TokenContract is now available in js_test/bindings/Token.ts"
