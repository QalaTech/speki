#!/bin/bash

# Qala Start Script
# Builds and launches the web dashboard (frontend + API server)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Build CLI packages (core → server → cli)
echo "Building packages..."
npm run build:cli

# Start web frontend (port 3004) and API server (port 3005)
echo ""
echo "Starting Qala dashboard..."
echo "  Web:  http://localhost:3004"
echo "  API:  http://localhost:3005"
echo ""

npm run dev
