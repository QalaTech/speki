/**
 * Types for Claude CLI stream-json output format.
 *
 * When using `claude --output-format stream-json`, the CLI outputs
 * newline-delimited JSON (JSONL) with these message types.
 */
export interface TextBlock {
    type: 'text';
    text: string;
}
export interface ToolUseBlock {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
}
export interface ToolResultBlock {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
}
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;
export interface SystemMessage {
    type: 'system';
    subtype: string;
    cwd?: string;
    session_id?: string;
    tools?: unknown[];
    model?: string;
    permissionMode?: string;
}
export interface AssistantMessage {
    type: 'assistant';
    message: {
        model?: string;
        id?: string;
        type: 'message';
        role: 'assistant';
        content: ContentBlock[];
        stop_reason?: string | null;
    };
}
export interface UserMessage {
    type: 'user';
    message: {
        role: 'user';
        content: ToolResultBlock[];
    };
}
export interface ResultMessage {
    type: 'result';
    result: {
        content: ContentBlock[];
    };
}
export type StreamMessage = SystemMessage | AssistantMessage | UserMessage | ResultMessage;
export interface ToolCall {
    id: string;
    name: string;
    input: Record<string, unknown>;
    detail: string;
}
export interface ParsedOutput {
    fullText: string;
    toolCalls: ToolCall[];
    isComplete: boolean;
}
export interface StreamCallbacks {
    onText?: (text: string) => void | Promise<void>;
    onToolCall?: (name: string, detail: string) => void | Promise<void>;
    onToolResult?: (result: string) => void | Promise<void>;
    onError?: (error: Error) => void;
}
//# sourceMappingURL=types.d.ts.map