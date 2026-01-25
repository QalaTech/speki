import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import sessionsRouter from '../routes/sessions.js';
import * as sessionFileModule from '@speki/core';
import type { SessionFile } from '@speki/core';

vi.mock('@speki/core', () => ({
  loadSession: vi.fn(),
  saveSession: vi.fn(),
  getSessionPath: vi.fn(),
}));

let mockProjectPath = '/test/project';

vi.mock('../middleware/project-context.js', () => ({
  projectContext: () => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    req.projectPath = mockProjectPath;
    next();
  },
}));

function createMockSession(specPath: string): SessionFile {
  return {
    sessionId: 'test-session-123',
    specFilePath: specPath,
    status: 'completed',
    startedAt: '2026-01-11T10:00:00Z',
    lastUpdatedAt: '2026-01-11T10:01:00Z',
    completedAt: '2026-01-11T10:01:00Z',
    suggestions: [],
    changeHistory: [],
    chatMessages: [],
    reviewResult: {
      verdict: 'PASS',
      categories: {},
      codebaseContext: { projectType: 'nodejs', existingPatterns: [], relevantFiles: [] },
      suggestions: [],
      logPath: '/test/log.json',
      durationMs: 60000,
    },
  };
}

describe('sessions routes', () => {
  let app: express.Express;
  let testDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/sessions', sessionsRouter);

    testDir = await fs.mkdtemp(join(tmpdir(), 'sessions-test-'));
    mockProjectPath = testDir;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('GET /api/sessions/spec/:specPath', () => {
    it('should return session when it exists', async () => {
      const specPath = '/path/to/my-spec.md';
      const mockSession = createMockSession(specPath);
      vi.mocked(sessionFileModule.loadSession).mockResolvedValue(mockSession);

      const response = await request(app).get(`/api/sessions/spec/${encodeURIComponent(specPath)}`);

      expect(response.status).toBe(200);
      expect(response.body.session).toEqual(mockSession);
      expect(sessionFileModule.loadSession).toHaveBeenCalledWith(specPath, testDir);
    });

    it('should return null when session does not exist', async () => {
      const specPath = '/path/to/nonexistent.md';
      vi.mocked(sessionFileModule.loadSession).mockResolvedValue(null);

      const response = await request(app).get(`/api/sessions/spec/${encodeURIComponent(specPath)}`);

      expect(response.status).toBe(200);
      expect(response.body.session).toBeNull();
      expect(sessionFileModule.loadSession).toHaveBeenCalledWith(specPath, testDir);
    });
  });

  describe('PUT /api/sessions/spec/:specPath', () => {
    it('should save session state', async () => {
      const specPath = '/path/to/my-spec.md';
      const inputSession = {
        sessionId: 'test-session-456',
        specFilePath: specPath,
        status: 'in_progress',
        startedAt: '2026-01-11T12:00:00Z',
        lastUpdatedAt: '2026-01-11T12:00:00Z',
        suggestions: [],
        changeHistory: [],
        chatMessages: [],
      };
      vi.mocked(sessionFileModule.saveSession).mockResolvedValue(undefined);

      const response = await request(app)
        .put(`/api/sessions/spec/${encodeURIComponent(specPath)}`)
        .send({ session: inputSession });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(sessionFileModule.saveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'test-session-456',
          specFilePath: specPath,
          status: 'in_progress',
        }),
        testDir
      );
    });

    it('should return 400 when session body is missing', async () => {
      const specPath = '/path/to/my-spec.md';

      const response = await request(app)
        .put(`/api/sessions/spec/${encodeURIComponent(specPath)}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('session is required in request body');
    });
  });

  describe('GET /api/sessions/spec/:specPath/exists', () => {
    it('should return true when session file exists', async () => {
      const specPath = '/path/to/my-spec.md';
      const sessionsDir = join(testDir, '.speki', 'sessions');
      await fs.mkdir(sessionsDir, { recursive: true });
      const sessionFilePath = join(sessionsDir, 'my-spec.session.json');
      await fs.writeFile(sessionFilePath, JSON.stringify(createMockSession(specPath)));

      vi.mocked(sessionFileModule.getSessionPath).mockReturnValue(sessionFilePath);

      const response = await request(app).get(`/api/sessions/spec/${encodeURIComponent(specPath)}/exists`);

      expect(response.status).toBe(200);
      expect(response.body.exists).toBe(true);
      expect(sessionFileModule.getSessionPath).toHaveBeenCalledWith(specPath, testDir);
    });

    it('should return false when session file does not exist', async () => {
      const specPath = '/path/to/nonexistent.md';
      const nonexistentPath = join(testDir, '.speki', 'sessions', 'nonexistent.session.json');
      vi.mocked(sessionFileModule.getSessionPath).mockReturnValue(nonexistentPath);

      const response = await request(app).get(`/api/sessions/spec/${encodeURIComponent(specPath)}/exists`);

      expect(response.status).toBe(200);
      expect(response.body.exists).toBe(false);
    });
  });
});
