import { http, HttpResponse } from 'msw';

// ============================================================================
// Mock Data
// ============================================================================

// Note: Execution data is primarily populated via SSE, not REST endpoints.
// These handlers are placeholders for any REST endpoints that may be added.

// ============================================================================
// Handlers
// ============================================================================

export const executionHandlers = [
  // Placeholder for any REST execution endpoints
  // Most execution data comes from SSE (useExecutionSSE hook)
];
