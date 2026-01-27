#!/bin/bash

# Qala Update Script
# Rebuilds all packages, clears stale build caches, and updates all registered projects

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Updating Qala..."
echo ""

# Clear stale TypeScript build caches
echo "Clearing build caches..."
find "$SCRIPT_DIR/packages" -name "tsconfig.tsbuildinfo" -delete 2>/dev/null || true
rm -rf "$SCRIPT_DIR/packages/core/dist" \
       "$SCRIPT_DIR/packages/server/dist" \
       "$SCRIPT_DIR/packages/cli/dist" \
       "$SCRIPT_DIR/packages/web/dist" 2>/dev/null || true

# Rebuild all packages
echo "Building packages..."
cd "$SCRIPT_DIR"
npm run build

# Make CLI executable
chmod +x "$SCRIPT_DIR/packages/cli/dist/index.js"

# Update all registered projects
echo ""
echo "Updating all registered projects..."
qala update --all

echo ""
echo "Done! All packages rebuilt and projects updated."
