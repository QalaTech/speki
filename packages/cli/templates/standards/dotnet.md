# .NET / C# Standards

These standards apply when modifying `.cs` files or projects containing `.csproj`/`.sln` files.

## Build & Test

```bash
# Build with warnings as errors
dotnet build --warnaserror

# Run tests (from project/solution directory, NOT individual test assemblies)
dotnet test
```

**Critical:**
- **NEVER** run individual test projects separately - this can spin up multiple infrastructure containers
- Run tests at the solution/project level
- Watch for Aspire/container infrastructure failures (0 tests passed, timeouts, port conflicts)
- If tests show 0 passed with no failures, infrastructure may have failed to start

---

## Architecture (Clean Architecture)

```
src/{project}/src/
├── Continuum.{Project}.Api           (Presentation - Minimal APIs)
├── Continuum.{Project}.Application   (Services, DTOs, Validators)
├── Continuum.{Project}.Domain        (Entities, Interfaces, Exceptions)
├── Continuum.{Project}.Infrastructure (Repositories, DbContext, External)
```

### File Organization

```
Domain/
├── {Feature}/
│   ├── {Entity}.cs
│   ├── I{Entity}Repository.cs
├── Common/ (IIdGenerator, IDateTimeProvider)
├── Exceptions/ (NotFoundException, ConcurrencyConflictException, DomainInvalidOperationException)
└── Enums/

Application/
├── {Feature}/
│   ├── {Entity}Service.cs
│   ├── I{Entity}Service.cs
│   └── DTOs/

Api/
├── Features/{Feature}/
│   ├── {Feature}Endpoints.cs
│   └── {Action}{Entity}Handler.cs

Infrastructure/
├── Persistence/
│   ├── Repositories/
│   ├── Configurations/
│   └── {DbName}DbContext.cs
```

---

## C# 13 / .NET 10 Patterns (REQUIRED)

### File-scoped namespaces (no braces)

```csharp
namespace Continuum.Cortex.Domain.Scans;

public class Scan { }
```

### Primary constructors for DI

```csharp
public class ScanService(
    IScanRepository scanRepository,
    IUnitOfWork unitOfWork,
    IDateTimeProvider dateTime,
    IIdGenerator idGenerator) : IScanService
```

### Sealed records for DTOs

```csharp
public sealed record QueueScanRequest
{
    public required Guid OrganisationId { get; init; }
    public required string RepositoryUrl { get; init; }
    public string? TriggeredBy { get; init; }
}
```

### Required keyword for mandatory fields

```csharp
public required Guid OrganisationId { get; init; }
```

---

## Specific Rules

### Parameter Count & Factory Design

**Hard limits:**
- **> 7 parameters** = design smell, refactor
- **> 10 parameters** = must refactor (no exceptions unless API boundary/generated code)
- **> 2 optional parameters** = use an options/details record instead

**Refactoring priority:**

1. **Separate invariants from enrichment**
   - `Create()` takes only fields needed to make the object valid (seed/invariants)
   - Optional/computed/enrichment fields → explicit methods (`SetSecurity()`, `SetTags()`)
   - Heuristic: if a parameter can be null/default and isn't required for identity, it doesn't belong in `Create()`

2. **Introduce parameter objects for grouped meaning**
   - Group related parameters into value objects/records
   - No parameter object should exceed 8 fields (split if it does)

3. **Don't pass infrastructure services deep into domain**
   - Prefer passing `id` and `now` as values: `Create(seed, id, now)`
   - Domain factories accept primitives/value objects, not services
   - Keep `IIdGenerator`/`IDateTimeProvider` at composition root

4. **Eliminate primitive soup**
   - 2+ Guids in same signature → use strongly-typed ID wrappers
   - Multiple strings → use domain types (`ComponentName`, `ServiceName`)

**Bad:**
```csharp
public static Component Create(
    Guid organisationId,
    Guid? originRepositoryId,
    string type, string category, string direction, string classification,
    string? name, string? serviceName, string? responsibility,
    IReadOnlyList<string>? tags,
    ConnectionInfo? connection,
    SecurityAssessment? security,
    SemanticAnalysis? semantic,
    SecuritySummary? securitySummary,
    SemanticSummary? semanticSummary,
    IIdGenerator idGenerator,
    IDateTimeProvider dateTimeProvider)
```

**Good:**
```csharp
// Seed contains only invariants
public readonly record struct ComponentSeed(
    OrganisationId OrganisationId,
    ComponentType Type,
    ComponentCategory Category,
    Direction Direction,
    Classification Classification,
    ConnectionInfo Connection);

// Factory takes seed + values
public static Component Create(ComponentSeed seed, ComponentId id, DateTimeOffset now)
{
    return new Component { /* invariants only */ };
}

// Enrichment via explicit methods
var component = Component.Create(seed, id, now);
component.SetIdentity(name, serviceName, responsibility);
component.SetTags(tags);
component.ApplySummaries(securitySummary, semanticSummary);
```

**Target shapes for factories:**
```csharp
// A) Seed + values
Create(ComponentSeed seed, ComponentId id, DateTimeOffset now)

// B) Seed + values + optional details
Create(ComponentSeed seed, ComponentId id, DateTimeOffset now, ComponentDetails? details = null)

// C) Seed only, then enrichment
var c = Component.Create(seed, id, now);
c.SetDisplay(...);
c.SetTags(...);
c.ApplySecurity(...);
```

### Function Size & Complexity
- **No god functions** - if a method does too many things, split it
- **Single responsibility** - each method should do ONE thing well
- **Extract for testability** - if logic is hard to test, extract it into a smaller, focused method
- **Max ~30 lines per method** as a guideline (not a hard rule, use judgment)
- **Avoid deep nesting** - extract nested logic into helper methods
- **Name reveals intent** - if you can't name it clearly, it's doing too much

**Bad:**
```csharp
public async Task ProcessOrderAsync(Order order)
{
    // 200 lines doing validation, payment, inventory, notifications...
}
```

**Good:**
```csharp
public async Task ProcessOrderAsync(Order order)
{
    await ValidateOrderAsync(order);
    await ProcessPaymentAsync(order);
    await UpdateInventoryAsync(order);
    await SendNotificationsAsync(order);
}
```

### Strongly-Typed IDs
- **Wrap Guids in typed wrappers** to prevent accidental misuse
- Use `readonly record struct` for zero-overhead value semantics
- Prevents passing `componentId` where `organisationId` is expected

**Bad:**
```csharp
public async Task<Component?> GetByIdAsync(Guid organisationId, Guid componentId);

// Easy to accidentally swap these - compiles fine, fails at runtime
await repo.GetByIdAsync(componentId, organisationId); // Oops!
```

**Good:**
```csharp
public readonly record struct OrganisationId(Guid Value);
public readonly record struct ComponentId(Guid Value);

public async Task<Component?> GetByIdAsync(OrganisationId organisationId, ComponentId componentId);

// Compiler catches mistakes
await repo.GetByIdAsync(componentId, organisationId); // Compile error!
```

### ID Generation
- **ALWAYS** use `Guid.CreateVersion7()` via `IIdGenerator`
- **NEVER** use `Guid.NewGuid()`
- When creating new IDs, wrap in the appropriate typed wrapper

### Date/Time Handling
- **ALWAYS** use `DateTimeOffset`, never `DateTime`
- **ALWAYS** use `IDateTimeProvider` for testability
- Direct `DateTimeOffset.UtcNow` only in domain entity methods

### Error Handling (No Result Pattern)
- Use domain exceptions: `NotFoundException`, `ConcurrencyConflictException`, `DomainInvalidOperationException`
- GlobalExceptionHandler converts to ProblemDetails:
```csharp
var (statusCode, title, detail) = exception switch
{
    NotFoundException => (404, "Not Found", exception.Message),
    ConcurrencyConflictException => (409, "Conflict", exception.Message),
    DomainInvalidOperationException => (400, "Bad Request", exception.Message),
    _ => (500, "Internal Server Error", "An unexpected error occurred")
};
```

### Repository Pattern
- Interface in Domain, implementation in Infrastructure
- **ALWAYS** async with `CancellationToken ct = default`
- **ALWAYS** return `IReadOnlyList<T>` for collections
- Use `IUnitOfWork` for coordinated saves

### Service Pattern (No MediatR)
- Simple service interfaces in Application
- Primary constructor DI
- Services orchestrate repositories

### Minimal API Handlers
- Static classes with `Handle` method
- Services injected as method parameters
- Returns `IResult`

### Mapping (Mapster)
- **Use Mapster** for Entity ↔ DTO mapping
- **Centralize mappings** in a configuration class per feature/module
- **NEVER** duplicate mapping logic across services/handlers
- Register mapping config at startup via `TypeAdapterConfig.GlobalSettings`

**Bad:**
```csharp
// Duplicated mapping in every service
public ComponentDto GetComponent(Guid id)
{
    var entity = _repo.GetById(id);
    return new ComponentDto
    {
        Id = entity.Id,
        Name = entity.Name,
        Type = entity.Type.ToString(),
        // ... 20 more properties duplicated everywhere
    };
}
```

**Good:**
```csharp
// Application/Mapping/ComponentMappingConfig.cs
public class ComponentMappingConfig : IRegister
{
    public void Register(TypeAdapterConfig config)
    {
        config.NewConfig<Component, ComponentDto>()
            .Map(dest => dest.Type, src => src.Type.ToString())
            .Map(dest => dest.Tags, src => src.Tags.ToList());

        config.NewConfig<CreateComponentRequest, Component>()
            .Ignore(dest => dest.Id)
            .Ignore(dest => dest.CreatedAt);
    }
}

// Usage in service - clean and consistent
public ComponentDto GetComponent(Guid id)
{
    var entity = _repo.GetById(id);
    return entity.Adapt<ComponentDto>();
}
```

**Configuration setup:**
```csharp
// Program.cs or ServiceCollectionExtensions
TypeAdapterConfig.GlobalSettings.Scan(typeof(ComponentMappingConfig).Assembly);
```

### Validation
- FluentValidation for request DTOs

### Concurrency
- Optimistic locking with `RowVersion` property
- Increment on each state change
- `FOR UPDATE` SQL for row-level locking when needed

### Domain Entities
- State transitions in entity methods
- Throw `DomainInvalidOperationException` for invalid transitions:
```csharp
public void MarkAsRunning(string containerId)
{
    if (Status != ScanStatus.Queued)
        throw new DomainInvalidOperationException("Can only start queued scans");
    Status = ScanStatus.Running;
    RowVersion++;
}
```

---

## Testing

- **Framework**: xUnit
- **Mocking**: NSubstitute (`Substitute.For<T>()`)
- **Assertions**: FluentAssertions (`.Should().Be()`)
- **Integration**: Aspire.Hosting.Testing
- **Naming**: `MethodName_Scenario_ExpectedResult`
- **Pattern**: Arrange-Act-Assert

```csharp
[Fact]
public void MarkAsRunning_WhenQueued_ShouldTransitionToRunning()
{
    // Arrange
    var scan = CreateQueuedScan();

    // Act
    scan.MarkAsRunning("container-123");

    // Assert
    scan.Status.Should().Be(ScanStatus.Running);
    scan.ContainerId.Should().Be("container-123");
}
```

---

## Verification Checklist

```
[ ] dotnet build --warnaserror - zero warnings
[ ] dotnet test - all tests pass (run from project root, not individual assemblies)
[ ] File-scoped namespaces used (no braces)
[ ] DTOs are sealed records with required/init
[ ] Guid.CreateVersion7() used, not NewGuid()
[ ] DateTimeOffset used, not DateTime
[ ] CancellationToken on all async methods
[ ] IReadOnlyList<T> for collection returns
[ ] Mapster used for mapping, no duplicated mapping logic
[ ] No TODO/FIXME comments
[ ] No commented-out code
[ ] No NotImplementedException in production code
```
