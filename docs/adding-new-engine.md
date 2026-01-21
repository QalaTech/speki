# Adding a New LLM Engine

This guide explains how to add support for a new LLM CLI (e.g., Gemini, Llama) to Qala Ralph.

## Required Components

When adding a new engine, you'll need to create or update:

1. **Driver class** - `src/core/llm/drivers/<name>-cli.ts` - Handles CLI spawning and communication
2. **Normalizer class** - `src/core/llm/normalizers/<name>-normalizer.ts` - Converts CLI output to standard events
3. **Factory registration** - `src/core/llm/engine-factory.ts` - Makes the engine discoverable
4. **Type updates** - `src/types/index.ts` - Registers the new CliType
5. **Tests** - Comprehensive coverage for driver, normalizer, and factory

## Step-by-Step Implementation

### 1. Create the Driver Class

Create `src/core/llm/drivers/my-cli.ts`:

```typescript
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { Engine, EngineAvailability, RunStreamOptions, RunStreamResult, RunChatOptions, RunChatResult, ReviewOptions, ReviewResult } from '../engine.js';
import { detectCli } from '../../cli-detect.js';
import { resolveCliPath } from '../../cli-path.js';

export class MyCliEngine implements Engine {
  name = 'my-engine';

  async isAvailable(): Promise<EngineAvailability> {
    const detection = await detectCli('my-cli');
    return {
      available: detection.available,
      name: this.name,
      version: detection.version,
    };
  }

  async runStream(options: RunStreamOptions): Promise<RunStreamResult> {
    const { promptPath, cwd, logDir, iteration, callbacks, model } = options;

    // Implementation: spawn CLI, write prompt, stream output, normalize events
    // See claude-cli.ts or codex-cli.ts for examples
    throw new Error('Not implemented');
  }

  async runChat(options: RunChatOptions): Promise<RunChatResult> {
    const { sessionId, message, cwd, onStreamLine } = options;

    // Implementation: spawn CLI with message, stream response, write .norm.jsonl
    throw new Error('Not implemented');
  }

  async runReview(options: ReviewOptions): Promise<ReviewResult> {
    const { prompt, outputPath, projectPath, timeoutMs } = options;

    // Implementation: spawn CLI for peer review
    throw new Error('Not implemented');
  }
}
```

**Key responsibilities:**
- Implement all four Engine interface methods
- Handle CLI spawning via `spawn()` from child_process
- Use `resolveCliPath()` to locate the CLI executable
- Return proper types from all methods
- Handle timeouts and errors gracefully

### 2. Create the Normalizer Class

Create `src/core/llm/normalizers/my-normalizer.ts`:

```typescript
import type { StreamNormalizer, NormalizedEvent } from '../../../types/index.js';

export class MyStreamNormalizer implements StreamNormalizer {
  /**
   * Convert CLI output chunk to normalized events.
   *
   * Parse the CLI's output format (JSONL, text lines, etc.) and convert to NormalizedEvent objects.
   * Each event maps to one of: text, thinking, tool_call, complete, metadata
   */
  normalize(chunk: string): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];

    // Split chunk into lines and process each
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      // Parse the line (e.g., JSONL format, timestamp-prefixed, etc.)
      // Convert to NormalizedEvent
      // Example:
      // events.push({
      //   type: 'text',
      //   content: '...',
      // });
    }

    return events;
  }
}
```

**Key responsibilities:**
- Parse your CLI's output format
- Map to standard NormalizedEvent types: `text`, `thinking`, `tool_call`, `complete`, `metadata`
- Handle different output variants (JSONL, timestamps, etc.)
- Return empty array for lines that can't be parsed (graceful degradation)

### 3. Register in Engine Factory

Update `src/core/llm/engine-factory.ts`:

```typescript
// In the getEngineByName() function, add:
export function selectEngine(...): { engine: Engine; model?: string } {
  // ... existing logic ...

  // Add this check (order matters for precedence):
  if (['my-engine', 'my-cli'].includes(normalized)) {
    return { engine: new MyCliEngine(), model };
  }

  // ... rest of function ...
}
```

**Pattern:**
- Register both the canonical name ('my-engine') and common aliases ('my-cli')
- Claude CLI aliases: 'claude', 'claude-cli'
- Codex CLI aliases: 'codex', 'codex-cli'
- Position matters: check in precedence order

### 4. Update Type Definitions

Update `src/types/index.ts`:

```typescript
/**
 * Supported CLI/engine types
 */
export type CliType = 'claude' | 'codex' | 'my-engine';
```

Also ensure your engine name is added to CLI detection in `src/core/cli-detect.ts` if it needs auto-detection.

### 5. Add Comprehensive Tests

#### Driver Tests: `src/core/llm/drivers/__tests__/my-cli.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyCliEngine } from '../my-cli.js';

vi.mock('../../cli-detect.js');
vi.mock('child_process');

describe('MyCliEngine', () => {
  let engine: MyCliEngine;

  beforeEach(() => {
    engine = new MyCliEngine();
    vi.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('returns availability and version', async () => {
      const result = await engine.isAvailable();
      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('name', 'my-engine');
      expect(result).toHaveProperty('version');
    });
  });

  // Add tests for runStream, runChat, runReview...
});
```

#### Normalizer Tests: `src/core/llm/normalizers/__tests__/my-normalizer.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { MyStreamNormalizer } from '../my-normalizer.js';

describe('MyStreamNormalizer', () => {
  const normalizer = new MyStreamNormalizer();

  it('converts text output to NormalizedEvent', () => {
    const output = 'hello world';
    const events = normalizer.normalize(output);

    expect(events).toHaveLength(1);
    expect(events[0]).toHaveProperty('type', 'text');
    expect(events[0]).toHaveProperty('content', 'hello world');
  });

  // Add tests for all output formats your CLI produces...
});
```

#### Factory Tests: Extend `src/core/llm/__tests__/engine-factory.test.ts`

Add test cases for your new engine:

```typescript
it('selectEngine_MyEngine_ReturnsMyCliEngine', () => {
  const { engine } = selectEngine({ cliFlag: 'my-engine', cwd: '.' });
  expect(engine.name).toBe('my-engine');
});

it('selectEngine_MyCliAlias_ReturnsMyCliEngine', () => {
  const { engine } = selectEngine({ cliFlag: 'my-cli', cwd: '.' });
  expect(engine.name).toBe('my-engine');
});
```

## Architecture Notes

### Engine Interface

All engines implement `Engine` interface with four methods:

- **isAvailable()**: Check if CLI is installed, return version
- **runStream()**: Run decomposition (read prompt file, stream normalized output, write .norm.jsonl)
- **runChat()**: Run interactive chat (stream message response, write .norm.jsonl)
- **runReview()**: Run spec review (parse feedback JSON, return structured result)

### Output Normalization

The normalizer must convert your CLI's output to NormalizedEvent objects. This enables:
- Consistent UI experience across all engines
- Unified logging and debugging
- Machine-readable output format

Event types:
- `text`: Assistant response text
- `thinking`: Internal reasoning (for models that expose it)
- `tool_call`: Tool/function call with ID and arguments
- `complete`: Stream completion signal
- `metadata`: Contextual info (tokens, model, etc.)

### File Writing Pattern

Both runStream and runChat should write normalized JSONL files:

```typescript
const normLines: NormalizedEvent[] = [];

// During output processing:
const events = normalizer.normalize(chunk);
for (const event of events) {
  normLines.push(JSON.stringify(event));
}

// On completion:
await fs.writeFile(normPath, normLines.join('\n') + '\n', 'utf-8');
```

## Validation Checklist

Before submitting your new engine:

- [ ] Driver class implements all Engine interface methods
- [ ] Normalizer handles all output formats your CLI produces
- [ ] Factory registers your engine with canonical name + aliases
- [ ] CliType includes your engine name
- [ ] isAvailable() returns version info when CLI is available
- [ ] isAvailable() returns { available: false } when CLI is missing
- [ ] runStream writes .norm.jsonl file with normalized events
- [ ] runChat writes .norm.jsonl file with normalized events
- [ ] All four methods handle errors gracefully (timeouts, spawn failures, etc.)
- [ ] Tests cover:
  - [ ] Driver: availability check, all run methods
  - [ ] Normalizer: all output format variants
  - [ ] Factory: canonical name + aliases, precedence order
- [ ] Build succeeds: `npm run build`
- [ ] Tests pass: `npm test`
- [ ] No TypeScript errors: `npx tsc --noEmit`

## Examples in Codebase

Refer to existing implementations for patterns:

- **Claude CLI driver**: `src/core/llm/drivers/claude-cli.ts` - Stream-JSON output format
- **Codex CLI driver**: `src/core/llm/drivers/codex-cli.ts` - JSONL + timestamp format
- **Claude normalizer**: `src/core/llm/normalizers/claude-normalizer.ts` - Assistant message parsing
- **Codex normalizer**: `src/core/llm/normalizers/codex-normalizer.ts` - Verbose format parsing

## Common Pitfalls

1. **Missing error handling**: Catch spawn errors, timeout errors, JSON parse errors
2. **Incomplete normalizer**: Not handling all output variants your CLI produces
3. **Wrong event types**: Check NormalizedEvent type definition for valid types
4. **Missing file writes**: .norm.jsonl files are required for UI parity
5. **Forgotten tests**: All methods need test coverage, especially error cases
6. **Type mismatches**: Ensure all return types match Engine interface exactly

## Getting Help

If adding a new engine:
- Study the existing Claude and Codex implementations
- Follow the same patterns for file structure and naming
- Write tests first (test-driven development)
- Build and test frequently during development
