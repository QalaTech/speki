import { http, HttpResponse } from 'msw';
import type {
  SpecFileNode,
  SpecSession,
  Suggestion,
  GenerationStatus,
} from '@features/specs/api/queries';

// ============================================================================
// Mock Data
// ============================================================================

export const mockSpecTree: SpecFileNode[] = [
  {
    name: 'specs',
    path: 'specs',
    type: 'folder',
    children: [
      {
        name: 'feature-a.md',
        path: 'specs/feature-a.md',
        type: 'file',
        reviewStatus: 'reviewed',
      },
      {
        name: 'feature-b.md',
        path: 'specs/feature-b.md',
        type: 'file',
        reviewStatus: 'none',
      },
      {
        name: 'subfolder',
        path: 'specs/subfolder',
        type: 'folder',
        children: [
          {
            name: 'nested-spec.md',
            path: 'specs/subfolder/nested-spec.md',
            type: 'file',
            reviewStatus: 'pending',
          },
        ],
      },
    ],
  },
];

export const mockSpecContent = `# Feature A

## Overview
This is a test spec for Feature A.

## Requirements
- Requirement 1
- Requirement 2

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
`;

export const mockSuggestions: Suggestion[] = [
  {
    id: 'suggestion-1',
    type: 'change',
    severity: 'warning',
    section: 'Requirements',
    lineStart: 7,
    lineEnd: 8,
    issue: 'Requirements are too vague',
    suggestedFix: 'Add specific acceptance criteria with measurable outcomes',
    status: 'pending',
    tags: ['documentation'],
  },
  {
    id: 'suggestion-2',
    type: 'comment',
    severity: 'info',
    section: 'Overview',
    lineStart: 3,
    lineEnd: 3,
    issue: 'Consider adding a problem statement',
    suggestedFix: 'Add a "Problem" section describing the user pain point',
    status: 'pending',
    tags: ['ux'],
  },
];

export const mockSession: SpecSession = {
  sessionId: 'session-123',
  specFilePath: 'specs/feature-a.md',
  status: 'completed',
  startedAt: '2024-01-15T10:00:00Z',
  lastUpdatedAt: '2024-01-15T10:05:00Z',
  completedAt: '2024-01-15T10:05:00Z',
  suggestions: mockSuggestions,
  reviewResult: {
    verdict: 'NEEDS_IMPROVEMENT',
    suggestions: mockSuggestions,
  },
  chatMessages: [],
  contentHash: 'abc123',
};

export const mockGenerationStatus: GenerationStatus = {
  generating: false,
};

export const mockStatuses: Record<string, string> = {
  'specs/feature-a.md': 'reviewed',
  'specs/feature-b.md': 'none',
  'specs/subfolder/nested-spec.md': 'pending',
};

// ============================================================================
// Handlers
// ============================================================================

export const specsHandlers = [
  // GET /api/spec-review/files - Get spec file tree
  http.get('/api/spec-review/files', () => {
    return HttpResponse.json({ files: mockSpecTree });
  }),

  // GET /api/sessions/statuses - Get review statuses for all specs
  http.get('/api/sessions/statuses', () => {
    return HttpResponse.json({ statuses: mockStatuses });
  }),

  // GET /api/spec-review/content/:path - Get spec content
  http.get('/api/spec-review/content/:path', ({ params }) => {
    const path = params.path as string;

    // Return 404 for non-existent specs
    if (path.includes('nonexistent')) {
      return HttpResponse.json(
        { error: 'Spec not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json({ content: mockSpecContent });
  }),

  // GET /api/sessions/spec/:path - Get session for a spec
  http.get('/api/sessions/spec/:path', ({ params }) => {
    const path = params.path as string;

    // Return null for specs without sessions
    if (path.includes('feature-b')) {
      return HttpResponse.json({ session: null });
    }

    return HttpResponse.json({
      session: {
        ...mockSession,
        specFilePath: decodeURIComponent(path),
      },
    });
  }),

  // GET /api/decompose/generation-status - Get tech spec generation status
  http.get('/api/decompose/generation-status', () => {
    return HttpResponse.json(mockGenerationStatus);
  }),

  // POST /api/spec-review/start - Start a review
  http.post('/api/spec-review/start', async ({ request }) => {
    const body = (await request.json()) as { specFile: string; sessionId?: string };

    if (!body.specFile) {
      return HttpResponse.json(
        { error: 'specFile is required' },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      sessionId: 'new-session-456',
      status: 'in_progress',
    });
  }),

  // GET /api/spec-review/status/:sessionId - Get review status
  http.get('/api/spec-review/status/:sessionId', () => {
    return HttpResponse.json({ status: 'completed' });
  }),

  // PUT /api/spec-review/content/:path - Save spec content
  http.put('/api/spec-review/content/:path', () => {
    return HttpResponse.json({ success: true });
  }),

  // PUT /api/spec-review/suggestion - Update suggestion status
  http.put('/api/spec-review/suggestion', async ({ request }) => {
    const body = (await request.json()) as {
      sessionId: string;
      suggestionId: string;
      action: string;
      userVersion?: string;
    };

    return HttpResponse.json({
      success: true,
      suggestion: {
        ...mockSuggestions[0],
        id: body.suggestionId,
        status: body.action,
      },
    });
  }),

  // POST /api/spec-review/new - Create a new spec
  http.post('/api/spec-review/new', async ({ request }) => {
    const body = (await request.json()) as { name: string; type: string };

    if (!body.name || !body.type) {
      return HttpResponse.json(
        { success: false, error: 'name and type are required' },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      success: true,
      filePath: `specs/${body.name}.md`,
    });
  }),
];
