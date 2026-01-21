```markdown
---
paths:
  - "**/*.py"
  - "*.py"
---

# Clean Code in Python Principles

You are an expert Python engineer strictly following the principles from *Clean Code in Python* by Mariano Anaya (2nd
edition). Apply these guidelines rigorously to **all** Python code in this project.

## Core Philosophy

- Code is read far more than it is written → Prioritize readability and clarity over cleverness
- Small, focused units: Functions do one thing; classes have one reason to change
- Explicit is better than implicit: Use clear names, obvious intent, and avoid hidden side effects

## Pythonic Idioms

### Leverage Built-in Features

Prefer Python's idiomatic constructs:

```python
# Good: Negative indexing
last_item = items[-1]

# Bad
last_item = items[len(items) - 1]
```

```python
# Good: List/dict/set comprehensions
squares = [x ** 2 for x in numbers if x > 0]

# Bad: Manual loops with append
squares = []
for x in numbers:
    if x > 0:
        squares.append(x ** 2)
```

```python
# Good: Context managers
with open('file.txt') as f:
    data = f.read()

# Bad: Manual resource management
f = open('file.txt')
try:
    data = f.read()
finally:
    f.close()
```

### Avoid Common Pitfalls

```python
# Good: Immutable defaults
def process(items: list | None = None) -> list:
    items = items or []
    return [transform(x) for x in items]


# Bad: Mutable default arguments (creates shared state)
def process(items: list = []) -> list:
    items.append(...)  # Bug waiting to happen!
```

```python
# Good: Extend UserList/UserDict for custom collections
from collections import UserList


class MyList(UserList):
    def __getitem__(self, index):
        return f"[{index}] {super().__getitem__(index)}"

# Bad: Subclass built-in list/dict directly (many operations bypass overrides)
```

### Use Properties, Not Getters/Setters

```python
# Good
class Circle:
    def __init__(self, radius: float):
        self._radius = radius

    @property
    def radius(self) -> float:
        return self._radius

    @radius.setter
    def radius(self, value: float):
        if value < 0:
            raise ValueError("Radius must be non-negative")
        self._radius = value

# Bad: Java-style explicit getters/setters
```

### Generators for Large/Infinite Data

```python
# Good: Memory-efficient generator
def load_records(filename: str):
    with open(filename) as f:
        for line in f:
            yield parse_record(line)


# Bad: Load everything into memory
def load_records(filename: str) -> list:
    records = [parse_record(line) for line in open(filename)]
    return records
```

## Naming & Structure

- Use single underscore `_` for internal/private attributes/methods
- Avoid double underscore `__` unless preventing name clashes in inheritance
- Choose meaningful, intention-revealing names (no abbreviations, avoid single-letter variables except in tiny scopes)
- Extract magic numbers/strings to named constants

```python
# Good
MAX_RETRY_ATTEMPTS = 3
CONNECTION_TIMEOUT_SECONDS = 30

# Bad: Magic numbers scattered
for attempt in range(3):  # What is 3?
    ...
```

## SOLID Principles (Adapted for Python)

- **Single Responsibility**: One class/module = one reason to change
- **Open/Closed**: Extend behavior without modifying existing code (prefer composition/subclassing)
- **Liskov Substitution**: Subclasses must be fully substitutable
- **Interface Segregation**: Prefer many small protocols over large ones
- **Dependency Inversion**: Depend on abstractions; inject dependencies

```python
# Good: Dependency injection
class EventStreamer:
    def __init__(self, target: DataTargetProtocol):
        self._target = target


# Bad: Tight coupling
class EventStreamer:
    def __init__(self):
        self._target = Syslog()  # Hard to test/replace
```

## Decorators

- Always use `@functools.wraps` to preserve metadata
- Keep decorators focused on one concern
- Avoid expensive work or side effects at import time

## Error Handling

- Fail fast: Validate inputs early
- Raise specific exceptions
- Never use bare `except:` or broad `except Exception:`
- Exceptions are for exceptional cases, not flow control

## Testing

- Tests are first-class code → Same standards apply
- One logical assertion/behavior per test
- Prefer `pytest` over `unittest`
- Favor dependency injection over heavy mocking

## Type Hints

- Always include full type hints on public functions/classes
- Use modern syntax: `str | None`, `list[int]`, etc.
- Run `mypy` strictly (no `# type: ignore` unless absolutely necessary)

## Quick Checklist (Apply Before Every Python Change)

- [ ] Functions/classes are small and do one thing
- [ ] Names clearly reveal intent
- [ ] No mutable default arguments
- [ ] Context managers used for resources
- [ ] Full type hints present
- [ ] Specific exceptions raised
- [ ] Tests cover new/changed behavior

## Deeper Reference

For exhaustive explanations, examples, and rationale on any topic above, consult the full book in the project folder:

`references/clean-code-in-python/`