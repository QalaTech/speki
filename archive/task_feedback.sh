#!/usr/bin/env bash
set -euo pipefail

# Task Feedback Script
#
# Updates a specific task based on user feedback using Claude.
#
# Usage: task_feedback.sh <task-id> <feedback> <tasks.json> [prd.md]
#   task-id     The ID of the task to update (e.g., US-001)
#   feedback    The user's feedback/instructions for updating the task
#   tasks.json  The task file to update
#   prd.md      Optional PRD file for context

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

TASK_ID="${1:-}"
FEEDBACK_ARG="${2:-}"
TASKS_FILE="${3:-}"
PRD_FILE="${4:-}"

# If FEEDBACK_FROM_FILE is set, read feedback from the file path in arg 2
if [[ "${FEEDBACK_FROM_FILE:-}" == "1" && -f "$FEEDBACK_ARG" ]]; then
    FEEDBACK=$(cat "$FEEDBACK_ARG")
    rm -f "$FEEDBACK_ARG"  # Clean up temp file
else
    FEEDBACK="$FEEDBACK_ARG"
fi

if [[ -z "$TASK_ID" || -z "$FEEDBACK" || -z "$TASKS_FILE" ]]; then
    echo "Usage: $0 <task-id> <feedback> <tasks.json> [prd.md]" >&2
    exit 1
fi

if [[ ! -f "$TASKS_FILE" ]]; then
    echo "Tasks file not found: $TASKS_FILE" >&2
    exit 1
fi

# Extract the specific task
TASK_JSON=$(python3 -c "
import json, sys
with open('$TASKS_FILE') as f:
    data = json.load(f)
for story in data.get('userStories', []):
    if story.get('id') == '$TASK_ID':
        print(json.dumps(story, indent=2))
        sys.exit(0)
print('null')
sys.exit(1)
" 2>/dev/null)

if [[ "$TASK_JSON" == "null" || -z "$TASK_JSON" ]]; then
    echo "Task not found: $TASK_ID" >&2
    exit 1
fi

# Read PRD if provided
PRD_CONTENT=""
if [[ -n "$PRD_FILE" && -f "$PRD_FILE" ]]; then
    PRD_CONTENT=$(cat "$PRD_FILE")
fi

# Create the prompt
TMP_PROMPT=$(mktemp)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/task_feedback_${TASK_ID}_${TIMESTAMP}.log"

cat > "$TMP_PROMPT" << 'PROMPT_START'
You are updating a single task based on user feedback.

## INSTRUCTIONS
1. Read the current task JSON
2. Apply the user's feedback to update the task
3. Output ONLY the updated task JSON - nothing else
4. Keep the same task ID
5. Preserve fields that aren't mentioned in the feedback

## OUTPUT FORMAT
Output ONLY valid JSON for the single task. No markdown, no explanation.
The JSON must have these fields:
- id: string (keep the same)
- title: string
- description: string
- acceptanceCriteria: string[]
- testCases: string[] (optional)
- priority: number (1-5)
- passes: boolean (keep as false for unfinished tasks)
- notes: string
- dependencies: string[] (other task IDs)

PROMPT_START

if [[ -n "$PRD_CONTENT" ]]; then
    cat >> "$TMP_PROMPT" << EOF

## PRD CONTEXT (for reference)
<prd>
$PRD_CONTENT
</prd>
EOF
fi

cat >> "$TMP_PROMPT" << EOF

## CURRENT TASK
<task>
$TASK_JSON
</task>

## USER FEEDBACK
<feedback>
$FEEDBACK
</feedback>

OUTPUT THE UPDATED TASK JSON ONLY. NO OTHER TEXT.
EOF

# Call Claude
echo "Updating task $TASK_ID..."

if ! command -v claude >/dev/null 2>&1; then
    echo "Claude CLI not found" >&2
    exit 1
fi

RESPONSE=$(cat "$TMP_PROMPT" | claude -p --tools "" 2>"$LOG_FILE.err") || {
    echo "Claude CLI failed" >&2
    cat "$LOG_FILE.err" >&2
    rm "$TMP_PROMPT"
    exit 1
}

rm "$TMP_PROMPT"

if [[ -z "$RESPONSE" ]]; then
    echo "Empty response from Claude" >&2
    exit 1
fi

# Extract JSON from response
UPDATED_TASK=$(echo "$RESPONSE" | python3 -c "
import sys, json, re

content = sys.stdin.read()

# Try to find JSON in code blocks first
match = re.search(r'\`\`\`(?:json)?\s*(\{[\s\S]*?\})\s*\`\`\`', content)
if match:
    try:
        obj = json.loads(match.group(1))
        print(json.dumps(obj))
        sys.exit(0)
    except:
        pass

# Try to find raw JSON with 'id' field
for m in re.finditer(r'\{[^{}]*\"id\"[^{}]*\}', content):
    try:
        obj = json.loads(m.group(0))
        if 'id' in obj:
            print(json.dumps(obj))
            sys.exit(0)
    except:
        pass

# Try balanced brace matching
start = content.find('{')
if start != -1:
    depth = 0
    for i, ch in enumerate(content[start:], start=start):
        if ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                try:
                    obj = json.loads(content[start:i+1])
                    if 'id' in obj:
                        print(json.dumps(obj))
                        sys.exit(0)
                except:
                    pass
                break

sys.exit(1)
" 2>/dev/null)

if [[ -z "$UPDATED_TASK" ]]; then
    echo "Failed to extract valid JSON from Claude response" >&2
    echo "Response saved to: $LOG_FILE" >&2
    echo "$RESPONSE" > "$LOG_FILE"
    exit 1
fi

# Validate the updated task has required fields
python3 -c "
import json, sys
task = json.loads('''$UPDATED_TASK''')
required = ['id', 'title', 'description', 'acceptanceCriteria', 'priority', 'dependencies']
missing = [f for f in required if f not in task]
if missing:
    print(f'Missing required fields: {missing}', file=sys.stderr)
    sys.exit(1)
if task['id'] != '$TASK_ID':
    print(f'Task ID mismatch: expected $TASK_ID, got {task[\"id\"]}', file=sys.stderr)
    sys.exit(1)
" || exit 1

# Update the task in the file
python3 -c "
import json

with open('$TASKS_FILE') as f:
    data = json.load(f)

updated_task = json.loads('''$UPDATED_TASK''')

# Ensure boolean fields are correct type
if 'passes' not in updated_task:
    updated_task['passes'] = False
if 'notes' not in updated_task:
    updated_task['notes'] = ''
if 'testCases' not in updated_task:
    updated_task['testCases'] = []

# Find and replace the task
for i, story in enumerate(data.get('userStories', [])):
    if story.get('id') == '$TASK_ID':
        data['userStories'][i] = updated_task
        break

with open('$TASKS_FILE', 'w') as f:
    json.dump(data, f, indent=2)

print(f'Updated task $TASK_ID in $TASKS_FILE')
"

echo "Task $TASK_ID updated successfully"
