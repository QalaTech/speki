# Task Completion Checklist

Before completing a task, ensure all of the following are done:

## Build & Type Check
- [ ] Run `npm run build` - build succeeds with no errors
- [ ] Run `npm run typecheck` - no TypeScript errors
- [ ] No build warnings (if applicable)

## Tests
- [ ] Run `npm test` - all tests pass
- [ ] Add tests for new functionality
- [ ] Do NOT modify existing tests unless they fail due to YOUR changes
- [ ] If tests fail, fix the IMPLEMENTATION, not the tests

## Code Quality
- [ ] No TODO or FIXME comments left in code
- [ ] No commented-out code committed
- [ ] No magic strings or numbers - use constants
- [ ] Code follows existing project patterns and conventions
- [ ] No placeholder implementations (throw NotImplementedError, etc.)

## Linting
- [ ] Run `npm run lint` - no linting errors (if configured)

## Web Dashboard (if applicable)
- [ ] Run `cd web && npm run build` - web build succeeds
- [ ] Test UI changes manually if needed

## Git
- [ ] Review changes before committing
- [ ] Write clear commit messages
- [ ] Ensure on correct branch

## Commands Summary

```bash
# Full validation sequence
npm run build
npm run typecheck
npm test
npm run lint  # if configured
```
