#!/usr/bin/env python3
"""Parse Claude stream-json output and display progress."""

import sys
import json

def main():
    if len(sys.argv) < 3:
        print("Usage: stream_parser.py <log_file> <jsonl_file>", file=sys.stderr)
        sys.exit(1)

    log_file = sys.argv[1]
    jsonl_file = sys.argv[2]

    full_text = ""
    seen_tools = set()

    with open(jsonl_file, "w") as jsonl_handle:
        for line in sys.stdin:
            # Save raw JSONL
            jsonl_handle.write(line)
            jsonl_handle.flush()

            line = line.strip()
            if not line:
                continue

            try:
                obj = json.loads(line)
                msg_type = obj.get("type", "")

                # Show tool usage for progress
                if msg_type == "assistant":
                    message = obj.get("message", {})
                    content = message.get("content", [])
                    if isinstance(content, list):
                        for block in content:
                            # Show tool calls
                            if block.get("type") == "tool_use":
                                tool_name = block.get("name", "unknown")
                                tool_id = block.get("id", "")
                                if tool_id not in seen_tools:
                                    seen_tools.add(tool_id)
                                    inp = block.get("input", {})
                                    # Get meaningful info based on tool type
                                    if tool_name == "Read":
                                        detail = inp.get("file_path", "")
                                    elif tool_name == "Grep":
                                        pattern = inp.get("pattern", "")
                                        path = inp.get("path", ".")
                                        detail = f"pattern={pattern!r} in {path}"
                                    elif tool_name == "Glob":
                                        detail = inp.get("pattern", "")
                                    elif tool_name == "Bash":
                                        detail = inp.get("command", "")[:80]
                                    elif tool_name == "Task":
                                        detail = inp.get("description", "")
                                    else:
                                        detail = inp.get("description", str(inp)[:60])
                                    print(f"  🔧 {tool_name}: {detail}", flush=True)
                            # Extract text content
                            elif block.get("type") == "text":
                                text = block.get("text", "")
                                if text and text not in full_text:
                                    print(text, end="", flush=True)
                                    full_text += text

                # Handle result type (final message)
                elif msg_type == "result":
                    result = obj.get("result", obj.get("message", {}))
                    if isinstance(result, dict):
                        content = result.get("content", [])
                        if isinstance(content, list):
                            for block in content:
                                if block.get("type") == "text":
                                    text = block.get("text", "")
                                    if text and text not in full_text:
                                        print(text, end="", flush=True)
                                        full_text += text

            except json.JSONDecodeError:
                pass

    # Save extracted text
    with open(log_file, "w") as f:
        f.write(full_text)


if __name__ == "__main__":
    main()
