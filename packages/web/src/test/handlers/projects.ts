import { http, HttpResponse } from 'msw';
import type { ProjectEntry } from '@features/projects/api/queries';

// ============================================================================
// Mock Data
// ============================================================================

export const mockProjects: ProjectEntry[] = [
  {
    name: 'test-project-1',
    path: '/Users/test/projects/test-project-1',
    status: 'idle',
    lastActivity: '2024-01-15T10:30:00Z',
  },
  {
    name: 'test-project-2',
    path: '/Users/test/projects/test-project-2',
    status: 'running',
    lastActivity: '2024-01-15T11:00:00Z',
  },
];

// ============================================================================
// Handlers
// ============================================================================

export const projectsHandlers = [
  // GET /api/projects - List all projects
  http.get('/api/projects', () => {
    return HttpResponse.json(mockProjects);
  }),

  // POST /api/ralph/start - Start Ralph execution
  http.post('/api/ralph/start', ({ request }) => {
    const url = new URL(request.url);
    const project = url.searchParams.get('project');

    if (!project) {
      return HttpResponse.json(
        { error: 'Project parameter is required' },
        { status: 400 }
      );
    }

    return HttpResponse.json({ success: true });
  }),

  // POST /api/ralph/stop - Stop Ralph execution
  http.post('/api/ralph/stop', ({ request }) => {
    const url = new URL(request.url);
    const project = url.searchParams.get('project');

    if (!project) {
      return HttpResponse.json(
        { error: 'Project parameter is required' },
        { status: 400 }
      );
    }

    return HttpResponse.json({ success: true });
  }),
];
