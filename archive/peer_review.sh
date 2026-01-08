#!/usr/bin/env bash
set -euo pipefail

# Peer review driver for Ralph
#
# Purpose: Invoke a local reviewer CLI (e.g., codex) to review ralph/prd.json
#          and produce structured feedback Claude can apply.
#
# Usage: ralph/peer_review.sh [prd_path] [output_path]
#  - prd_path:     Path to PRD JSON (default: ralph/prd.json)
#  - output_path:  Path to write feedback JSON (default: ralph/peer_feedback.json)
#
# Configuration:
#  - Set PEER_REVIEWER_CMD to the CLI you want to use (default: codex)
#  - The reviewer should read prompt from stdin and print text to stdout.
#
# Output format (JSON expected):
# {
#   "overall": string,
#   "coverage": { "total": number, "gaps": [string] },
#   "issues": [ { "id": string, "title": string, "problem": string } ],
#   "suggestions": [ { "id": string, "action": string } ],
#   "blocking": [ string ],
#   "updatedTasks": [ /* optional: updated userStories */ ]
# }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_PATH="${1:-$SCRIPT_DIR/prd.json}"
OUT_PATH="${2:-$SCRIPT_DIR/peer_feedback.json}"
# Use codex exec for non-interactive mode
REVIEWER_CMD="${PEER_REVIEWER_CMD:-codex exec}"

if [[ ! -f "$PRD_PATH" ]]; then
  echo "Peer review: PRD not found: $PRD_PATH" >&2
  exit 0
fi

mkdir -p "$SCRIPT_DIR/logs"
TMP_PROMPT="$(mktemp)"
TMP_RAW="$(mktemp)"

PRD_JSON=$(cat "$PRD_PATH")

cat > "$TMP_PROMPT" << 'EOF'
You are a peer reviewer. Your job is PASS/FAIL review only.

CRITICAL RULES:
- DO NOT invent new requirements
- DO NOT add nice-to-haves or suggestions
- ONLY check for clear errors in the tasks
- If tasks are reasonable, mark PASS

Review checklist (ONLY these items):
1. Are dependencies in logical order?
2. Are there duplicate tasks?
3. Are acceptance criteria testable (not vague)?
4. Any obvious contradictions?

Output format - MUST be valid JSON:
```json
{
  "verdict": "PASS" or "FAIL",
  "issues": ["specific issue 1", "specific issue 2"]
}
```

If verdict is PASS, issues should be empty.
If verdict is FAIL, issues must explain why.

DO NOT include suggestions or updatedTasks. Binary PASS/FAIL only.

PRD JSON:
EOF

{
  echo "$(cat "$TMP_PROMPT")"
  echo "$PRD_JSON"
} > "$TMP_PROMPT"

if ! command -v codex >/dev/null 2>&1; then
  cat > "$OUT_PATH" <<JSON
{
  "overall": "Peer reviewer CLI '$REVIEWER_CMD' not found. Skipping automated review.",
  "coverage": { "total": 0, "gaps": ["Reviewer CLI not available"] },
  "issues": [],
  "suggestions": [
    { "id": "SETUP-1", "action": "Install and configure PEER_REVIEWER_CMD (e.g., codex) to enable automated peer review." }
  ],
  "blocking": ["Missing reviewer CLI" ]
}
JSON
  echo "Peer review: reviewer CLI '$REVIEWER_CMD' not found. Wrote stub feedback to $OUT_PATH" >&2
  rm -f "$TMP_PROMPT" "$TMP_RAW"
  exit 0
fi

# Invoke reviewer: pass prompt as argument to codex exec
set +e
PROMPT_CONTENT=$(cat "$TMP_PROMPT")
$REVIEWER_CMD "$PROMPT_CONTENT" > "$TMP_RAW" 2>>"$SCRIPT_DIR/logs/peer_review.err"
STATUS=$?
set -e

if [[ $STATUS -ne 0 ]]; then
  echo "Peer review: reviewer exited with status $STATUS. See logs/peer_review.err" >&2
fi

# Try to extract a JSON object from output
python3 - "$TMP_RAW" << 'PY' > "$OUT_PATH" || {
import sys, json, re
raw = open(sys.argv[1], 'r', encoding='utf-8').read()
# Fallback: write minimal stub when no JSON found
print(json.dumps({
  "overall": "Reviewer output could not be parsed as JSON.",
  "coverage": {"total": 0, "gaps": ["Non-JSON reviewer output"]},
  "issues": [],
  "suggestions": [],
  "blocking": []
}, indent=2))
PY
import sys, json, re
raw = open(sys.argv[1], 'r', encoding='utf-8').read()

def extract_json(text: str):
    # Direct try
    try:
        return json.loads(text)
    except Exception:
        pass
    # Fenced block
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    # First JSON object
    start = text.find('{')
    if start != -1:
        depth = 0
        for i, ch in enumerate(text[start:], start=start):
            if ch == '{': depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start:i+1])
                    except Exception:
                        break
    return None

data = extract_json(raw)
if data is None:
    print(json.dumps({
      "overall": "Reviewer output could not be parsed as JSON.",
      "coverage": {"total": 0, "gaps": ["Non-JSON reviewer output"]},
      "issues": [],
      "suggestions": [],
      "blocking": []
    }, indent=2))
else:
    print(json.dumps(data, indent=2))

PY

echo "Peer review: wrote feedback to $OUT_PATH"
rm -f "$TMP_PROMPT" "$TMP_RAW"
