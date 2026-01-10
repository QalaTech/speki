# Code Style and Conventions for Qala-Ralph

## TypeScript Conventions

### Naming
- **Files**: kebab-case (e.g., `peer-review.ts`, `cli-detect.ts`)
- **Interfaces**: PascalCase, descriptive names (e.g., `UserStory`, `PeerFeedback`, `DecomposeState`)
- **Functions**: camelCase (e.g., `runPeerReview`, `autoSelectCli`)
- **Constants**: UPPER_SNAKE_CASE for timeouts/configs (e.g., `CLAUDE_TIMEOUT_MS`)
- **Types**: PascalCase for type aliases, or literal unions inline

### Type Definitions
- All shared types defined in `src/types/index.ts`
- Use interfaces for object shapes, type aliases for unions
- Example pattern:
```typescript
export type CliType = 'claude' | 'codex';
export type DecomposeStatus = 'idle' | 'running' | 'completed' | 'error';

export interface UserStory {
  id: string;
  title: string;
  // ...
}
```

### Function Structure
- Export named functions (not default exports)
- Async functions return Promise types explicitly
- Error handling with try/catch, throw specific errors
- Example:
```typescript
export async function loadGlobalSettings(): Promise<GlobalSettings> {
  // ...
}
```

### File Organization
- Group related functions in single files
- Separate concerns: types, core logic, CLI commands, routes
- Use `__tests__` subdirectories for tests
- Test files named `*.test.ts`

## React Conventions (Web Dashboard)

### Component Structure
- Functional components only (no class components)
- Use React hooks (useState, useEffect, useMemo, useCallback)
- Props interfaces defined inline or above component
- Example:
```typescript
interface TaskCardProps {
  story: UserStory;
  completedIds: Set<string>;
  // ...
}

export function TaskCard({ story, completedIds }: TaskCardProps) {
  // ...
}
```

### CSS
- Plain CSS files (no CSS-in-JS)
- CSS files named same as component (e.g., `ChatLogView.css`)
- BEM-style class naming (e.g., `.knowledge-section`, `.item-content`)

### State Management
- Local state with useState
- Derived state with useMemo
- Effects with useEffect
- No global state library (props drilling or context as needed)

## Testing Conventions

- Use Vitest for testing
- Test files in `__tests__` subdirectories
- Test naming: `describe` blocks for units, `it` blocks for behaviors
- Use supertest for API route testing
- Example:
```typescript
import { describe, it, expect } from 'vitest';

describe('functionName', () => {
  it('should do expected behavior', () => {
    // ...
  });
});
```

## Import Order
1. Node built-ins
2. External packages
3. Internal modules (relative paths)
4. Types (often imported separately)

## Error Handling
- Throw descriptive errors
- Catch at boundaries (CLI commands, API routes)
- Log errors with context
- Return appropriate exit codes from CLI

## Comments
- Avoid unnecessary comments
- Use JSDoc for complex public APIs
- No TODO/FIXME in committed code (per project standards)
