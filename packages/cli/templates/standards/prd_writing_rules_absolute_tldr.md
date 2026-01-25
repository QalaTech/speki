# PRD Writing Rules — TL;DR (NON-NEGOTIABLE)

> **Purpose**: These rules define how a PRD MUST be written so it can be deterministically decomposed into minute, executable tasks by humans and AI agents.
>
> This PRD is a **deterministic input to task generation**. If something cannot be implemented, tested, or verified, it does not belong.

---

## 1. Write Only What Can Be Built

- ❌ No ideas
- ❌ No aspirations
- ❌ No vision statements
- ❌ No strategy language
- ✅ Only observable behaviors, system responsibilities, constraints, and outcomes

**Rule**: If a sentence cannot directly generate implementation or test tasks, delete it.

---

## 2. Problems Must Be Observable

Problems MUST describe what is happening **today**.

- Who experiences the problem
- What is happening
- What measurable cost, delay, or failure occurs

❌ “Users struggle with event delivery”  
✅ “Engineers spend ~30% of sprint capacity manually retrying failed event deliveries”

---

## 3. Goals MUST Be Measurable

Every goal MUST have a numeric, threshold, or binary success condition.

❌ “Improve reliability”  
✅ “Achieve 99.9% successful delivery over a 24h window”

**Rule**: If success cannot be measured, the goal is invalid.

---

## 4. Behaviors Only — No Adjectives

The following words are banned unless converted into explicit behavior:

- scalable
- robust
- flexible
- simple
- powerful
- enterprise-grade

**Rule**: Replace adjectives with limits, thresholds, and guarantees.

---

## 5. Functional Requirements MUST Use Given / When / Then

All functional requirements MUST be written as executable logic.

```
Given <initial state>
When <event occurs>
Then <system behavior>
And <additional behavior>
```

**Rules**:
- One behavior per requirement
- Independently testable
- No implicit assumptions

---

## 6. Data Is a First-Class Requirement

All data structures MUST be explicitly defined.

Required:
- Example payloads
- Field semantics
- Required vs optional fields
- Validation rules

❌ “The system stores events”  
✅ “The system stores CloudEvents v1.0 with strict schema validation”

---

## 7. Constraints Are Mandatory

Constraints MUST be explicitly stated.

At minimum, define constraints for:
- performance
- security
- tenancy
- cost
- availability

**Rule**: If a constraint is not written, it is assumed to not exist.

---

## 8. Non-Goals Are Required

You MUST explicitly state what is out of scope.

If something is not explicitly excluded, engineers will assume it is required.

---

## 9. Failure Is a Feature — Define It

Failure modes MUST be enumerated.

For each failure:
- triggering condition
- expected system behavior
- observable outcome

❌ “Handles failures gracefully”  
✅ Explicit failure handling logic

---

## 10. Definition of Done MUST Be Verifiable

“Done” MUST be objectively checkable.

Done means:
- tests pass
- metrics meet thresholds
- documentation exists
- runbooks exist (if applicable)

**Rule**: If human judgment is required to declare done, it is invalid.

---

## 11. NO Migrations or Backward Compatibility (Unless Explicitly Required)

Default assumption: **greenfield**.

- ❌ No data migrations
- ❌ No backward compatibility guarantees
- ❌ No legacy support
- ❌ No transitional states

If migration or compatibility is required, it MUST be:
- explicitly stated as a goal
- explicitly constrained
- explicitly scoped

---

## 12. No Implicit Ownership

The PRD MUST clearly define:
- what the system owns
- what it integrates with
- what it explicitly does NOT own

Anything not owned is treated as an external dependency.

---

## 13. One Interpretation Only

A valid PRD:
- produces the same task graph for different engineers
- produces minimal clarification questions
- can be executed by an AI agent without guessing

If interpretation is required, the PRD has failed.

---

## Final Rule (The Only One That Matters)

> **If someone asks “what do you mean by…?” — the PRD is wrong.**

---

**Summary**: A PRD is not a document of ideas. It is a deterministic input to a task-generation machine.
