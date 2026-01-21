```markdown
---
paths:
  - "**/router.py"
  - "**/routes/**/*.py"
  - "**/api/**/*.py"
  - "**/handlers/**/*.py"
  - "**/controllers/**/*.py"
  - "*.py"  # Broad for API files
---

# RESTful API Design Best Practices

Strictly apply these **gold-standard RESTful API design principles** (drawn from Roy Fielding's dissertation, Microsoft
REST API Guidelines, Google API Design Guide, and modern industry consensus) to **all** HTTP APIs. The goal is
stateless, cacheable, scalable, maintainable, and client-friendly interfaces.

REST emphasizes: Client-Server, Statelessness, Cacheability, Uniform Interface, Layered System, Code on Demand (
optional). Prioritize resource-oriented design over RPC-style.

## Core Constraints

- **Stateless**: Each request contains all info needed—no server-side session state.
- **Cacheable**: Responses explicitly mark cacheability (e.g., headers).
- **Uniform Interface**: Consistent resource identification, manipulation via representations, self-descriptive
  messages, HATEOAS (hypermedia links—advanced/optional).
- **Resource-Oriented**: Model as nouns (resources), not verbs.

## Resource Naming & URLs

- Use **nouns** for resources (plural preferred).
- Hierarchical, logical paths.
- Lowercase, kebab-case or snake_case (consistent).
- Avoid verbs in URLs.

```text
# Good
GET    /users
GET    /users/{id}
POST   /users
GET    /users/{id}/orders
GET    /orders/{id}

# Bad
GET    /getUsers
POST   /createUser
GET    /getUserOrders
```

- Sub-resources: `/users/{userId}/posts/{postId}`

## HTTP Methods & Idempotency

- **GET**: Safe, idempotent—retrieve (no body).
- **POST**: Create (non-idempotent).
- **PUT**: Replace entire resource (idempotent).
- **PATCH**: Partial update (idempotent if possible).
- **DELETE**: Remove (idempotent).

Prefer PUT/PATCH for updates; POST for non-idempotent actions.

## Status Codes

Use standard codes consistently:

- 200 OK (GET/PUT/PATCH success)
- 201 Created (POST success, include Location header)
- 202 Accepted (async processing)
- 204 No Content (DELETE success, no body)
- 301/308 Redirect
- 400 Bad Request (client error)
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 405 Method Not Allowed
- 409 Conflict
- 415 Unsupported Media Type
- 429 Too Many Requests
- 500 Internal Server Error (avoid details)

## Request/Response Formats

- JSON default (application/json).
- Consistent structure.
- Plural for collections.

```json
// Collection
{
  "users": [
    ...
  ],
  "pagination": {
    ...
  }
}

// Single
{
  "id": "123",
  "name": "Andrew",
  "email": "andrew@example.com"
}
```

## Pagination, Filtering, Sorting

- **Pagination**: Cursor-based preferred (opaque token); offset fallback.
- Query params: ?page=2&limit=20 or ?cursor=abc&limit=20
- Include links/metadata (next/prev).

- **Filtering**: ?status=active&role=admin
- **Sorting**: ?sort=-created_at,name
- **Field selection**: ?fields=id,name,email

## Error Handling

- Consistent format (RFC 7807 Problem Details recommended).

```json
{
  "type": "/errors/validation",
  "title": "Validation Error",
  "status": 400,
  "detail": "Invalid email",
  "instance": "/users",
  "errors": [
    {
      "field": "email",
      "message": "Invalid format"
    }
  ]
}
```

- No stack traces in production.

## Versioning

- URI versioning preferred: /v1/users (simple, cacheable).
- Alternatives: Header (Accept: application/vnd.api.v1+json), query (rare).
- Avoid "no versioning"—plan from day 1.

## Caching & Performance

- Use ETag/If-None-Match for conditional GETs.
- Cache-Control headers.
- Prefer GET for reads.

## Security

- HTTPS always.
- Authentication: JWT/Bearer, API keys.
- Rate limiting (429).
- Input validation.
- CORS carefully.

## Advanced: HATEOAS (Optional)

Include links for discoverability.

```json
{
  "id": "123",
  "name": "Andrew",
  "links": {
    "self": "/users/123",
    "orders": "/users/123/orders"
  }
}
```

## Quick Checklist (Before Every API Change)

- [ ] Resources as nouns; logical hierarchy
- [ ] Correct HTTP methods & idempotency
- [ ] Appropriate status codes
- [ ] Consistent JSON structure
- [ ] Pagination/filtering/sorting supported
- [ ] Errors in standard format
- [ ] Versioned endpoints
- [ ] Cache headers where possible
- [ ] Secure (HTTPS, auth, validation)
- [ ] Documented (OpenAPI)