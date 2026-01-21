```markdown
---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "*.ts"
  - "*.tsx"
---

# Clean Code in TypeScript

Strictly apply these **Clean Code principles** (adapted from Robert C. Martin's *Clean Code* and the
clean-code-typescript guide) to **all** TypeScript code. The goal is readable, reusable, refactorable, and maintainable
software.

Not every rule must be followed religiously—use judgment—but consistency is key. Prioritize clarity, simplicity, and
expressiveness.

## Variables

- Use **meaningful, pronounceable, searchable names**.
- Avoid mental mapping—one-word-per-concept.
- Use explanatory variables; avoid unneeded context.
- Prefer default arguments over conditionals.
- Use enums for intent-revealing values.

```ts
// Bad
const d = new Date(); // what is d?

// Good
const currentDate = new Date();
```

```ts
// Bad: Magic number
setTimeout(restart, 86400000);

// Good
const MILLISECONDS_PER_DAY = 86_400_000;
setTimeout(restart, MILLISECONDS_PER_DAY);
```

## Functions

- **One thing only** (Single Responsibility).
- Small functions (ideally ≤2 arguments; use options object if more).
- Descriptive names that say *what* they do.
- One level of abstraction per function.
- No duplicate code—extract abstractions.
- No flags as parameters.
- Avoid side effects—prefer pure functions.
- Encapsulate conditionals; avoid negative ones.
- Favor functional style (map/reduce/filter) over imperative loops.
- Use iterators/generators for streams.

```ts
// Bad: Multiple responsibilities
function emailClients(clients: Client[]) {
    clients.forEach(client => {
        const record = db.lookup(client);
        if (record.isActive()) email(client);
    });
}

// Good
function emailActiveClients(clients: Client[]) {
    clients.filter(isActiveClient).forEach(email);
}
```

## Objects & Data Structures

- Use getters/setters for encapsulation/validation.
- Prefer private/protected members.
- Favor immutability (`readonly`, `as const`, `Readonly<T>`).
- Use `type` for unions/intersections; `interface` for `extends`/`implements`.

```ts
// Good: Immutable
const config = {host: 'localhost', port: 443} as const;
```

## Classes

- Small, high cohesion, low coupling.
- Prefer composition over inheritance.
- Method chaining for fluent APIs.

```ts
// Good: Composition
class Employee {
    setTaxData(ssn: string, salary: number) {
        this.taxData = new EmployeeTaxData(ssn, salary);
        return this;
    }
}
```

## SOLID Principles

### Single Responsibility

One reason to change.

### Open/Closed

Open for extension, closed for modification (polymorphism).

### Liskov Substitution

Subtypes fully substitutable.

### Interface Segregation

Small, focused interfaces.

### Dependency Inversion

Depend on abstractions; inject dependencies.

(Examples mirror clean-code-typescript SOLID section—apply rigorously.)

## Testing

- Follow F.I.R.S.T.: Fast, Independent, Repeatable, Self-Validating, Timely.
- One assertion/concept per test.
- Descriptive test names revealing intent.

```ts
// Good
it('should handle leap years correctly', () => { ...
});
```

## Concurrency

- Prefer `async/await` over callbacks.
- Use promises for async flow.

## Error Handling

- Throw/reject with `Error` objects (stack traces!).
- Don't ignore caught/rejected errors—log/handle.
- Consider functional error handling (e.g., Result types).

## Formatting

- Consistent capitalization: `PascalCase` for types/classes, `camelCase` for variables/functions, `UPPER_SNAKE_CASE` for
  constants.
- Caller/callee close vertically.
- Alphabetized/grouped imports (polyfills → builtins → external → internal → relative).
- Use TypeScript path aliases for clean imports.
- Run ESLint/Prettier/Ruff equivalent.

## Comments

- Code > comments—prefer self-documenting code.
- No commented-out code.
- No journal comments.
- Use `// TODO:` for future work.
- Avoid markers/sections.

## Quick Checklist (Before Every TypeScript Commit/PR)

- [ ] Meaningful, searchable, pronounceable names
- [ ] Functions do one thing; ≤2 args ideally
- [ ] No side effects; pure where possible
- [ ] Immutable by default (`readonly`, `as const`)
- [ ] SOLID applied (especially SRP & DIP)
- [ ] Composition > inheritance
- [ ] High cohesion, low coupling
- [ ] Errors are proper `Error` instances
- [ ] No ignored errors/promises
- [ ] Tests: one concept, descriptive names
- [ ] Clean imports (grouped, alphabetized, aliases)
- [ ] No unnecessary comments or dead code
- [ ] Consistent formatting (ESLint/Prettier)

## Full Reference

For complete explanations, additional examples, rationale, and the full guide (including advanced patterns like
generators, iterators, and detailed SOLID refactors), consult the detailed notes in the project folder:

`references/clean-code-typescript/clean_code_typescript.md`