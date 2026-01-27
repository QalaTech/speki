# speki-cover — Test Coverage Verification

You are running a coverage check on code that was just implemented and tested. Your goal is to measure line coverage on the **new or modified files only** and ensure it meets the **80% threshold**.

## Workflow

1. **Detect the project language** from file extensions, project files, or build tools present in the workspace.
2. **Run the coverage command** for that language (see table below).
3. **Review the output** — focus on the files that were changed this iteration, not the entire project.
4. **If coverage is below 80%** on any changed file, identify the uncovered lines/branches and write targeted tests to cover them.
5. **Re-run coverage** to confirm the threshold is met.
6. **Run the full test suite** one final time to confirm nothing is broken.

## Language Reference

### .NET (C# / F#)

**Tool:** [Coverlet CLI](https://github.com/coverlet-coverage/coverlet) (`coverlet.console` global tool).

**Setup** (once per machine):

```bash
dotnet tool install --global coverlet.console
```

**Run** (all on one line — backslash continuations break coverlet):

```bash
coverlet "<TestAssemblyPath>" --target "dotnet" --targetargs "test <TestProjectPath> --no-build" --include "[AssemblyName]*" --exclude "[*.Tests]*" --threshold 80 --threshold-type line --format lcov
```

**Key flags:**
| Flag | Purpose |
|------|---------|
| `--target "dotnet"` | Use `dotnet` as the test runner |
| `--targetargs "test <path> --no-build"` | Test project path (`--no-build` avoids rebuilding) |
| `--threshold 80` | Fail if line coverage is below 80% |
| `--threshold-type line` | Enforce threshold on line coverage |
| `--include "[AssemblyName]*"` | Scope to the assembly you modified |
| `--exclude "[*.Tests]*"` | Exclude test assemblies from measurement |
| `--format lcov` | LCOV output (used to find uncovered lines) |

**Exit codes:** `0` = success, `2` = coverage below threshold, `1` = test failure.

**Finding uncovered lines** (when threshold fails, exit code `2`):

```bash
grep -E "^(SF:|DA:.*,0$)" coverage.info
```

This extracts source file paths (`SF:`) and uncovered line numbers (`DA:line,0`). Read the uncovered lines in each file and write targeted tests for them.

**Scoping:**

- `<TestAssemblyPath>` — path to the built test DLL (e.g., `tests/MyTests/bin/Debug/net8.0/MyTests.dll`)
- `<TestProjectPath>` — path to the test `.csproj` file

**Filter syntax** is `[assembly]type` — assembly in brackets, type after:

```bash
# Entire assembly
--include "[MyApp.Domain]*"

# Multiple assemblies sharing a prefix
--include "[MyApp.*]*"

# Specific class (fully qualified)
--include "[MyApp.Domain]MyApp.Domain.Models.Component"

# All classes in a namespace
--include "[MyApp.Domain]MyApp.Domain.Models.*"

# Combine multiple filters (repeat the flag)
--include "[MyApp.Domain]*" --include "[MyApp.Application]*"

# Exclude a specific type
--exclude "[MyApp.Domain]MyApp.Domain.Generated.*"
```

Method-level filtering is not supported — use the coverage report output to identify uncovered lines within a class.

Do not measure the entire solution. Scope to the assemblies you modified.

---

### TypeScript / JavaScript

**Tool:** Jest (built-in coverage) or Vitest.

**Jest:**

```bash
npx jest --coverage --collectCoverageFrom='src/path/to/changed/**/*.{ts,tsx}'
```

**Vitest:**

```bash
npx vitest run --coverage --coverage.include='src/path/to/changed/**'
```

**Scoping:** Use `--collectCoverageFrom` (Jest) or `--coverage.include` (Vitest) to limit coverage to the files you changed. Check `jest.config` or `vitest.config` for any existing coverage configuration.

---

### Python

**Tool:** pytest-cov (wraps coverage.py).

**Run:**

```bash
pytest --cov=module.path --cov-report=term-missing --cov-fail-under=80
```

**Key flags:**
| Flag | Purpose |
|------|---------|
| `--cov=module.path` | Scope to the module you modified |
| `--cov-report=term-missing` | Show which lines are not covered |
| `--cov-fail-under=80` | Fail if coverage is below 80% |

**Scoping:** Set `--cov` to the Python module path you changed (e.g., `--cov=src/auth`).

---

### Go

**Tool:** Built-in `go test -cover`.

**Run:**

```bash
go test -cover -coverprofile=coverage.out ./path/to/package/...
go tool cover -func=coverage.out
```

**Scoping:** Specify the package path you modified. Use `go tool cover -func` to see per-function coverage.

---

### Rust

**Tool:** cargo-tarpaulin.

**Run:**

```bash
cargo tarpaulin --packages my-crate --out Stdout --fail-under 80
```

**Scoping:** Use `--packages` to limit to the crate you modified.

---

## Rules

- **Only measure changed code.** Do not run whole-project coverage — scope to the files/modules/assemblies you modified.
- **80% line coverage is the target.** If a file is below this, write tests for the uncovered lines. If a specific line is genuinely untestable (e.g., a panic handler), note it but don't force coverage.
- **Do not weaken existing tests** to improve coverage numbers.
- **Do not add trivial tests** (e.g., testing getters/setters) just to hit the threshold — tests should verify meaningful behavior.
