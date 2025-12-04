#!/bin/bash
set -e

echo "════════════════════════════════════════════════════════"
echo "  Building All Aztec zkTLS Escrow Contracts & Bindings"
echo "════════════════════════════════════════════════════════"
echo ""

# Get the root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Compile AttVerifier
echo "📦 [1/4] Compiling AttVerifier..."
cd nr/att_verifier
aztec-nargo compile
echo "✓ AttVerifier compiled"

# Compile RealBusinessProgram (Revolut)
echo ""
echo "📦 [2/4] Compiling RealBusinessProgram..."
cd ../real_business_program
aztec-nargo compile
echo "✓ RealBusinessProgram compiled"

# Compile Escrow
echo ""
echo "📦 [3/4] Compiling Escrow..."
cd ../escrow
aztec-nargo compile
echo "✓ Escrow compiled"

# Post-process all contracts
echo ""
echo "🔧 [4/4] Post-processing contracts..."
cd "$ROOT_DIR"
aztec-postprocess-contract || echo "⚠️  Some files failed (stale deps - continuing...)"

# Generate TypeScript bindings
echo ""
echo "📝 Generating TypeScript bindings..."

# AttVerifier
echo "  → AttVerifier..."
aztec codegen \
    nr/att_verifier/target/att_verifier-AttVerifier.json \
    -o js_test/bindings \
    -f
echo "    ✓ Done"

# RealBusinessProgram
echo "  → RealBusinessProgram..."
aztec codegen \
    nr/real_business_program/target/real_business_program-BusinessProgram.json \
    -o js_test/bindings \
    -f
echo "    ✓ Done"

# Escrow
echo "  → Escrow..."
aztec codegen \
    nr/escrow/target/otc_escrow-OTCEscrow.json \
    -o js_test/bindings \
    -f
echo "    ✓ Done"

# Copy artifacts
echo ""
echo "📋 Copying contract artifacts..."
cp nr/att_verifier/target/att_verifier-AttVerifier.json js_test/bindings/ && echo "  ✓ AttVerifier artifact"
cp nr/real_business_program/target/real_business_program-BusinessProgram.json js_test/bindings/ && echo "  ✓ RealBusinessProgram artifact"
cp nr/escrow/target/otc_escrow-OTCEscrow.json js_test/bindings/ && echo "  ✓ Escrow artifact"

# Fix import paths
echo ""
echo "🔗 Fixing import paths..."
sed -i "s|'../../nr/att_verifier/target/att_verifier-AttVerifier.json'|'./att_verifier-AttVerifier.json'|g" js_test/bindings/AttVerifier.ts && echo "  ✓ AttVerifier.ts"
sed -i "s|'../../nr/real_business_program/target/real_business_program-BusinessProgram.json'|'./real_business_program-BusinessProgram.json'|g" js_test/bindings/BusinessProgram.ts && echo "  ✓ BusinessProgram.ts"
sed -i "s|'../../nr/escrow/target/otc_escrow-OTCEscrow.json'|'./otc_escrow-OTCEscrow.json'|g" js_test/bindings/OTCEscrow.ts && echo "  ✓ OTCEscrow.ts"

echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ Build Complete!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Contract bindings generated in: js_test/bindings/"
echo ""
echo "Next steps:"
echo "  • Run Token build: ./scripts/build-token.sh"
echo "  • Run tests: cd js_test && yarn test:e2e"
echo ""
