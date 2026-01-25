# Golden Standard PRD

> **Purpose**: This document defines the gold standard for writing Product Requirement Documents (PRDs) that can be deterministically decomposed into minute, executable tasks by humans *and* agents.

A PRD written to this standard removes ambiguity, constrains interpretation, and acts as a **direct input to task generation, implementation, and verification pipelines**.

---

## Core Principle

> **Every statement in this PRD MUST map to at least one of:**
> - a user behavior
> - a system responsibility
> - a constraint
> - a verifiable outcome

If a statement cannot be implemented, tested, or validated, it does not belong in the PRD.

---

## 1. Problem Statement (Observable & Verifiable)

Describe the problem in terms of **what is happening today**, **to whom**, and **with what measurable impact**.

### Guidelines
- No vision or aspiration language
- No solutions
- No internal assumptions

### Template

```
<Persona> currently experiences <observable problem>
This results in <measurable cost / delay / failure>
```

### Example

```
Platform engineers spend ~30–40% of sprint capacity manually wiring, retrying,
and debugging webhook delivery failures across tenants.
```

---

## 2. Goals (Measurable Outcomes)

Goals define **what success looks like** and MUST be measurable.

### Rules
- Each goal must have a numeric or binary success condition
- Goals MUST be achievable by the system described in this PRD

### Template

```
- Reduce <metric> from <current> to <target>
- Enable <persona> to perform <action> within <constraint>
```

### Example

```
- Reduce manual webhook failure handling by 80%
- Deliver events with P99 latency < 200ms at 50k events/sec per tenant
```

---

## 3. Non-Goals (Explicit Exclusions)

Non-goals prevent scope creep and accidental over-engineering.

### Rules
- Be explicit
- Say "no" clearly
- Assume engineers will otherwise try to build this

### Example

```
- No event transformation DSL in v1
- No UI for subscriber-side debugging
- No guaranteed ordering across tenants
```

---

## 4. User Personas

Define only personas that **interact directly with the system**.

### Template

```
Persona:
- Role:
- Primary Goal:
- Key Friction:
```

### Example

```
Persona:
- Role: Platform Engineer
- Primary Goal: Reliable event delivery without manual intervention
- Key Friction: Lack of visibility and retry control
```

---

## 5. System Boundary (Hard Box)

Clearly define what the system **owns** and what it **does not own**.

### Template

```
The system is responsible for:
- ...

The system is NOT responsible for:
- ...
```

### Example

```
The system is responsible for:
- Event ingestion
- Schema validation
- Fan-out delivery
- Retries and dead-lettering

The system is NOT responsible for:
- Downstream business logic
- Subscriber uptime
- Long-term analytics storage
```

---

## 6. User Flows (Step-by-Step)

Describe flows as **linear, observable steps**.

### Rules
- No branching logic here
- No technical implementation details
- One flow per primary action

### Template

```
1. User performs <action>
2. System responds with <observable behavior>
3. User observes <result>
```

---

## 7. Functional Requirements (Executable Logic)

All functional requirements MUST use **Given / When / Then** format.

### Rules
- No compound behaviors
- Each requirement should be independently testable

### Template

```
Given <initial state>
When <event occurs>
Then <system behavior>
And <additional system behavior>
```

### Example

```
Given a subscriber endpoint returns HTTP 500
When an event delivery attempt fails
Then the system retries with exponential backoff
And moves the event to dead-letter after N attempts
And emits a failure metric
```

---

## 8. Data Contracts (First-Class)

Data structures MUST be explicitly defined.

### Required
- Example payloads
- Field semantics
- Required vs optional
- Validation rules
- Versioning strategy

### Example

```json
{
  "id": "uuid",
  "type": "user.created",
  "source": "billing-service",
  "time": "RFC3339",
  "data": {
    "userId": "uuid",
    "email": "string (PII)",
    "country": "ISO-3166-1 alpha-2"
  }
}
```

---

## 9. Constraints & Assumptions

Constraints generate tasks. Treat them as first-class requirements.

### Categories
- Security
- Compliance
- Performance
- Cost
- Multi-tenancy
- Availability

### Example

```
- Tenant isolation MUST be enforced at data, routing, and metrics layers
- System MUST operate within defined cost budgets per tenant
```

---

## 10. Failure Modes

Enumerate known failure scenarios and required system behavior.

### Template

```
Failure:
- Condition:
- Expected System Response:
- Observable Outcome:
```

---

## 11. Metrics & SLIs

Metrics define operational truth.

### Required
- What is measured
- Why it matters
- Acceptable thresholds

### Example

```
- Event delivery success rate (>= 99.9%)
- Retry exhaustion count per tenant
- Dead-letter queue depth
```

---

## 12. Rollout & Migration

Define how this system reaches production safely.

### Include
- Feature flags
- Backward compatibility
- Migration steps
- Rollback plan

---

## 13. Definition of Done (Verifiable)

"Done" MUST be objectively verifiable.

### Example

```
The feature is complete when:
- All acceptance tests pass
- Load tests meet defined SLIs
- Public API documentation exists
- On-call runbook is written
```

---

## Final Litmus Test

This PRD meets the gold standard if:

- A senior engineer, junior engineer, and AI agent
- Independently produce nearly identical task graphs
- And ask minimal clarification questions

If someone asks:

> "What do you mean by…?"

The PRD is underspecified.

---

> **Summary**: A perfect PRD is not a document of ideas — it is a deterministic input to a task-generation machine.

