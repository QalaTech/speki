#!/bin/bash

# Qala CLI Install Script
# Creates a global 'qala' command pointing to this repo's built CLI

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QALA_BIN="$SCRIPT_DIR/dist/bin/qala.js"
INSTALL_PATH="/usr/local/bin/qala"

echo "Installing Qala CLI..."
echo ""

# Build first if needed
if [ ! -f "$QALA_BIN" ]; then
    echo "Building TypeScript..."
    cd "$SCRIPT_DIR"
    npm run build
fi

# Make executable
chmod +x "$QALA_BIN"

# Create wrapper script (handles node execution)
echo "Creating global command at $INSTALL_PATH..."

sudo tee "$INSTALL_PATH" > /dev/null << EOF
#!/bin/bash
exec node "$QALA_BIN" "\$@"
EOF

sudo chmod +x "$INSTALL_PATH"

echo ""
echo "Done! Qala CLI installed."
echo ""
echo "Try it out:"
echo "  qala --help"
echo "  qala list"
echo ""
echo "To uninstall:"
echo "  sudo rm $INSTALL_PATH"
