# Python Standards

These standards apply when modifying `.py` files or projects containing `pyproject.toml`, `setup.py`, or `pytest.ini`.

## Build & Test

```bash
# Run tests
pytest

# Or with coverage
pytest --cov

# Type checking (if configured)
mypy .
```

---

## Project Structure

```
src/{project}/
├── src/{package}/
│   ├── __init__.py
│   ├── agents/          # LangGraph agents
│   ├── graph/           # Graph definitions
│   ├── tools/           # MCP tools
│   ├── types/           # Pydantic models
│   └── llm/
│       └── prompts/     # Prompt templates
├── tests/
│   ├── __init__.py
│   ├── test_*.py
│   └── conftest.py
├── pyproject.toml
└── README.md
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

**Bad:**
```python
async def process_component(component: Component) -> Result:
    # 200 lines doing validation, analysis, persistence, notifications...
```

**Good:**
```python
async def process_component(component: Component) -> Result:
    validated = await validate_component(component)
    analyzed = await analyze_component(validated)
    persisted = await persist_component(analyzed)
    await send_notifications(persisted)
    return Result(success=True, component_id=component.id)
```

### Type Hints (Required)

```python
def process_component(
    component_id: str,
    options: dict[str, Any] | None = None,
) -> ComponentResult:
    ...
```

### Pydantic Models for Data Classes

```python
from pydantic import BaseModel, Field

class ComponentResult(BaseModel):
    """Result from processing a component."""

    component_id: str = Field(description="ID of the processed component")
    success: bool = Field(description="Whether processing succeeded")
    message: str = Field(default="", description="Human-readable result message")
```

### Async/Await for I/O Operations

```python
async def fetch_component(component_id: str) -> Component:
    async with httpx.AsyncClient() as client:
        response = await client.get(f"/components/{component_id}")
        return Component.model_validate(response.json())
```

---

## Specific Rules

### Pydantic Models
- Use `Field()` with `description` for all fields
- Use `model_validate()` for parsing JSON
- Use `model_dump()` for serialization

### Error Handling
- Use specific exception types, not bare `Exception`
- Log errors with context before re-raising
- Use `logger.exception()` to capture stack traces

### Logging
- Use structured logging with `structlog` or standard `logging`
- Include context in log messages (component_id, operation, etc.)

### JSON Parsing
- Use direct `json.loads()` when input is validated
- Agent responses should be validated before returning (use validation tools)

---

## LangGraph/Agent Patterns

### Agent Result Types
- Always use Pydantic models for agent outputs
- Include validation tool in agent toolset
- Agent must call validation tool before returning

### Prompt Templates
- Store in `llm/prompts/` directory
- Use markdown format
- Include examples and expected output format

---

## Testing

- **Framework**: pytest
- **Async**: pytest-asyncio
- **Mocking**: unittest.mock or pytest-mock
- **Naming**: `test_function_name_scenario`

```python
import pytest
from unittest.mock import AsyncMock

@pytest.mark.asyncio
async def test_process_component_success():
    # Arrange
    mock_client = AsyncMock()
    mock_client.get_component.return_value = sample_component

    # Act
    result = await process_component("comp-123", client=mock_client)

    # Assert
    assert result.success is True
    assert result.component_id == "comp-123"
```

---

## Verification Checklist

```
[ ] pytest - all tests pass
[ ] Type hints on all function signatures
[ ] Pydantic models use Field() with descriptions
[ ] No bare except clauses
[ ] No TODO/FIXME comments
[ ] No commented-out code
[ ] No raise NotImplementedError in production code
[ ] Async functions use async/await properly
```
