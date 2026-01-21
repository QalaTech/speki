---
type: tech-spec
status: draft
created: {{date}}
parent: {{parent}}
---

# {{title}}

## Overview

Brief description of what this technical specification covers and its relationship to the parent PRD.

**Parent PRD:** {{parent}}
**User Stories Covered:** {{storyIds}}

## Technical Approach

### Architecture

Describe the high-level technical approach and architectural decisions.

```
[Architecture diagram or component layout]
```

**Key Decisions:**
- Decision 1: [rationale]
- Decision 2: [rationale]

## Database Changes

> If not applicable, state: **N/A** - [one-line justification]

```sql
-- Migration: description
CREATE TABLE example (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_example_created ON example(created_at);
```

**Schema Changes:**
| Table | Change | Reason |
|-------|--------|--------|
| example | Add column | ... |

## API Changes

> If not applicable, state: **N/A** - [one-line justification]

### Endpoints

**POST /api/v1/resource**
```json
// Request
{
  "field": "string"
}

// Response 201
{
  "id": "string",
  "created_at": "datetime"
}

// Error 400
{
  "error": "validation_failed",
  "details": [{ "field": "name", "message": "required" }]
}
```

## Code Structure

```
src/
├── feature/
│   ├── index.ts        # Public exports
│   ├── types.ts        # Type definitions
│   ├── service.ts      # Business logic
│   └── repository.ts   # Data access
```

**Files to Create:**
| File | Purpose |
|------|---------|
| `src/feature/service.ts` | Business logic |

**Files to Modify:**
| File | Change |
|------|--------|
| `src/index.ts` | Export new feature |

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Empty input | Return 400 validation error |
| Duplicate entry | Return 409 conflict |
| Concurrent access | Use optimistic locking |
| Max length exceeded | Truncate or reject with error |

## Error Handling

| Error Condition | HTTP Status | Response | Recovery |
|-----------------|-------------|----------|----------|
| Validation failure | 400 | Field errors | Fix input and retry |
| Not found | 404 | Resource ID | Check ID exists |
| Conflict | 409 | Existing resource | Fetch and merge |
| Server error | 500 | Error ID | Retry with backoff |

## Testing Strategy

### Unit Tests
- [ ] Service logic with mocked dependencies
- [ ] Validation rules
- [ ] Error handling paths
- [ ] Edge cases from table above

### Integration Tests
- [ ] API endpoint happy path
- [ ] API endpoint error cases
- [ ] Database operations
- [ ] End-to-end flow

**Test Coverage Target:** >80%

## Security Considerations

- **Authentication:** [method - JWT, API key, session]
- **Authorization:** [rules - who can access what]
- **Input Validation:** [what is validated, how]
- **Data Sensitivity:** [PII, secrets, classification]
- **Rate Limiting:** [limits per endpoint]

## Performance Considerations

- **Expected Load:** X requests/second
- **Latency Target:** <Y ms p99
- **Caching Strategy:** [what, where, TTL]
- **Database Queries:** [estimated count per request]
- **Potential Bottlenecks:** [identified risks]

## Open Questions

> List unresolved items. If none, state: **None identified.**

- [ ] Question 1
- [ ] Question 2
