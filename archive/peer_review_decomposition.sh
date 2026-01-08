#!/usr/bin/env bash
set -euo pipefail

# Decomposition Peer Review
#
# Compare the source PRD (markdown) with the decomposed task JSON using codex.
# Returns PASS/FAIL verdict - does not modify the tasks.
#
# Usage: ralph/peer_review_decomposition.sh <prd.md> <tasks.json> [feedback.json]
#   prd.md        The original PRD markdown file used for decomposition
#   tasks.json    The decomposed tasks JSON (Ralph format)
#   feedback.json Where to write the review verdict (default: ralph/decompose_feedback.json)
#
# Environment:
#   PEER_REVIEWER_CMD (default: codex exec)
#
# Output format:
# {
#   "verdict": "PASS" or "FAIL",
#   "missingRequirements": [...],
#   "contradictions": [...],
#   "dependencyErrors": [...],
#   "duplicates": [...]
# }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Use codex exec for non-interactive mode
REVIEWER_CMD="${PEER_REVIEWER_CMD:-codex exec}"

PRD_MD=""; TASKS_JSON=""; FEEDBACK_JSON="$SCRIPT_DIR/decompose_feedback.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    *)
      if [[ -z "$PRD_MD" ]]; then PRD_MD="$1"; shift; continue; fi
      if [[ -z "$TASKS_JSON" ]]; then TASKS_JSON="$1"; shift; continue; fi
      if [[ "$FEEDBACK_JSON" == "$SCRIPT_DIR/decompose_feedback.json" ]]; then FEEDBACK_JSON="$1"; shift; continue; fi
      shift ;;
  esac
done

if [[ -z "$PRD_MD" || -z "$TASKS_JSON" ]]; then
  echo "Usage: $0 <prd.md> <tasks.json> [feedback.json] [updated.json]" >&2
  exit 1
fi

if [[ ! -f "$PRD_MD" ]]; then
  echo "PRD markdown not found: $PRD_MD" >&2
  exit 1
fi
if [[ ! -f "$TASKS_JSON" ]]; then
  echo "Tasks JSON not found: $TASKS_JSON" >&2
  exit 1
fi

mkdir -p "$SCRIPT_DIR/logs"
TMP_PROMPT="$(mktemp)"
TMP_RAW="$(mktemp)"

PRD_TEXT=$(cat "$PRD_MD")
TASKS=$(cat "$TASKS_JSON")

cat > "$TMP_PROMPT" << EOF
YOU ARE A DOCUMENT REVIEWER ONLY.

DO NOT:
- Generate any code
- Make any code changes
- Use any tools
- Execute any commands
- Give implementation suggestions

YOUR ONLY TASK: Compare the PRD document to the Tasks JSON and output a verdict.

## OUTPUT FORMAT
Reply with ONLY valid JSON in this exact structure:
{
  "verdict": "PASS" or "FAIL",
  "missingRequirements": [
    {"requirement": "description of missing PRD requirement", "prdSection": "section name from PRD"}
  ],
  "contradictions": [
    {"taskId": "US-XXX", "issue": "description of how task contradicts PRD", "prdSection": "relevant PRD section"}
  ],
  "dependencyErrors": [
    {"taskId": "US-XXX", "issue": "description of dependency problem", "dependsOn": "US-YYY or missing task"}
  ],
  "duplicates": [
    {"taskIds": ["US-XXX", "US-YYY"], "reason": "why these tasks overlap"}
  ],
  "suggestions": [
    {"taskId": "US-XXX or null for new task", "action": "specific actionable fix"}
  ]
}

## VERDICT RULES
- "PASS" = All PRD requirements are covered by tasks, dependencies are valid, no contradictions
- "FAIL" = One or more of:
  - Missing PRD requirements (not covered by any task)
  - Tasks contradict the PRD
  - Invalid dependencies (depend on non-existent tasks)
  - Significant duplicate tasks

## REVIEW CHECKLIST
1. List all requirements from the PRD
2. For each requirement, find the task(s) that implement it
3. For each task, verify its dependencies exist
4. Check for tasks that do the same thing
5. Verify task descriptions match PRD intent

## IMPORTANT
- Always reference task IDs (e.g., US-001, US-002) when discussing specific tasks
- Be specific about which PRD section is missing or contradicted
- Provide actionable suggestions for fixing issues
- Keep suggestions concise but specific

RESPOND WITH ONLY THE JSON. NO OTHER TEXT.

===== PRD DOCUMENT =====
$PRD_TEXT

===== TASKS JSON =====
$TASKS
EOF

if ! command -v codex >/dev/null 2>&1; then
  cat > "$FEEDBACK_JSON" <<JSON
{
  "overall": "Peer reviewer CLI '$REVIEWER_CMD' not found. Skipping decomposition review.",
  "coverage": { "sections": [], "summary": { "taskCount": 0, "unmapped": [], "missing": ["Reviewer CLI not available"] } },
  "issues": [],
  "suggestions": [ { "id": "SETUP-1", "action": "Install PEER_REVIEWER_CMD (e.g., codex) to enable decomposition peer review." } ]
}
JSON
  if [[ $PRINT_FINAL_ONLY -eq 1 ]]; then
    cat "$TASKS_JSON"
    exit 0
  fi
  echo "Decomposition review: reviewer CLI '$REVIEWER_CMD' not found. Wrote stub to $FEEDBACK_JSON" >&2
  rm -f "$TMP_PROMPT" "$TMP_RAW"
  exit 0
fi

set +e
# Capture full codex output to a timestamped log file
REVIEW_LOG="$SCRIPT_DIR/logs/peer_review_$(date +%Y%m%d_%H%M%S).log"
# Use --output-last-message to get just the response without headers/thinking
cat "$TMP_PROMPT" | codex exec --output-last-message "$TMP_RAW" - > "$REVIEW_LOG" 2>&1
STATUS=$?
echo "Peer review log: $REVIEW_LOG" >&2
set -e

# Parse JSON from reviewer output - be robust about extracting JSON from mixed text
python3 - "$TMP_RAW" "$FEEDBACK_JSON" << 'PY'
import sys, json, re

raw = open(sys.argv[1], 'r', encoding='utf-8').read()
out_feedback = sys.argv[2]

def extract_json(text: str):
    # Try direct parse first
    try:
        return json.loads(text.strip())
    except:
        pass

    # Try to find JSON in markdown code blocks
    m = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', text)
    if m:
        try:
            return json.loads(m.group(1))
        except:
            pass

    # Find all potential JSON objects with "verdict" key
    for m in re.finditer(r'\{[^{}]*"verdict"[^{}]*\}', text):
        try:
            return json.loads(m.group(0))
        except:
            pass

    # Try to find any JSON object by matching braces
    start = text.find('{')
    while start != -1:
        depth = 0
        for i, ch in enumerate(text[start:], start=start):
            if ch == '{': depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    try:
                        obj = json.loads(text[start:i+1])
                        if 'verdict' in obj:
                            return obj
                    except:
                        pass
                    break
        start = text.find('{', start + 1)

    # Last resort: only trust explicit FAIL, otherwise return None for UNKNOWN
    if 'FAIL' in text.upper():
        return {"verdict": "FAIL", "issues": ["Review indicated failure but JSON not parseable"]}

    return None

data = extract_json(raw)
if data is None:
    fb = {"verdict": "UNKNOWN", "issues": ["Reviewer output could not be parsed as JSON"]}
    open(out_feedback, 'w').write(json.dumps(fb, indent=2))
    sys.exit(0)

# Ensure verdict key exists
if 'verdict' not in data:
    data['verdict'] = 'UNKNOWN'

open(out_feedback, 'w').write(json.dumps(data, indent=2))
PY

# Add log file path to feedback
python3 -c "
import json
fb = json.load(open('$FEEDBACK_JSON'))
fb['reviewLog'] = '$REVIEW_LOG'
json.dump(fb, open('$FEEDBACK_JSON', 'w'), indent=2)
"

echo "Decomposition review: wrote feedback to $FEEDBACK_JSON"
echo "Review log available at: $REVIEW_LOG"
rm -f "$TMP_PROMPT" "$TMP_RAW"
