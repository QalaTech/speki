```markdown
---
paths:
  - "**/*.py"
  - "*.py"
---

# Clean Architecture Principles for Python Systems

Apply the principles of **Clean Architecture** (as described in *Clean Architecture* and adapted for Python in *Clean
Code in Python* by Mariano Anaya) to **all** Python projects and systems. These principles scale the clean code ideas
from functions/classes to entire applications and distributed systems.

The goal is long-term maintainability, extensibility, and quality attributes (performance, testability, scalability,
operability).

## Core Ideas

- **Architecture screams the domain**: The structure should reveal the business intent first, not frameworks, tools, or
  implementation details.
- **Clean code is the foundation**: Poor code undermines any architecture. Apply all previous clean code/PEP 8 rules at
  every level.
- **Separation of Concerns at scale**: Just as functions/classes should do one thing, components/services should have
  single, well-defined responsibilities (high cohesion, low coupling).
- **Details are encapsulated**: Frameworks, databases, web servers, ORMs, and external services are *details*—hide them
  behind abstractions.

## Dependency Rule (The Clean Architecture)

Dependencies point **inward** only:

```

Outer layers → Application/Use Cases → Domain → (Innermost)

```

- **Domain** (entities, business rules): Pure Python—no frameworks, no I/O, no external dependencies.
- **Application/Use Cases**: Orchestrates domain logic; depends only on Domain.
- **Adapters/Infrastructure** (outer): Frameworks, DB drivers, web servers, external APIs—depend on inner layers.
- **Frameworks & Drivers** (outermost): Web frameworks (FastAPI, Flask), ORMs (SQLAlchemy), etc.

**Never** allow outer layers to be imported by inner layers. Invert dependencies via interfaces/protocols.

```python
# Good: Domain defines the interface
class OrderRepository(Protocol):
    async def get_by_id(self, order_id: int) -> Order: ...

# Infrastructure implements it
class SqlAlchemyOrderRepository:
    def __init__(self, session: AsyncSession): ...
    async def get_by_id(self, order_id: int) -> Order: ...

# Application uses the abstraction
class TrackOrderUseCase:
    def __init__(self, repo: OrderRepository): ...
    async def execute(self, order_id: int) -> OrderStatus: ...
```

## Components & Packaging

- Favor **small, cohesive Python packages** for reusable logic over premature microservices.
- Use packages to encapsulate adapters (DB, web, external services).
- Publish internal libraries to a private PyPI/artifact repository.
- Follow PEP 440 versioning; pin transitive dependencies with `pip-tools` or `poetry`.

## Hexagonal/Ports & Adapters Style

- Define **ports** (interfaces/protocols) in the domain/application layers.
- Implement **adapters** in infrastructure for databases, web frameworks, message queues, etc.
- The core application should be framework-agnostic and testable without external systems.

## Monoliths vs Microservices

- Start with a **modular monolith** (multiple packages in one repo/service).
- Extract to microservices **only** when justified (independent deployment, different scaling, team boundaries).
- Microservices add complexity (latency, contracts, distributed failures)—avoid prematurely.

## Docker & Deployment

- Package services as Docker containers for portability.
- Use multi-stage builds; install pinned dependencies from `requirements.txt`.
- Create entry points (`console_scripts`) for clean process startup.
- Base images: prefer slim/official Python images.

## Testability & Quality

- **Testing pyramid**: Many unit tests (pure domain), fewer component/integration tests, few end-to-end.
- Mock/stub adapters easily due to dependency inversion.
- Core business logic should run without DB/web server.

## Intention-Revealing Architecture

- Package/module names should reflect domain concepts, not technical ones (`order_processing`, not `fastapi_app`).
- Hide frameworks: No direct imports of Flask/FastAPI/SQLAlchemy in domain/application layers.

## Quick Checklist (Before Major Architecture Decisions)

- [ ] Dependencies flow inward only
- [ ] Domain models are pure (no framework/ORM leakage)
- [ ] External concerns (DB, web, queues) are behind adapters
- [ ] Components are cohesive and independently deployable/testable
- [ ] Intention of the system is clear from high-level structure
- [ ] Practicality considered—don’t over-abstract if not needed