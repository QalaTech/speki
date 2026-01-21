```markdown
---
paths:
  - "**/*.py"
  - "*.py"
  - "src/**/*.py"
  - "**/main.py"
  - "**/router.py"
  - "**/schemas.py"
  - "**/models.py"
  - "**/dependencies.py"
---

# FastAPI Best Practices

Strictly follow these **opinionated FastAPI best practices** for all FastAPI projects. These guidelines are
battle-tested in production monoliths and microservices, prioritizing scalability, maintainability, performance, and
developer experience.

## Project Structure (Domain-Driven)

Organize by **domain/feature** (not by file type) for better scalability in larger apps:

```

src/
├── auth/
│ ├── router.py
│ ├── schemas.py # Pydantic models
│ ├── models.py # SQLAlchemy models
│ ├── dependencies.py
│ ├── service.py # Business logic
│ ├── config.py
│ ├── constants.py
│ ├── exceptions.py
│ └── utils.py
├── posts/
│ └── (same structure)
├── main.py # FastAPI app initialization
├── database.py
├── config.py # Global settings
├── exceptions.py # Global exceptions
└── pagination.py # Shared utilities

```

- Group all domain-specific files together.
- Import explicitly with module paths: `from src.auth.constants import AUTH_ERROR`.
- Keep global/shared utilities at the root of `src/`.

## Async Routes & Performance

FastAPI is async-first—leverage it correctly.

### I/O-Bound Operations
- Prefer `async def` routes and `await` for non-blocking I/O (DB calls, external APIs).
- If using sync code (e.g., blocking sleep), define as `def`—FastAPI runs it in a threadpool.
- **Never** block the event loop in `async def` routes (e.g., avoid `time.sleep()`).

```python
# Good: Non-blocking
@router.get("/perfect-ping")
async def perfect_ping():
    await asyncio.sleep(10)
    return {"pong": True}

# Acceptable: Sync route → threadpool
@router.get("/good-ping")
def good_ping():
    time.sleep(10)  # Blocks only the worker thread
    return {"pong": True}

# Bad: Blocks entire event loop
@router.get("/terrible-ping")
async def terrible_ping():
    time.sleep(10)  # Never do this
```

### CPU-Bound Tasks

- Offload to worker processes (Celery, multiprocessing)—threads are ineffective due to GIL.
- Never run heavy computation in the main event loop.

## Pydantic Usage

### Use Pydantic Extensively

- Validate everything: regex, enums, emails, URLs, constraints.

```python
class UserBase(BaseModel):
    username: str = Field(pattern="^[A-Za-z0-9-_]+$")
    email: EmailStr
    age: int = Field(ge=18)
    favorite_band: MusicBand | None = None
    website: AnyUrl | None = None
```

### Custom Global BaseModel

- Enforce consistent serialization (e.g., datetime format).

```python
class CustomModel(BaseModel):
    model_config = ConfigDict(
        json_encoders={datetime: datetime_to_gmt_str},
        populate_by_name=True,
    )

    def serializable_dict(self, **kwargs):
        return jsonable_encoder(self.model_dump(**kwargs))
```

### Decouple Settings

- Split `BaseSettings` by domain/module.

```python
# src/auth/config.py
class AuthConfig(BaseSettings):
    JWT_SECRET: str
    JWT_EXP: int = 5


auth_settings = AuthConfig()
```

## Dependencies

### Beyond DI: Use for Validation & Reuse

- Validate existence (DB lookups), permissions, etc.
- Dependencies are cached per request—safe to reuse.

```python
async def valid_post_id(post_id: UUID4) -> Mapping:
    post = await posts_service.get_by_id(post_id)
    if not post:
        raise PostNotFound()
    return post
```

### Chain & Compose Dependencies

- Build complex checks from smaller ones.

```python
async def valid_owned_post(
        post: Mapping = Depends(valid_post_id),
        user: Mapping = Depends(valid_active_user),
):
    if post["creator_id"] != user["id"]:
        raise NotOwner()
    return post
```

### Prefer Async Dependencies

- Avoid sync dependencies unless necessary (they run in threadpool).

## Miscellaneous Best Practices

- **Follow RESTful conventions** for reusable dependencies (consistent path param names).
- **Return dicts/models**, not pre-instantiated Pydantic objects—FastAPI re-validates anyway.
- **Sync SDKs**: Wrap in `run_in_threadpool`.
- **ValueError in validators** → becomes detailed ValidationError response.
- **Hide docs** in production: set `openapi_url=None` unless in allowed envs.
- **Document thoroughly**: Use `response_model`, `status_code`, `responses`, `description`.
- **DB conventions**: Explicit naming via `MetaData(naming_convention=...)`.
- **Alembic migrations**: Descriptive slugs, static/reversible.
- **SQL-first**: Complex joins/aggregations in DB, not Python.
- **Async test client** from day 1 (e.g., `async_asgi_testclient`).
- **Use Ruff** for linting/formatting.

## Quick Checklist (Before Every FastAPI Commit/PR)

- [ ] Domain-organized structure (no flat routers/models)
- [ ] Async routes for I/O; no blocking in async functions
- [ ] Pydantic for all input/output validation
- [ ] Custom base model for consistent serialization
- [ ] Dependencies for validation, auth, reuse (chained & cached)
- [ ] Async dependencies preferred
- [ ] RESTful paths for reusable deps
- [ ] Docs hidden in prod; thorough descriptions/responses
- [ ] Explicit DB naming conventions
- [ ] SQL for heavy lifting; Pydantic for schema
- [ ] Ruff run (check + format)

## Full Reference

For complete explanations, rationale, and additional tips (including threadpool caveats, Celery integration, etc.),
consult the detailed guide in the project folder:

`references/FastAPI/README.md/`