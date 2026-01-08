#!/bin/bash
set -e

MAX_ITERATIONS=${1:-10}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_FILE="$SCRIPT_DIR/prd.json"
STATUS_FILE="$SCRIPT_DIR/.ralph-status.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Status file management
write_status() {
  local status="$1"
  local iteration="$2"
  local story="$3"
  cat > "$STATUS_FILE" << EOF
{
  "running": $([[ "$status" == "running" ]] && echo "true" || echo "false"),
  "status": "$status",
  "pid": $$,
  "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "currentIteration": $iteration,
  "maxIterations": $MAX_ITERATIONS,
  "currentStory": "$story"
}
EOF
}

cleanup_status() {
  rm -f "$STATUS_FILE"
}

# Clean up status file on exit
trap cleanup_status EXIT INT TERM

# Get project info from prd.json
PROJECT_NAME=$(python3 -c "import json; print(json.load(open('$PRD_FILE')).get('projectName', 'Unknown'))" 2>/dev/null || echo "Unknown")
BRANCH_NAME=$(python3 -c "import json; print(json.load(open('$PRD_FILE')).get('branchName', 'unknown'))" 2>/dev/null || echo "unknown")
TOTAL_STORIES=$(python3 -c "import json; print(len(json.load(open('$PRD_FILE')).get('userStories', [])))" 2>/dev/null || echo "0")

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  ${CYAN}Ralph Loop${NC} ${BOLD}- Structured Task Runner                        ║${NC}"
echo -e "${BOLD}╠═══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║${NC}  Project: ${CYAN}$PROJECT_NAME${NC}"
echo -e "${BOLD}║${NC}  Branch:  ${YELLOW}$BRANCH_NAME${NC}"
echo -e "${BOLD}║${NC}  Stories: ${GREEN}$TOTAL_STORIES${NC} total"
echo -e "${BOLD}║${NC}  Max iterations: $MAX_ITERATIONS"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Initial status
write_status "starting" 0 ""

for i in $(seq 1 $MAX_ITERATIONS); do
  # Run peer review before each iteration to catch PRD/task issues early
  if [ -x "$SCRIPT_DIR/peer_review.sh" ]; then
    echo -e "${CYAN}Running peer review (Codex) on prd.json...${NC}"
    "$SCRIPT_DIR/peer_review.sh" "$PRD_FILE" "$SCRIPT_DIR/peer_feedback.json" || true
    echo -e "${CYAN}Peer feedback saved to:${NC} $SCRIPT_DIR/peer_feedback.json"
  else
    echo -e "${YELLOW}Peer review script not found or not executable: ralph/peer_review.sh${NC}"
  fi
  # Get current story info with dependency awareness
  STORY_COUNTS=$(python3 -c "
import json
d = json.load(open('$PRD_FILE'))
all_stories = d.get('userStories', [])
completed_ids = {s['id'] for s in all_stories if s.get('passes')}
completed = len(completed_ids)

def deps_satisfied(story):
    return all(dep in completed_ids for dep in story.get('dependencies', []))

incomplete = [s for s in all_stories if not s.get('passes')]
ready = len([s for s in incomplete if deps_satisfied(s)])
blocked = len(incomplete) - ready

print(f'{completed}|{ready}|{blocked}')
" 2>/dev/null || echo "0|0|0")

  COMPLETED=$(echo "$STORY_COUNTS" | cut -d'|' -f1)
  READY_COUNT=$(echo "$STORY_COUNTS" | cut -d'|' -f2)
  BLOCKED_COUNT=$(echo "$STORY_COUNTS" | cut -d'|' -f3)
  REMAINING=$((TOTAL_STORIES - COMPLETED))

  NEXT_STORY_INFO=$(python3 -c "
import json
d = json.load(open('$PRD_FILE'))
all_stories = d.get('userStories', [])

# Build lookup of completed story IDs
completed_ids = {s['id'] for s in all_stories if s.get('passes')}

# Filter to incomplete stories with all dependencies satisfied
def deps_satisfied(story):
    deps = story.get('dependencies', [])
    return all(dep_id in completed_ids for dep_id in deps)

ready_stories = [s for s in all_stories if not s.get('passes') and deps_satisfied(s)]
blocked_stories = [s for s in all_stories if not s.get('passes') and not deps_satisfied(s)]

# Sort by priority
ready_stories.sort(key=lambda x: x.get('priority', 999))

if ready_stories:
    s = ready_stories[0]
    print(f\"READY|{s['id']}: {s['title']}\")
elif blocked_stories:
    # All remaining stories are blocked by dependencies
    b = blocked_stories[0]
    missing = [dep for dep in b.get('dependencies', []) if dep not in completed_ids]
    print(f\"BLOCKED|{b['id']}: {b['title']}|Waiting on: {', '.join(missing)}\")
else:
    print('ALL COMPLETE|')
" 2>/dev/null || echo "UNKNOWN|Unknown")

  # Parse the result
  STORY_STATUS=$(echo "$NEXT_STORY_INFO" | cut -d'|' -f1)
  NEXT_STORY=$(echo "$NEXT_STORY_INFO" | cut -d'|' -f2)
  BLOCKED_REASON=$(echo "$NEXT_STORY_INFO" | cut -d'|' -f3)

  echo ""
  echo -e "${BOLD}┌─────────────────────────────────────────────────────────────────┐${NC}"
  echo -e "${BOLD}│${NC}  ${BLUE}Iteration $i / $MAX_ITERATIONS${NC}                                         ${BOLD}│${NC}"
  echo -e "${BOLD}│${NC}  Progress: ${GREEN}$COMPLETED${NC}/${TOTAL_STORIES} complete (${GREEN}$READY_COUNT${NC} ready, ${YELLOW}$BLOCKED_COUNT${NC} blocked)   ${BOLD}│${NC}"
  echo -e "${BOLD}├─────────────────────────────────────────────────────────────────┤${NC}"
  if [ "$STORY_STATUS" = "BLOCKED" ]; then
    echo -e "${BOLD}│${NC}  ${RED}⏸ Blocked:${NC} $NEXT_STORY"
    echo -e "${BOLD}│${NC}  ${YELLOW}$BLOCKED_REASON${NC}"
  else
    echo -e "${BOLD}│${NC}  ${CYAN}▶ Next:${NC} $NEXT_STORY"
  fi
  echo -e "${BOLD}└─────────────────────────────────────────────────────────────────┘${NC}"
  echo ""

  # Update status with current story
  write_status "running" "$i" "$NEXT_STORY"

  if [ "$STORY_STATUS" = "ALL COMPLETE" ]; then
    echo -e "${GREEN}All stories already complete!${NC}"
    exit 0
  fi

  if [ "$STORY_STATUS" = "BLOCKED" ]; then
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ⛔ All remaining stories are blocked by dependencies         ║${NC}"
    echo -e "${RED}║  Check prd.json for circular or unmet dependencies            ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
    exit 1
  fi

  # Use stream-json for real-time output
  TEMP_OUTPUT=$(mktemp)
  START_TIME=$(date +%s)

  echo -e "${YELLOW}Starting Claude...${NC}"
  echo ""

  # Debug: save raw JSONL for inspection
  JSONL_FILE="$SCRIPT_DIR/logs/iteration_${i}.jsonl"
  mkdir -p "$SCRIPT_DIR/logs"

  cat "$SCRIPT_DIR/prompt.md" \
    | claude --dangerously-skip-permissions --print --verbose --output-format stream-json 2>"$SCRIPT_DIR/logs/iteration_${i}.err" \
    | tee "$JSONL_FILE" \
    | python3 -u "$SCRIPT_DIR/stream_parser.py" "$TEMP_OUTPUT" /dev/null || true

  echo ""
  echo -e "  ${CYAN}JSONL saved:${NC} $JSONL_FILE"

  END_TIME=$(date +%s)
  ELAPSED=$((END_TIME - START_TIME))

  OUTPUT=$(cat "$TEMP_OUTPUT" 2>/dev/null || echo "")
  rm -f "$TEMP_OUTPUT"

  echo ""
  echo -e "  ${CYAN}Duration:${NC} ${ELAPSED}s"

  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ All stories complete!                                      ║${NC}"
    echo -e "${GREEN}║  Finished at iteration $i                                       ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    exit 0
  fi

  # Show updated progress after iteration
  NEW_COMPLETED=$(python3 -c "import json; d=json.load(open('$PRD_FILE')); print(len([s for s in d.get('userStories',[]) if s.get('passes')]))" 2>/dev/null || echo "0")
  if [ "$NEW_COMPLETED" -gt "$COMPLETED" ]; then
    echo -e "  ${GREEN}✓ Story completed!${NC} ($COMPLETED → $NEW_COMPLETED)"
  else
    echo -e "  ${YELLOW}⚠ No story marked complete this iteration${NC}"
  fi

  echo ""
  echo -e "${BLUE}───────────────────────────────────────────────────────────────────${NC}"
  sleep 2
done

echo ""
echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  ⚠ Max iterations ($MAX_ITERATIONS) reached                            ║${NC}"
echo -e "${YELLOW}║  Check prd.json for remaining stories                         ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════════╝${NC}"
exit 1
