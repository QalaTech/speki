import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import specReviewRouter from '../routes/spec-review.js';
import * as runnerModule from '../../core/spec-review/runner.js';
import * as splitterModule from '../../core/spec-review/splitter.js';
import * as godSpecDetectorModule from '../../core/spec-review/god-spec-detector.js';
import * as sessionFileModule from '../../core/spec-review/session-file.js';
import type { SpecReviewResult, GodSpecIndicators, SplitProposal, SessionFile } from '../../types/index.js';

vi.mock('../../core/spec-review/runner.js', () => ({
  runSpecReview: vi.fn(),
}));

vi.mock('../../core/spec-review/splitter.js', () => ({
  executeSplit: vi.fn(),
}));

vi.mock('../../core/spec-review/god-spec-detector.js', () => ({
  detectGodSpec: vi.fn(),
  generateSplitProposal: vi.fn(),
}));

vi.mock('../../core/spec-review/session-file.js', () => ({
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

describe('spec-review routes', () => {
  let app: express.Express;
  let testDir: string;
  let testSpecPath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/spec-review', specReviewRouter);

    testDir = await fs.mkdtemp(join(tmpdir(), 'spec-review-test-'));
    testSpecPath = join(testDir, 'test-spec.md');
    await fs.writeFile(testSpecPath, '# Test Spec\n\nThis is a test spec.');
    mockProjectPath = '/test/project';
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('GET /api/spec-review/files', () => {
    it('GET_files_ReturnsMarkdownFiles', async () => {
      const specsDir = join(testDir, 'specs');
      await fs.mkdir(specsDir, { recursive: true });
      await fs.writeFile(join(specsDir, 'feature.md'), '# Feature');
      await fs.writeFile(join(specsDir, 'another.md'), '# Another');
      mockProjectPath = testDir;

      const response = await request(app).get('/api/spec-review/files');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('files');
      expect(Array.isArray(response.body.files)).toBe(true);
      const fileNames = response.body.files.map((f: { name: string }) => f.name);
      expect(fileNames).toContain('feature.md');
      expect(fileNames).toContain('another.md');
    });
  });

  describe('POST /api/spec-review/start', () => {
    it('POST_start_InitiatesReview', async () => {
      const mockResult: SpecReviewResult = {
        verdict: 'PASS',
        categories: {},
        codebaseContext: { projectType: 'nodejs', existingPatterns: [], relevantFiles: [] },
        suggestions: [],
        logPath: '/test/log.json',
        durationMs: 1000,
      };
      vi.mocked(runnerModule.runSpecReview).mockResolvedValue(mockResult);
      vi.mocked(sessionFileModule.saveSession).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/spec-review/start')
        .send({ specFile: testSpecPath });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessionId');
      expect(response.body.status).toBe('completed');
      expect(response.body.verdict).toBe('PASS');
      expect(runnerModule.runSpecReview).toHaveBeenCalledWith(
        testSpecPath,
        expect.objectContaining({
          cwd: '/test/project',
        })
      );
    });

    it('POST_start_WithMissingFile_Returns404', async () => {
      const response = await request(app)
        .post('/api/spec-review/start')
        .send({ specFile: '/nonexistent/file.md' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Spec file not found');
    });

    it('POST_start_WithNonMarkdownFile_Returns400', async () => {
      const txtFile = join(testDir, 'test.txt');
      await fs.writeFile(txtFile, 'Not markdown');

      const response = await request(app)
        .post('/api/spec-review/start')
        .send({ specFile: txtFile });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Only markdown files (.md) are supported');
    });
  });

  describe('GET /api/spec-review/status/:sessionId', () => {
    it('GET_status_ReturnsResults', async () => {
      const sessionsDir = join(testDir, '.ralph', 'sessions');
      await fs.mkdir(sessionsDir, { recursive: true });
      const mockSession: SessionFile = {
        sessionId: 'test-session-123',
        specFilePath: testSpecPath,
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

      await fs.writeFile(
        join(sessionsDir, 'test-spec.session.json'),
        JSON.stringify(mockSession)
      );
      mockProjectPath = testDir;

      const response = await request(app).get('/api/spec-review/status/test-session-123');

      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBe('test-session-123');
      expect(response.body.status).toBe('completed');
      expect(response.body.reviewResult.verdict).toBe('PASS');
    });

    it('GET_status_WithInvalidSessionId_Returns404', async () => {
      const sessionsDir = join(testDir, '.ralph', 'sessions');
      await fs.mkdir(sessionsDir, { recursive: true });
      mockProjectPath = testDir;

      const response = await request(app).get('/api/spec-review/status/nonexistent-session');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Session not found');
    });
  });

  describe('POST /api/spec-review/split', () => {
    it('POST_split_CreatesFiles', async () => {
      const proposal: SplitProposal = {
        originalFile: 'test-spec.md',
        reason: 'Spec too large',
        proposedSpecs: [
          {
            filename: 'auth-spec.md',
            description: 'Authentication feature',
            estimatedStories: 5,
            sections: ['Authentication'],
          },
        ],
      };
      const createdFiles = [join(testDir, 'auth-spec.md')];
      vi.mocked(splitterModule.executeSplit).mockResolvedValue(createdFiles);

      const response = await request(app)
        .post('/api/spec-review/split')
        .send({ specFile: testSpecPath, proposal });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.createdFiles).toEqual(createdFiles);
      expect(splitterModule.executeSplit).toHaveBeenCalledWith(testSpecPath, proposal);
    });

    it('POST_split_WithMissingSpecFile_Returns400', async () => {
      const response = await request(app)
        .post('/api/spec-review/split')
        .send({ proposal: {} });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('specFile is required');
    });

    it('POST_split_WithMissingProposal_Returns400', async () => {
      const response = await request(app)
        .post('/api/spec-review/split')
        .send({ specFile: testSpecPath });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('proposal is required');
    });
  });

  describe('POST /api/spec-review/split/preview', () => {
    it('POST_splitPreview_ReturnsPreview', async () => {
      const godSpecResult: GodSpecIndicators = {
        isGodSpec: true,
        estimatedStories: 25,
        featureDomains: ['Authentication', 'User Management'],
        indicators: ['Too many features'],
        systemBoundaries: [],
      };
      const proposal: SplitProposal = {
        originalFile: 'test-spec.md',
        reason: 'Spec too large',
        proposedSpecs: [
          {
            filename: 'auth-spec.md',
            description: 'Authentication feature',
            estimatedStories: 12,
            sections: ['Authentication'],
          },
          {
            filename: 'user-management-spec.md',
            description: 'User management feature',
            estimatedStories: 13,
            sections: ['User Management'],
          },
        ],
      };
      vi.mocked(godSpecDetectorModule.detectGodSpec).mockReturnValue(godSpecResult);
      vi.mocked(godSpecDetectorModule.generateSplitProposal).mockReturnValue(proposal);

      const response = await request(app)
        .post('/api/spec-review/split/preview')
        .send({ specFile: testSpecPath });

      expect(response.status).toBe(200);
      expect(response.body.isGodSpec).toBe(true);
      expect(response.body.proposal).toEqual(proposal);
      expect(response.body.indicators).toEqual(['Too many features']);
      expect(response.body.estimatedStories).toBe(25);
      expect(response.body.featureDomains).toEqual(['Authentication', 'User Management']);
    });

    it('POST_splitPreview_WithNonGodSpec_ReturnsNotNeeded', async () => {
      const godSpecResult: GodSpecIndicators = {
        isGodSpec: false,
        estimatedStories: 5,
        featureDomains: ['Simple Feature'],
        indicators: [],
        systemBoundaries: [],
      };
      vi.mocked(godSpecDetectorModule.detectGodSpec).mockReturnValue(godSpecResult);

      const response = await request(app)
        .post('/api/spec-review/split/preview')
        .send({ specFile: testSpecPath });

      expect(response.status).toBe(200);
      expect(response.body.isGodSpec).toBe(false);
      expect(response.body.message).toContain('does not need splitting');
    });

    it('POST_splitPreview_WithMissingSpecFile_Returns400', async () => {
      const response = await request(app)
        .post('/api/spec-review/split/preview')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('specFile is required');
    });
  });
});
