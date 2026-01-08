/**
 * TypeScript port of stream_parser.py
 *
 * Parses Claude CLI stream-json output in real-time:
 * - Reads JSONL line-by-line from a stream
 * - Deduplicates tool calls (shows each tool only once)
 * - Deduplicates text content (avoids repeating streaming chunks)
 * - Outputs to console in real-time with immediate flushing
 * - Extracts full text for completion detection
 */
import type { Readable } from 'stream';
import type { ParsedOutput, StreamCallbacks } from './types.js';
/**
 * Parse a stream of JSONL data from Claude CLI
 *
 * @param stream - Readable stream of JSONL data
 * @param callbacks - Callbacks for text and tool events
 * @returns Parsed output with full text, tool calls, and completion status
 */
export declare function parseStream(stream: Readable, callbacks?: StreamCallbacks): Promise<ParsedOutput>;
/**
 * Default console output callbacks
 */
export declare function createConsoleCallbacks(): StreamCallbacks;
/**
 * Silent callbacks that collect data without output
 */
export declare function createSilentCallbacks(): StreamCallbacks;
/**
 * Create callbacks that write to both console and a progress file
 */
export declare function createProgressCallbacks(appendToFile: (text: string) => Promise<void>): StreamCallbacks;
//# sourceMappingURL=stream-parser.d.ts.map