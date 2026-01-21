```markdown
---
paths:
  - "**/*.py"
  - "*.py"
---

# SOLID Principles in Python

Strictly apply the **SOLID principles** (as adapted for Python in *Clean Code in Python* by Mariano Anaya) to **all**
Python code and designs. These principles promote maintainable, extensible, and robust object-oriented code by
emphasizing cohesion, polymorphism, and dependency management.

## Single Responsibility Principle (SRP)

A class or module should have **one reason to change** — it should do one thing and do it well.

- High cohesion, low coupling
- Avoid "God classes" that handle multiple unrelated concerns
- Small classes/functions are easier to understand, test, and maintain

```python
# Bad: Multiple responsibilities
class SystemMonitor:
    def load_activity(self): ...      # Data loading
    def identify_events(self): ...    # Parsing logic
    def stream_events(self): ...      # External transmission

# Good: Separate responsibilities
class ActivityLoader: ...
class EventIdentifier: ...
class EventStreamer: ...
```

## Open/Closed Principle (OCP)

Software entities should be **open for extension** but **closed for modification**.

- Extend behavior by adding new code (e.g., new subclasses), not by changing existing code
- Use polymorphism and abstractions to avoid `if/elif` chains that grow indefinitely

```python
# Bad: Modifying existing method for new types
def identify_event(self):
    if ...:
        return LoginEvent(...)
    elif ...:
        return LogoutEvent(...)
    # Must modify when adding new events


# Good: Extend via new subclasses
class Event:
    @staticmethod
    def meets_condition(event_data: dict) -> bool: ...


class LoginEvent(Event):
    @staticmethod
    def meets_condition(event_data: dict) -> bool: ...

# SystemMonitor iterates over Event.__subclasses__() — no changes needed
```

## Liskov Substitution Principle (LSP)

Subclasses must be **substitutable** for their base classes without breaking the program.

- Subtypes must honor the contract of the parent (pre/postconditions, signatures)
- No stricter preconditions or weaker postconditions
- Use `mypy` and `pylint` to catch signature violations early

```python
# Bad: Changes signature → breaks polymorphism
class LoginEvent(Event):
    def meets_condition(self, event_data: list) -> bool: ...  # mypy error


# Good: Preserves exact signature
class LoginEvent(Event):
    def meets_condition(self, event_data: dict) -> bool: ...
```

## Interface Segregation Principle (ISP)

Clients should not depend on interfaces they don't use — prefer **many small, focused interfaces**.

- Split large interfaces into cohesive, single-purpose ones
- Avoid forcing classes to implement irrelevant methods

```python
# Bad: Fat interface
class EventParser(metaclass=ABCMeta):
    @abstractmethod
    def from_xml(...): ...

    @abstractmethod
    def from_json(...): ...


# Good: Segregated interfaces
class XMLEventParser(metaclass=ABCMeta):
    @abstractmethod
    def from_xml(...): ...


class JSONEventParser(metaclass=ABCMeta):
    @abstractmethod
    def from_json(...): ...


class DualFormatParser(XMLEventParser, JSONEventParser): ...
```

## Dependency Inversion Principle (DIP)

High-level modules should not depend on low-level ones — both should depend on **abstractions**.

- Invert dependencies via interfaces/protocols
- Use dependency injection (pass dependencies in `__init__`, not hard-code them)
- Details (DB, external services, frameworks) adapt to your code

```python
# Bad: Hard-coded concrete dependency
class EventStreamer:
    def __init__(self):
        self.target = Syslog()  # Tight coupling


# Good: Dependency injection via abstraction
class DataTargetClient(Protocol):
    def send(self, data: str) -> None: ...


class EventStreamer:
    def __init__(self, target: DataTargetClient):
        self.target = target
```

## Quick Checklist (Apply Before Every Class/Module Design)

- [ ] Each class/module has one clear responsibility
- [ ] New features extend via new code (no modifying closed methods)
- [ ] Subclasses are fully substitutable (signatures & contracts preserved)
- [ ] Interfaces are small and cohesive (no unused methods forced)
- [ ] High-level code depends on abstractions, not concrete implementations
- [ ] Dependencies are injected, not created internally
- [ ] `mypy` and `pylint` pass without LSP-related errors

## Full Reference

For complete explanations, detailed examples, rationale, and the full chapter discussion (including violations,
refactoring steps, and tool detection), consult the notes in the project folder:

`references/clean-code-in-python/ch04_solid_principles.md`