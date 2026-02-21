/**
 * Parse Claude JSONL stream output and format for display
 * Port of stream_parser.py logic to client-side
 */

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface TextBlock {
  type: 'text';
  text: string;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

/**
 * Extract text from tool_result content which can be string or array of content blocks
 */
function extractToolResultContent(content: string | Array<{ type: string; text?: string }> | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(block => block.type === 'text' && block.text)
      .map(block => block.text)
      .join('\n');
  }
  return String(content);
}

type ContentBlock = ToolUseBlock | TextBlock | ToolResultBlock;

interface StreamMessage {
  type: 'system' | 'assistant' | 'user' | 'result';
  message?: {
    content?: ContentBlock[];
  };
  result?: {
    content?: ContentBlock[];
  };
}

/**
 * Extract error message from XML-wrapped error content
 * e.g., "<tool_use_error>File does not exist.</tool_use_error>" -> "File does not exist."
 */
function extractErrorMessage(content: string): string {
  // Try to extract content from common XML error tags
  const patterns = [
    /<tool_use_error>([\s\S]*?)<\/tool_use_error>/,
    /<error>([\s\S]*?)<\/error>/,
    /<Error>([\s\S]*?)<\/Error>/,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // If no XML tags found, return as-is (already clean)
  return content.trim();
}

function formatToolDetail(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Read':
      return (input.file_path as string) || '';
    case 'Grep': {
      const pattern = input.pattern || '';
      const path = input.path || '.';
      return `pattern="${pattern}" in ${path}`;
    }
    case 'Glob':
      return (input.pattern as string) || '';
    case 'Bash': {
      const cmd = (input.command as string) || '';
      return cmd.length > 80 ? cmd.substring(0, 80) + '...' : cmd;
    }
    case 'Task':
      return (input.description as string) || '';
    case 'Edit':
    case 'Write':
      return (input.file_path as string) || '';
    default: {
      const desc = input.description as string;
      if (desc) return desc;
      const str = JSON.stringify(input);
      return str.length > 60 ? str.substring(0, 60) + '...' : str;
    }
  }
}

export interface ParsedEntry {
  type: 'tool' | 'tool_result' | 'text' | 'result' | 'error' | 'system';
  content: string;
  toolName?: string;
  toolId?: string;
  status?: 'success' | 'error' | 'pending';
  /** Task ID for filtering logs in parallel execution */
  taskId?: string;
}

export function parseJsonlContent(jsonlContent: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const seenTools = new Set<string>();
  const seenText = new Set<string>();

  const lines = jsonlContent.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const obj = JSON.parse(line) as StreamMessage;

      if (obj.type === 'system') {
        // Skip system init messages
        continue;
      }

      if (obj.type === 'assistant') {
        const content = obj.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use') {
              const toolId = block.id;
              if (toolId && !seenTools.has(toolId)) {
                seenTools.add(toolId);
                const detail = formatToolDetail(block.name, block.input);
                entries.push({
                  type: 'tool',
                  content: detail,
                  toolName: block.name,
                  toolId: toolId,
                  status: 'pending',
                });
              }
            } else if (block.type === 'text') {
              const text = block.text;
              if (text && !seenText.has(text)) {
                seenText.add(text);
                entries.push({
                  type: 'text',
                  content: text,
                });
              }
            }
          }
        }
      } else if (obj.type === 'user') {
        const content = obj.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_result') {
              const isError = block.is_error;
              const resultContent = extractToolResultContent(block.content);
              const toolId = block.tool_use_id;

              if (isError) {
                entries.push({
                  type: 'error',
                  content: extractErrorMessage(resultContent).substring(0, 200),
                  toolId,
                  status: 'error',
                });
              } else {
                // Show brief success result
                const briefContent = resultContent.length > 100
                  ? resultContent.substring(0, 100) + '...'
                  : resultContent;
                entries.push({
                  type: 'tool_result',
                  content: briefContent,
                  toolId,
                  status: 'success',
                });
              }
            }
          }
        }
      } else if (obj.type === 'result') {
        const content = obj.result?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              const text = (block as TextBlock).text;
              if (text && !seenText.has(text)) {
                seenText.add(text);
                entries.push({
                  type: 'result',
                  content: text,
                });
              }
            }
          }
        }
      }
    } catch {
      // Skip non-JSON lines
    }
  }

  return entries;
}

export function formatParsedEntries(entries: ParsedEntry[]): string {
  return entries.map(entry => {
    switch (entry.type) {
      case 'tool':
        return `  🔧 ${entry.toolName}: ${entry.content}`;
      case 'text':
      case 'result':
        return entry.content;
      case 'error':
        return `  ❌ Error: ${entry.content}`;
      default:
        return entry.content;
    }
  }).join('\n');
}
