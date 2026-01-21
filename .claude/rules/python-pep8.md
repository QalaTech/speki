```markdown
---
paths:
  - "**/*.py"
  - "*.py"
---

# PEP 8 – Official Python Style Guide

Strictly adhere to **PEP 8** (the official Python style guide) for **all** Python code in this project. PEP 8 is the
definitive source for Python formatting, naming, and layout conventions.

## Indentation

- Use **4 spaces** per indentation level (never tabs)
- Prefer implied line continuation inside `()`, `[]`, `{}`
- Align continued lines vertically or use a hanging indent

```python
# Good: Aligned with opening delimiter
foo = long_function_name(var_one, var_two,
                         var_three, var_four)

# Good: Hanging indent
foo = long_function_name(
    var_one, var_two,
    var_three, var_four)
```

## Blank Lines

- **2 blank lines** around top-level functions and classes
- **1 blank line** between methods inside a class
- Use blank lines sparingly inside functions to separate logical sections

## Imports

- One import per line (except multiple names from the same module)
- Order: (1) standard library, (2) third-party, (3) local/project imports
- **One blank line** between each group
- Always use **absolute imports**
- Avoid `from module import *`

```python
import os
import sys

from flask import Flask, request

from myproject.utils import helper_function
```

## Whitespace

### Avoid extraneous whitespace

```python
# Good
spam(ham[1], {eggs: 2})
foo = (0,)
if x == 4:
    print(x)
ham[1:9], ham[lower:upper]
dct['key'] = list[index]

# Bad
spam(ham[1], {eggs: 2})
foo = (0,)
if x == 4:
    print(x)
dct['key'] = list[index]
```

### Surround operators appropriately

```python
# Good
x = 1
y = x + 2


def complex_func(a, b=None):
    ...


# Good: No spaces around = in default/keyword args
def func(param: int = 0) -> int:
    ...
```

## Naming Conventions

| Type              | Convention                         | Example                    |
|-------------------|------------------------------------|----------------------------|
| Modules           | `lowercase` or `snake_case`        | `mymodule`, `my_module.py` |
| Packages          | short `lowercase` (no underscores) | `mypackage`                |
| Classes           | `CapWords` (PascalCase)            | `MyClass`, `HTTPServer`    |
| Functions/Methods | `snake_case`                       | `my_function`              |
| Variables         | `snake_case`                       | `my_variable`              |
| Constants         | `UPPER_CASE_WITH_UNDERSCORES`      | `MAX_RETRIES`, `PI`        |
| Private           | `_leading_underscore`              | `_internal_var`            |

- Use `self` for instance methods, `cls` for class methods
- Avoid single-character names `l`, `O`, `I` (confusable with 1/0)

## Comments & Docstrings

- Comments: complete sentences, start with `# ` (hash + space)
- Inline comments: at least two spaces from code
- Docstrings: use `"""triple double quotes"""` (even for one-liners)
- Write docstrings for **all** public modules, functions, classes, and methods

```python
def calculate_total(items):
    """Calculate the total price of items.
    
    Args:
        items: Iterable of items with a ``price`` attribute.
    
    Returns:
        float: The total price.
    """
    return sum(item.price for item in items)
```

## Programming Recommendations

### Comparisons & Booleans

```python
# Good
if attr is not None:
    if not seq:  # empty list/tuple/etc.
    if seq:  # non-empty
    if isinstance(obj, int):

# Bad
if attr is not None: is
wrong
order
if len(seq) == 0:
    if attr == True:
```

### Exceptions

- Raise/catch specific exceptions
- Never use bare `except:`
- Keep `try` blocks minimal

```python
# Good
try:
    value = collection[key]
except KeyError:
    return default
else:
    return value
```

### Context Managers & Resources

Always use `with` statements for file/db connections, locks, etc.

```python
with open('file.txt') as f:
    data = f.read()
```

### Type Annotations (PEP 484)

- Include type hints on all public functions/classes
- Spaces after `:` and around `->`

```python
def greet(name: str) -> str:
    return f"Hello, {name}"


def process(values: list[int], limit: int = 100) -> dict[str, float]:
    ...
```

## Quick Checklist (Apply Before Every Python Commit)

- [ ] 4-space indentation (no tabs)
- [ ] Proper import ordering and grouping
- [ ] No trailing/extraneous whitespace
- [ ] Snake_case for functions/variables, CapWords for classes
- [ ] Docstrings on public API
- [ ] Type hints present
- [ ] No bare except or wildcard imports

## Full Reference

For the complete, authoritative PEP 8 specification and additional rationale/examples, consult the detailed guide in the
project folder:

`references/pep8/`