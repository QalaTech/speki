#!/bin/bash
set -e

# ============================================
# Ralph PRD Decomposer
# Takes a large PRD and breaks it into small
# Ralph-compatible task files using Claude
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASKS_DIR="$SCRIPT_DIR/tasks"
PROMPT_TEMPLATE="$SCRIPT_DIR/decompose-prompt.md"
LOG_DIR="$SCRIPT_DIR/logs"
STATE_FILE="$SCRIPT_DIR/decompose_state.json"

# Update state file for web client visibility
update_state() {
    local status="$1"
    local message="${2:-}"
    local extra="${3:-}"

    python3 - "$STATE_FILE" "$status" "$message" "$extra" << 'PY'
import sys, json, os
from datetime import datetime

state_file = sys.argv[1]
status = sys.argv[2]
message = sys.argv[3] if len(sys.argv) > 3 else ""
extra = sys.argv[4] if len(sys.argv) > 4 else "{}"

# Load existing state or create new
state = {}
if os.path.exists(state_file):
    try:
        state = json.load(open(state_file))
    except:
        pass

# Update state
state["status"] = status
state["message"] = message
state["updatedAt"] = datetime.now().isoformat()

# Merge extra fields if provided
if extra and extra != "{}":
    try:
        extra_data = json.loads(extra)
        state.update(extra_data)
    except:
        pass

# Write state
with open(state_file, 'w') as f:
    json.dump(state, f, indent=2)
PY
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

usage() {
    echo "Usage: $0 <prd-file.md> [options]"
    echo ""
    echo "Options:"
    echo "  -b, --branch <name>    Branch name for the feature (default: ralph/feature)"
    echo "  -o, --output <name>    Output filename (default: prd.json)"
    echo "  -l, --lang <type>      Language standards to use: dotnet, python, nodejs, go"
    echo "  -f, --fresh            Start from US-001 (ignore existing prd.json numbering)"
    echo "  -r, --redecompose      Force re-decomposition even if draft exists"
    echo "  -v, --verbose          Show full Claude output (not just JSON)"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 docs/big-feature.md -b ralph/auth-system -l dotnet -o auth-tasks.json"
    echo "  $0 docs/python-feature.md -b ralph/atlas-fix -l python"
    echo "  $0 docs/new-feature.md --fresh    # Start fresh from US-001"
    echo "  $0 docs/feature.md -r             # Force re-decomposition"
    exit 1
}

spinner() {
    local pid=$1
    local delay=0.1
    local spinstr='|/-\'
    while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
        local temp=${spinstr#?}
        printf " [%c]  " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b\b\b"
    done
    printf "    \b\b\b\b"
}

# Parse arguments
PRD_FILE=""
BRANCH_NAME="ralph/feature"
OUTPUT_NAME=""  # Will be derived from PRD file if not specified
VERBOSE=false
LANG_TYPE=""
FRESH_START=false
FORCE_REDECOMPOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -b|--branch)
            BRANCH_NAME="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_NAME="$2"
            shift 2
            ;;
        -l|--lang)
            LANG_TYPE="$2"
            shift 2
            ;;
        -f|--fresh)
            FRESH_START=true
            shift
            ;;
        -r|--redecompose)
            FORCE_REDECOMPOSE=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [ -z "$PRD_FILE" ]; then
                PRD_FILE="$1"
            else
                echo -e "${RED}Error: Unknown argument: $1${NC}"
                usage
            fi
            shift
            ;;
    esac
done

# Validate input
if [ -z "$PRD_FILE" ]; then
    echo -e "${RED}Error: No PRD file specified${NC}"
    usage
fi

if [ ! -f "$PRD_FILE" ]; then
    echo -e "${RED}Error: PRD file not found: $PRD_FILE${NC}"
    exit 1
fi

if [ ! -f "$PROMPT_TEMPLATE" ]; then
    echo -e "${RED}Error: Prompt template not found: $PROMPT_TEMPLATE${NC}"
    exit 1
fi

# Derive output name from PRD file if not specified
if [ -z "$OUTPUT_NAME" ]; then
    # Get the base name without extension, add .json
    PRD_BASENAME=$(basename "$PRD_FILE")
    OUTPUT_NAME="${PRD_BASENAME%.*}.json"
fi

# Ensure directories exist
mkdir -p "$TASKS_DIR"
mkdir -p "$LOG_DIR"

# Initialize state
update_state "INITIALIZING" "Setting up decomposition" "{\"prdFile\": \"$PRD_FILE\", \"branch\": \"$BRANCH_NAME\"}"

# Get file size
PRD_SIZE=$(wc -c < "$PRD_FILE" | tr -d ' ')
PRD_LINES=$(wc -l < "$PRD_FILE" | tr -d ' ')

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Ralph PRD Decomposer${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "  ${CYAN}PRD File:${NC}    $PRD_FILE"
echo -e "  ${CYAN}PRD Size:${NC}    ${PRD_SIZE} bytes, ${PRD_LINES} lines"
echo -e "  ${CYAN}Branch:${NC}      $BRANCH_NAME"
echo -e "  ${CYAN}Output:${NC}      $TASKS_DIR/$OUTPUT_NAME"
echo ""

# Create timestamp for log file
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/decompose_${TIMESTAMP}.log"

# Read the PRD content
PRD_CONTENT=$(cat "$PRD_FILE")

# Read the prompt template
PROMPT_TEMPLATE_CONTENT=$(cat "$PROMPT_TEMPLATE")

# Check for existing stories to continue numbering
EXISTING_PRD="$SCRIPT_DIR/prd.json"
NEXT_US_NUMBER=1

if [ "$FRESH_START" = true ]; then
    echo -e "  ${CYAN}Fresh start:${NC} Starting from US-001"
elif [ -f "$EXISTING_PRD" ]; then
    # Extract the highest US number from existing prd.json
    HIGHEST_US=$(python3 -c "
import json
import re
import sys

try:
    with open('$EXISTING_PRD', 'r') as f:
        data = json.load(f)

    max_num = 0
    for story in data.get('userStories', []):
        story_id = story.get('id', '')
        match = re.match(r'US-(\d+)', story_id)
        if match:
            num = int(match.group(1))
            if num > max_num:
                max_num = num
    print(max_num)
except Exception as e:
    print(0, file=sys.stderr)
    print(0)
" 2>/dev/null)

    if [ -n "$HIGHEST_US" ] && [ "$HIGHEST_US" -gt 0 ]; then
        NEXT_US_NUMBER=$((HIGHEST_US + 1))
        echo -e "  ${CYAN}Existing PRD:${NC} Found $HIGHEST_US stories, continuing from US-$(printf '%03d' $NEXT_US_NUMBER)"
    fi
fi

# Show language if specified
if [ -n "$LANG_TYPE" ]; then
    echo -e "  ${CYAN}Language:${NC}    $LANG_TYPE"
fi

# Create the full prompt
FULL_PROMPT=$(cat <<EOF
$PROMPT_TEMPLATE_CONTENT

## Branch Name
$BRANCH_NAME
EOF
)

# Add starting US number if continuing from existing
if [ "$NEXT_US_NUMBER" -gt 1 ]; then
    FULL_PROMPT=$(cat <<EOF
$FULL_PROMPT

## IMPORTANT: Story Numbering
Start story IDs from US-$(printf '%03d' $NEXT_US_NUMBER) (continuing from existing stories).
Do NOT start from US-001.
EOF
)
fi

# Add language hint if provided
if [ -n "$LANG_TYPE" ]; then
    FULL_PROMPT=$(cat <<EOF
$FULL_PROMPT

## Language
$LANG_TYPE

Use this for the \`language\` and \`standardsFile\` fields in the JSON output.
EOF
)
fi

# Add PRD content
FULL_PROMPT=$(cat <<EOF
$FULL_PROMPT

## PRD Content

<prd>
$PRD_CONTENT
</prd>
EOF
)

# Check if draft file already exists - skip to review if so (unless -r flag)
OUTPUT_FILE="$TASKS_DIR/$OUTPUT_NAME"
SKIP_DECOMPOSITION=false

if [ "$FORCE_REDECOMPOSE" = true ] && [ -f "$OUTPUT_FILE" ]; then
    echo ""
    echo -e "${YELLOW}Force re-decomposition requested, removing existing draft...${NC}"
    rm -f "$OUTPUT_FILE"
fi

if [ -f "$OUTPUT_FILE" ]; then
    # Validate it's valid JSON with userStories
    if python3 -c "import json; d=json.load(open('$OUTPUT_FILE')); assert 'userStories' in d and len(d['userStories']) > 0" 2>/dev/null; then
        STORY_COUNT_EXISTING=$(python3 -c "import json; print(len(json.load(open('$OUTPUT_FILE')).get('userStories', [])))" 2>/dev/null)
        echo ""
        echo -e "${YELLOW}============================================${NC}"
        echo -e "${YELLOW}  Existing draft found: $OUTPUT_FILE${NC}"
        echo -e "${YELLOW}  Contains $STORY_COUNT_EXISTING tasks${NC}"
        echo -e "${YELLOW}  Skipping decomposition, going to review...${NC}"
        echo -e "${YELLOW}  (Use -r to force re-decomposition)${NC}"
        echo -e "${YELLOW}============================================${NC}"
        echo ""
        SKIP_DECOMPOSITION=true
        JSON_OUTPUT=$(cat "$OUTPUT_FILE")
        STORY_COUNT_DRAFT=$STORY_COUNT_EXISTING
        update_state "DECOMPOSED" "Using existing draft with $STORY_COUNT_DRAFT tasks, starting review" "{\"storyCount\": $STORY_COUNT_DRAFT, \"draftFile\": \"$OUTPUT_FILE\"}"
    fi
fi

if [ "$SKIP_DECOMPOSITION" = false ]; then
    # Create a temporary file for the prompt
    TEMP_PROMPT=$(mktemp)
    echo "$FULL_PROMPT" > "$TEMP_PROMPT"

    PROMPT_SIZE=$(wc -c < "$TEMP_PROMPT" | tr -d ' ')
    echo -e "  ${CYAN}Total prompt:${NC} ${PROMPT_SIZE} bytes"
    echo ""

    echo -e "${YELLOW}Starting Claude CLI...${NC}"
    echo -e "${BLUE}(This may take 1-3 minutes for large PRDs)${NC}"
    echo ""
    echo -e "Log file: $LOG_FILE"
    echo ""
    echo -e "${CYAN}─────────────────────────────────────────────${NC}"
    echo -e "${CYAN}Claude Output:${NC}"
    echo -e "${CYAN}─────────────────────────────────────────────${NC}"

    # Update state - starting decomposition
    update_state "DECOMPOSING" "Claude is generating tasks from PRD"

# Call Claude with stream-json for real-time output
START_TIME=$(date +%s)

echo ""

# Use stream-json output and extract text content in real-time
# --tools "" disables all tools - we only want JSON output
cat "$TEMP_PROMPT" | claude -p --verbose --output-format stream-json --tools "" 2>"$LOG_FILE.err" | \
    python3 -u "$SCRIPT_DIR/stream_parser.py" "$LOG_FILE" "$LOG_FILE.jsonl"

CLAUDE_EXIT=${PIPESTATUS[1]}

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo -e "  ${CYAN}Time elapsed:${NC} ${ELAPSED} seconds"

if [ $CLAUDE_EXIT -ne 0 ] && [ $CLAUDE_EXIT -ne 141 ]; then
    echo -e "${RED}Claude exited with error code: $CLAUDE_EXIT${NC}"
    ERROR_MSG=$(cat "$LOG_FILE.err" 2>/dev/null | head -1)
    cat "$LOG_FILE.err" 2>/dev/null
    update_state "ERROR" "Claude failed: ${ERROR_MSG:-exit code $CLAUDE_EXIT}"
    exit 1
fi

# Read the output
OUTPUT=$(cat "$LOG_FILE" 2>/dev/null || cat "$LOG_FILE.jsonl" 2>/dev/null | python3 -c '
import sys, json
text = ""
for line in sys.stdin:
    try:
        obj = json.loads(line.strip())
        if obj.get("type") == "result":
            for block in obj.get("message", {}).get("content", []):
                if block.get("type") == "text":
                    text += block.get("text", "")
    except: pass
print(text)
')

echo ""
echo -e "${CYAN}─────────────────────────────────────────────${NC}"
echo ""
echo -e "  ${CYAN}Time elapsed:${NC} ${ELAPSED} seconds"

# Clean up temp file
rm "$TEMP_PROMPT"

# Extract JSON from the output (between ```json and ```)
JSON_OUTPUT=$(echo "$OUTPUT" | sed -n '/```json/,/```/p' | sed '1d;$d')

if [ -z "$JSON_OUTPUT" ]; then
    # Try to find raw JSON (starts with {)
    JSON_OUTPUT=$(echo "$OUTPUT" | grep -A 9999 '^{' | grep -B 9999 '^}' | head -n -0)
fi

if [ -z "$JSON_OUTPUT" ]; then
    # Last resort - try to extract anything that looks like JSON
    JSON_OUTPUT=$(echo "$OUTPUT" | python3 -c "
import sys
import re
content = sys.stdin.read()
# Find JSON object
match = re.search(r'\{[\s\S]*\"userStories\"[\s\S]*\}', content)
if match:
    print(match.group(0))
" 2>/dev/null)
fi

if [ -z "$JSON_OUTPUT" ]; then
    echo -e "${RED}Error: Could not extract JSON from Claude's response${NC}"
    echo ""
    echo -e "Full output saved to: $LOG_FILE"
    echo ""
    echo -e "Try running with ${YELLOW}-v${NC} flag for verbose output"
    update_state "ERROR" "Could not extract JSON from Claude response" "{\"logFile\": \"$LOG_FILE\"}"
    exit 1
fi

# Validate JSON
if ! echo "$JSON_OUTPUT" | python3 -m json.tool > /dev/null 2>&1; then
    echo -e "${RED}Error: Invalid JSON output${NC}"
    echo ""
    echo -e "Extracted JSON saved to: ${LOG_FILE}.json"
    echo "$JSON_OUTPUT" > "${LOG_FILE}.json"
    update_state "ERROR" "Invalid JSON output from Claude" "{\"logFile\": \"${LOG_FILE}.json\"}"
    exit 1
fi

# Save the output
echo "$JSON_OUTPUT" | python3 -m json.tool > "$OUTPUT_FILE"

# Get story count for state
STORY_COUNT_DRAFT=$(echo "$JSON_OUTPUT" | python3 -c "import sys, json; print(len(json.load(sys.stdin).get('userStories', [])))" 2>/dev/null || echo "0")
update_state "DECOMPOSED" "Generated $STORY_COUNT_DRAFT tasks, starting review" "{\"storyCount\": $STORY_COUNT_DRAFT, \"draftFile\": \"$OUTPUT_FILE\"}"

fi  # End of SKIP_DECOMPOSITION=false block

# Auto peer review with retry loop; can disable with RALPH_AUTO_REVIEW=0
REVIEW_PASSED=true
FEEDBACK_JSON="$SCRIPT_DIR/decompose_feedback.json"
MAX_REVIEW_ATTEMPTS="${RALPH_MAX_REVIEW_ATTEMPTS:-3}"
REVIEW_ATTEMPT=1
ALL_REVIEW_LOGS="[]"  # JSON array of all review log paths

if [ "${RALPH_AUTO_REVIEW:-1}" = "1" ] && [ -x "$SCRIPT_DIR/peer_review_decomposition.sh" ]; then
    while [ $REVIEW_ATTEMPT -le $MAX_REVIEW_ATTEMPTS ]; do
        echo ""
        echo -e "${CYAN}Running decomposition peer review (attempt $REVIEW_ATTEMPT/$MAX_REVIEW_ATTEMPTS)...${NC}"
        update_state "REVIEWING" "Codex is reviewing the decomposition (attempt $REVIEW_ATTEMPT/$MAX_REVIEW_ATTEMPTS)"
        "$SCRIPT_DIR/peer_review_decomposition.sh" "$PRD_FILE" "$OUTPUT_FILE" "$FEEDBACK_JSON" || true

        # Capture this review's log path and add to array
        if [ -f "$FEEDBACK_JSON" ]; then
            CURRENT_LOG=$(python3 -c "import json; print(json.load(open('$FEEDBACK_JSON')).get('reviewLog', ''))" 2>/dev/null || echo "")
            if [ -n "$CURRENT_LOG" ]; then
                ALL_REVIEW_LOGS=$(python3 -c "
import json
logs = json.loads('$ALL_REVIEW_LOGS')
logs.append({'attempt': $REVIEW_ATTEMPT, 'path': '$CURRENT_LOG'})
print(json.dumps(logs))
" 2>/dev/null || echo "$ALL_REVIEW_LOGS")
            fi
        fi

        # Check verdict
        if [ -f "$FEEDBACK_JSON" ]; then
            VERDICT=$(python3 -c "import json; print(json.load(open('$FEEDBACK_JSON')).get('verdict', 'UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")
            if [ "$VERDICT" = "PASS" ]; then
                echo -e "  ${GREEN}Review: PASS${NC}"
                update_state "COMPLETED" "Decomposition complete - review passed" "{\"verdict\": \"PASS\", \"storyCount\": $STORY_COUNT_DRAFT, \"reviewLogs\": $ALL_REVIEW_LOGS, \"attempts\": $REVIEW_ATTEMPT}"
                break
            elif [ "$VERDICT" = "FAIL" ]; then
                echo -e "  ${RED}Review: FAIL (attempt $REVIEW_ATTEMPT)${NC}"
                echo -e "  ${YELLOW}Issues:${NC}"
                python3 -c "
import json
fb = json.load(open('$FEEDBACK_JSON'))
for key in ['missingRequirements', 'contradictions', 'dependencyErrors', 'duplicates', 'suggestions']:
    items = fb.get(key, [])
    if items:
        print(f'    {key}:')
        for item in items:
            if isinstance(item, dict):
                # Format structured feedback
                parts = []
                if 'taskId' in item: parts.append(f\"[{item['taskId']}]\")
                if 'taskIds' in item: parts.append(f\"[{', '.join(item['taskIds'])}]\")
                if 'requirement' in item: parts.append(item['requirement'])
                if 'issue' in item: parts.append(item['issue'])
                if 'reason' in item: parts.append(item['reason'])
                if 'action' in item: parts.append(f\"Action: {item['action']}\")
                if 'prdSection' in item: parts.append(f\"(PRD: {item['prdSection']})\")
                print(f'      - {\" \".join(parts)}')
            else:
                print(f'      - {item}')
" 2>/dev/null || true

                # If we have more attempts, send back to Claude for revision
                if [ $REVIEW_ATTEMPT -lt $MAX_REVIEW_ATTEMPTS ]; then
                    echo ""
                    echo -e "${YELLOW}Sending feedback to Claude for revision...${NC}"
                    update_state "REVISING" "Claude is revising tasks based on review feedback (attempt $REVIEW_ATTEMPT)"

                    # Create revision prompt
                    REVISION_PROMPT=$(mktemp)
                    FEEDBACK_CONTENT=$(cat "$FEEDBACK_JSON")
                    CURRENT_TASKS=$(cat "$OUTPUT_FILE")

                    cat > "$REVISION_PROMPT" << REVISION_EOF
You are revising a task decomposition based on peer review feedback.

## INSTRUCTIONS
1. Read the original PRD requirements
2. Review the current tasks JSON
3. Apply the reviewer's feedback to fix ALL issues
4. Output ONLY the corrected JSON - no explanations

## ORIGINAL PRD
<prd>
$PRD_CONTENT
</prd>

## CURRENT TASKS (needs revision)
<tasks>
$CURRENT_TASKS
</tasks>

## REVIEWER FEEDBACK
<feedback>
$FEEDBACK_CONTENT
</feedback>

## REQUIREMENTS
- Fix ALL issues identified in the feedback
- Keep task IDs stable where possible (don't renumber unless necessary)
- Ensure all PRD requirements have corresponding tasks
- Ensure all dependencies reference valid task IDs
- Remove duplicate tasks
- Output ONLY valid JSON in the same format as the input tasks

OUTPUT THE CORRECTED JSON ONLY. NO MARKDOWN, NO EXPLANATIONS.
REVISION_EOF

                    # Call Claude to revise
                    REVISION_LOG="$LOG_DIR/revision_${TIMESTAMP}_attempt${REVIEW_ATTEMPT}.log"
                    echo -e "  ${CYAN}Revision log:${NC} $REVISION_LOG"

                    REVISED_OUTPUT=$(cat "$REVISION_PROMPT" | claude -p --verbose --output-format stream-json --tools "" 2>"$REVISION_LOG.err" | \
                        python3 -u "$SCRIPT_DIR/stream_parser.py" "$REVISION_LOG" "$REVISION_LOG.jsonl")

                    # Read the revised output
                    REVISED_CONTENT=$(cat "$REVISION_LOG" 2>/dev/null || echo "")

                    # Extract JSON from revision
                    REVISED_JSON=$(echo "$REVISED_CONTENT" | python3 -c "
import sys
import re
content = sys.stdin.read()

# Try to find JSON in code blocks first
match = re.search(r'\`\`\`(?:json)?\s*(\{[\s\S]*?\})\s*\`\`\`', content)
if match:
    print(match.group(1))
    sys.exit(0)

# Try to find raw JSON with userStories
match = re.search(r'(\{[\s\S]*\"userStories\"[\s\S]*\})', content)
if match:
    # Find balanced braces
    text = content[match.start():]
    depth = 0
    start = 0
    for i, ch in enumerate(text):
        if ch == '{':
            if depth == 0: start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                print(text[start:i+1])
                sys.exit(0)
" 2>/dev/null)

                    rm "$REVISION_PROMPT"

                    if [ -n "$REVISED_JSON" ] && echo "$REVISED_JSON" | python3 -m json.tool > /dev/null 2>&1; then
                        echo "$REVISED_JSON" | python3 -m json.tool > "$OUTPUT_FILE"
                        STORY_COUNT_DRAFT=$(echo "$REVISED_JSON" | python3 -c "import sys, json; print(len(json.load(sys.stdin).get('userStories', [])))" 2>/dev/null || echo "0")
                        echo -e "  ${GREEN}Revision complete - $STORY_COUNT_DRAFT tasks${NC}"
                    else
                        echo -e "  ${RED}Could not extract valid JSON from revision${NC}"
                        echo -e "  ${YELLOW}Continuing with current tasks...${NC}"
                    fi
                else
                    REVIEW_PASSED=false
                    update_state "COMPLETED" "Decomposition complete - review failed after $MAX_REVIEW_ATTEMPTS attempts" "{\"verdict\": \"FAIL\", \"storyCount\": $STORY_COUNT_DRAFT, \"feedbackFile\": \"$FEEDBACK_JSON\", \"reviewLogs\": $ALL_REVIEW_LOGS, \"attempts\": $REVIEW_ATTEMPT}"
                fi
            else
                echo -e "  ${YELLOW}Review: Could not determine verdict${NC}"
                update_state "COMPLETED" "Decomposition complete - review inconclusive" "{\"verdict\": \"UNKNOWN\", \"storyCount\": $STORY_COUNT_DRAFT, \"reviewLogs\": $ALL_REVIEW_LOGS, \"attempts\": $REVIEW_ATTEMPT}"
                break
            fi
        else
            echo -e "  ${YELLOW}Review: No feedback file generated${NC}"
            update_state "COMPLETED" "Decomposition complete - review error" "{\"verdict\": \"UNKNOWN\", \"storyCount\": $STORY_COUNT_DRAFT, \"reviewLogs\": $ALL_REVIEW_LOGS, \"attempts\": $REVIEW_ATTEMPT}"
            break
        fi

        REVIEW_ATTEMPT=$((REVIEW_ATTEMPT + 1))
    done
else
    update_state "COMPLETED" "Decomposition complete - review skipped" "{\"verdict\": \"SKIPPED\", \"storyCount\": $STORY_COUNT_DRAFT}"
fi

# Count stories and show summary
STORY_COUNT=$(echo "$JSON_OUTPUT" | python3 -c "import sys, json; print(len(json.load(sys.stdin).get('userStories', [])))")
PROJECT_NAME=$(echo "$JSON_OUTPUT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('projectName', 'Unknown'))" 2>/dev/null || echo "Unknown")

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Decomposition Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "  ${CYAN}Project:${NC}         $PROJECT_NAME"
echo -e "  ${CYAN}Stories created:${NC} $STORY_COUNT"
echo -e "  ${CYAN}Output file:${NC}     $OUTPUT_FILE"
echo -e "  ${CYAN}Log file:${NC}        $LOG_FILE"
if [ -f "$FEEDBACK_JSON" ]; then
    echo -e "  ${CYAN}Review feedback:${NC} $FEEDBACK_JSON"
fi
echo ""

# Show first few stories
echo -e "${CYAN}Stories preview:${NC}"
echo "$JSON_OUTPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
stories = data.get('userStories', [])[:5]
for s in stories:
    print(f\"  {s['id']}: {s['title']} (priority: {s['priority']})\")
if len(data.get('userStories', [])) > 5:
    print(f\"  ... and {len(data.get('userStories', [])) - 5} more\")
"

echo ""
if [ "$REVIEW_PASSED" = true ]; then
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Activate tasks: cp $OUTPUT_FILE $SCRIPT_DIR/prd.json"
    echo "  2. Run Ralph: ./ralph/ralph.sh 25"
else
    echo -e "${RED}Review failed - fix issues before activating tasks${NC}"
    echo "  Review feedback: $FEEDBACK_JSON"
fi
echo ""
