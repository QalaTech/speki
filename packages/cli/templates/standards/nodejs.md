# Node.js / TypeScript Standards

These standards apply when modifying `.ts`, `.js`, `.tsx`, or `.jsx` files in projects containing `package.json`.

## Build & Test

```bash
# Install dependencies
npm install

# Run tests
npm test

# Type check (TypeScript)
npm run typecheck
# or
npx tsc --noEmit

# Lint
npm run lint
```

---

## Project Structure

```
src/
├── index.ts              # Entry point
├── types/                # TypeScript types/interfaces
├── utils/                # Utility functions
├── services/             # Business logic
├── routes/               # API routes (Express/Fastify)
└── middleware/           # Express/Fastify middleware

tests/
├── unit/                 # Unit tests
├── integration/          # Integration tests
└── fixtures/             # Test data
```

---

## Code Style

### Function Size & Complexity
- **No god functions** - if a function does too many things, split it
- **Single responsibility** - each function should do ONE thing well
- **Extract for testability** - if logic is hard to test, extract it into a smaller, focused function
- **Max ~30 lines per function** as a guideline (not a hard rule, use judgment)
- **Avoid deep nesting** - extract nested logic into helper functions
- **Name reveals intent** - if you can't name it clearly, it's doing too much

### TypeScript (Required for .ts files)

```typescript
// Use explicit types for function parameters and returns
function processComponent(
  componentId: string,
  options?: ProcessOptions
): Promise<ComponentResult> {
  // ...
}

// Use interfaces for object shapes
interface ProcessOptions {
  timeout?: number;
  retries?: number;
}

// Use type for unions/intersections
type Status = 'pending' | 'running' | 'complete' | 'error';
```

### Async/Await

```typescript
// Always use async/await over raw promises
async function fetchComponent(id: string): Promise<Component> {
  const response = await fetch(`/api/components/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch component: ${response.statusText}`);
  }
  return response.json();
}

// Handle errors explicitly
async function safelyFetchComponent(id: string): Promise<Component | null> {
  try {
    return await fetchComponent(id);
  } catch (error) {
    console.error('Failed to fetch component:', error);
    return null;
  }
}
```

### ESM Modules

```typescript
// Use ESM imports (not CommonJS require)
import { readFile } from 'fs/promises';
import { join } from 'path';

// Use .js extension for local imports in ESM
import { processComponent } from './services/component.js';
```

---

## Specific Rules

### Error Handling
- Use custom error classes for domain errors
- Always include error context in messages
- Use `console.error` or structured logging, not `console.log` for errors

```typescript
class ComponentNotFoundError extends Error {
  constructor(public readonly componentId: string) {
    super(`Component not found: ${componentId}`);
    this.name = 'ComponentNotFoundError';
  }
}
```

### Null/Undefined Handling
- Use nullish coalescing (`??`) over logical OR (`||`) for defaults
- Use optional chaining (`?.`) for nested access
- Prefer `undefined` over `null` for optional values

```typescript
// Good
const timeout = options?.timeout ?? 5000;
const name = user?.profile?.displayName ?? 'Anonymous';

// Avoid
const timeout = options && options.timeout || 5000;
```

### Object/Array Operations
- Use spread for immutable updates
- Use `Array.from()` or spread for array copies
- Prefer `map`, `filter`, `reduce` over imperative loops

```typescript
// Immutable update
const updated = { ...component, status: 'complete' };

// Array operations
const names = components.map(c => c.name);
const active = components.filter(c => c.status === 'active');
```

---

## Testing

- **Framework**: Jest, Vitest, or Node.js test runner
- **Mocking**: Jest mocks or vitest mocks
- **Naming**: `describe`/`it` blocks with clear descriptions
- **Pattern**: Arrange-Act-Assert

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('processComponent', () => {
  it('should return success when component is valid', async () => {
    // Arrange
    const mockRepo = {
      get: vi.fn().mockResolvedValue({ id: '123', name: 'Test' }),
    };

    // Act
    const result = await processComponent('123', { repo: mockRepo });

    // Assert
    expect(result.success).toBe(true);
    expect(mockRepo.get).toHaveBeenCalledWith('123');
  });

  it('should throw ComponentNotFoundError when component does not exist', async () => {
    // Arrange
    const mockRepo = {
      get: vi.fn().mockResolvedValue(null),
    };

    // Act & Assert
    await expect(processComponent('999', { repo: mockRepo }))
      .rejects
      .toThrow(ComponentNotFoundError);
  });
});
```

---

## Verification Checklist

```
[ ] npm test - all tests pass
[ ] npx tsc --noEmit - no type errors (TypeScript projects)
[ ] npm run lint - no lint errors
[ ] All functions have explicit return types
[ ] No any types (use unknown if truly unknown)
[ ] No TODO/FIXME comments
[ ] No commented-out code
[ ] No console.log in production code (use proper logging)
[ ] Error handling for all async operations
```
