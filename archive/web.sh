#!/bin/bash
# Ralph Web Client Launcher
#
# Usage:
#   ./ralph/web.sh        # Start in development mode
#   ./ralph/web.sh build  # Build for production
#   ./ralph/web.sh prod   # Start production server

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$SCRIPT_DIR/web"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

cd "$WEB_DIR"

case "${1:-dev}" in
  dev)
    echo -e "${GREEN}Starting Ralph Web Client (Development)${NC}"
    echo -e "${CYAN}Frontend: http://localhost:3004${NC}"
    echo -e "${CYAN}API:      http://localhost:3005${NC}"
    echo ""
    npm run dev
    ;;
  build)
    echo -e "${GREEN}Building Ralph Web Client${NC}"
    npm run build
    echo -e "${GREEN}Build complete! Files in: $WEB_DIR/dist${NC}"
    ;;
  prod|start)
    echo -e "${GREEN}Starting Ralph Web Client (Production)${NC}"
    npm run build
    echo -e "${CYAN}Server: http://localhost:3005${NC}"
    npm run start
    ;;
  *)
    echo "Usage: $0 [dev|build|prod]"
    exit 1
    ;;
esac
