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
  buildSplitContent: vi.fn(),
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

  describe('POST /api/spec-review/feedback', () => {
    it('POST_feedback_Approved_UpdatesSession', async () => {
      const sessionsDir = join(testDir, '.ralph', 'sessions');
      await fs.mkdir(sessionsDir, { recursive: true });
      const mockSession: SessionFile = {
        sessionId: 'feedback-session-123',
        specFilePath: testSpecPath,
        status: 'completed',
        startedAt: '2026-01-11T10:00:00Z',
        lastUpdatedAt: '2026-01-11T10:01:00Z',
        suggestions: [
          {
            id: 'suggestion-1',
            category: 'clarity',
            severity: 'warning',
            section: 'Introduction',
            textSnippet: 'Some text',
            issue: 'Unclear requirement',
            suggestedFix: 'Make it clearer',
            status: 'pending',
          },
        ],
        changeHistory: [],
        chatMessages: [],
      };

      await fs.writeFile(
        join(sessionsDir, 'test-spec.session.json'),
        JSON.stringify(mockSession)
      );
      mockProjectPath = testDir;

      const response = await request(app)
        .post('/api/spec-review/feedback')
        .send({
          sessionId: 'feedback-session-123',
          suggestionId: 'suggestion-1',
          action: 'approved',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.suggestion.status).toBe('approved');
      expect(response.body.suggestion.reviewedAt).toBeDefined();
    });

    it('POST_feedback_Rejected_UpdatesSession', async () => {
      const sessionsDir = join(testDir, '.ralph', 'sessions');
      await fs.mkdir(sessionsDir, { recursive: true });
      const mockSession: SessionFile = {
        sessionId: 'reject-session-123',
        specFilePath: testSpecPath,
        status: 'completed',
        startedAt: '2026-01-11T10:00:00Z',
        lastUpdatedAt: '2026-01-11T10:01:00Z',
        suggestions: [
          {
            id: 'suggestion-2',
            category: 'testability',
            severity: 'info',
            section: 'Testing',
            textSnippet: 'Some text',
            issue: 'May be hard to test',
            suggestedFix: 'Add mocks',
            status: 'pending',
          },
        ],
        changeHistory: [],
        chatMessages: [],
      };

      await fs.writeFile(
        join(sessionsDir, 'test-spec.session.json'),
        JSON.stringify(mockSession)
      );
      mockProjectPath = testDir;

      const response = await request(app)
        .post('/api/spec-review/feedback')
        .send({
          sessionId: 'reject-session-123',
          suggestionId: 'suggestion-2',
          action: 'rejected',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.suggestion.status).toBe('rejected');
      expect(response.body.suggestion.reviewedAt).toBeDefined();
    });

    it('POST_feedback_Edited_UpdatesSession', async () => {
      const sessionsDir = join(testDir, '.ralph', 'sessions');
      await fs.mkdir(sessionsDir, { recursive: true });
      const mockSession: SessionFile = {
        sessionId: 'edit-session-123',
        specFilePath: testSpecPath,
        status: 'completed',
        startedAt: '2026-01-11T10:00:00Z',
        lastUpdatedAt: '2026-01-11T10:01:00Z',
        suggestions: [
          {
            id: 'suggestion-3',
            category: 'completeness',
            severity: 'critical',
            section: 'Requirements',
            textSnippet: 'Some text',
            issue: 'Missing requirement',
            suggestedFix: 'Add requirement X',
            status: 'pending',
          },
        ],
        changeHistory: [],
        chatMessages: [],
      };

      await fs.writeFile(
        join(sessionsDir, 'test-spec.session.json'),
        JSON.stringify(mockSession)
      );
      mockProjectPath = testDir;

      const userVersion = 'My custom fix for this issue';
      const response = await request(app)
        .post('/api/spec-review/feedback')
        .send({
          sessionId: 'edit-session-123',
          suggestionId: 'suggestion-3',
          action: 'edited',
          userVersion,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.suggestion.status).toBe('edited');
      expect(response.body.suggestion.userVersion).toBe(userVersion);
      expect(response.body.suggestion.reviewedAt).toBeDefined();
    });
  });

  describe('POST /api/spec-review/chat', () => {
    it('POST_chat_SendsToAgent', async () => {
      const sessionsDir = join(testDir, '.ralph', 'sessions');
      await fs.mkdir(sessionsDir, { recursive: true });
      const mockSession: SessionFile = {
        sessionId: 'chat-session-123',
        specFilePath: testSpecPath,
        status: 'completed',
        startedAt: '2026-01-11T10:00:00Z',
        lastUpdatedAt: '2026-01-11T10:01:00Z',
        suggestions: [],
        changeHistory: [],
        chatMessages: [],
      };

      await fs.writeFile(
        join(sessionsDir, 'test-spec.session.json'),
        JSON.stringify(mockSession)
      );
      mockProjectPath = testDir;

      const response = await request(app)
        .post('/api/spec-review/chat')
        .send({
          sessionId: 'chat-session-123',
          message: 'Can you explain this suggestion?',
          suggestionId: 'suggestion-1',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message.role).toBe('user');
      expect(response.body.message.content).toBe('Can you explain this suggestion?');
      expect(response.body.message.suggestionId).toBe('suggestion-1');
      expect(response.body.message.id).toBeDefined();
      expect(response.body.message.timestamp).toBeDefined();
    });

    it('POST_chat_IncludesSelectionContext', async () => {
      const sessionsDir = join(testDir, '.ralph', 'sessions');
      await fs.mkdir(sessionsDir, { recursive: true });
      const mockSession: SessionFile = {
        sessionId: 'selection-chat-session',
        specFilePath: testSpecPath,
        status: 'completed',
        startedAt: '2026-01-11T10:00:00Z',
        lastUpdatedAt: '2026-01-11T10:01:00Z',
        suggestions: [],
        changeHistory: [],
        chatMessages: [],
      };

      await fs.writeFile(
        join(sessionsDir, 'selection-spec.session.json'),
        JSON.stringify(mockSession)
      );
      mockProjectPath = testDir;

      const response = await request(app)
        .post('/api/spec-review/chat')
        .send({
          sessionId: 'selection-chat-session',
          message: 'What does this mean?',
          selectedText: 'The user authentication system',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message.role).toBe('user');
      // Message should include selection context
      expect(response.body.message.content).toContain('[Selection: "The user authentication system"]');
      expect(response.body.message.content).toContain('What does this mean?');
      // Response should include selectionContext for debugging
      expect(response.body.selectionContext).toBe('The user authentication system');
    });

    it('POST_chat_HandlesEmptySelectedText', async () => {
      const sessionsDir = join(testDir, '.ralph', 'sessions');
      await fs.mkdir(sessionsDir, { recursive: true });
      const mockSession: SessionFile = {
        sessionId: 'empty-selection-session',
        specFilePath: testSpecPath,
        status: 'completed',
        startedAt: '2026-01-11T10:00:00Z',
        lastUpdatedAt: '2026-01-11T10:01:00Z',
        suggestions: [],
        changeHistory: [],
        chatMessages: [],
      };

      await fs.writeFile(
        join(sessionsDir, 'empty-selection.session.json'),
        JSON.stringify(mockSession)
      );
      mockProjectPath = testDir;

      const response = await request(app)
        .post('/api/spec-review/chat')
        .send({
          sessionId: 'empty-selection-session',
          message: 'General question?',
          selectedText: '',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Message should NOT include selection context for empty string
      expect(response.body.message.content).toBe('General question?');
      expect(response.body.message.content).not.toContain('[Selection:');
    });

    it('POST_chat_HandlesWhitespaceOnlySelectedText', async () => {
      const sessionsDir = join(testDir, '.ralph', 'sessions');
      await fs.mkdir(sessionsDir, { recursive: true });
      const mockSession: SessionFile = {
        sessionId: 'whitespace-selection-session',
        specFilePath: testSpecPath,
        status: 'completed',
        startedAt: '2026-01-11T10:00:00Z',
        lastUpdatedAt: '2026-01-11T10:01:00Z',
        suggestions: [],
        changeHistory: [],
        chatMessages: [],
      };

      await fs.writeFile(
        join(sessionsDir, 'whitespace-selection.session.json'),
        JSON.stringify(mockSession)
      );
      mockProjectPath = testDir;

      const response = await request(app)
        .post('/api/spec-review/chat')
        .send({
          sessionId: 'whitespace-selection-session',
          message: 'Another question?',
          selectedText: '   \n\t  ',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Message should NOT include selection context for whitespace-only
      expect(response.body.message.content).toBe('Another question?');
      expect(response.body.message.content).not.toContain('[Selection:');
    });
  });

  describe('POST /api/spec-review/revert', () => {
    it('POST_revert_RestoresPreviousContent', async () => {
      const sessionsDir = join(testDir, '.ralph', 'sessions');
      await fs.mkdir(sessionsDir, { recursive: true });

      const testFilePath = join(testDir, 'revert-test-file.md');
      await fs.writeFile(testFilePath, 'Modified content');

      const mockSession: SessionFile = {
        sessionId: 'revert-session-123',
        specFilePath: testSpecPath,
        status: 'completed',
        startedAt: '2026-01-11T10:00:00Z',
        lastUpdatedAt: '2026-01-11T10:01:00Z',
        suggestions: [],
        changeHistory: [
          {
            id: 'change-1',
            timestamp: '2026-01-11T10:00:30Z',
            description: 'Updated file content',
            filePath: testFilePath,
            beforeContent: 'Original content',
            afterContent: 'Modified content',
            reverted: false,
          },
        ],
        chatMessages: [],
      };

      await fs.writeFile(
        join(sessionsDir, 'test-spec.session.json'),
        JSON.stringify(mockSession)
      );
      mockProjectPath = testDir;

      const response = await request(app)
        .post('/api/spec-review/revert')
        .send({
          sessionId: 'revert-session-123',
          changeId: 'change-1',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.change.reverted).toBe(true);

      const fileContent = await fs.readFile(testFilePath, 'utf-8');
      expect(fileContent).toBe('Original content');
    });
  });

  describe('GET /api/spec-review/suggestions/:sessionId', () => {
    it('GET_suggestions_ReturnsPendingSuggestions', async () => {
      const sessionsDir = join(testDir, '.ralph', 'sessions');
      await fs.mkdir(sessionsDir, { recursive: true });
      const mockSession: SessionFile = {
        sessionId: 'suggestions-session-123',
        specFilePath: testSpecPath,
        status: 'completed',
        startedAt: '2026-01-11T10:00:00Z',
        lastUpdatedAt: '2026-01-11T10:01:00Z',
        suggestions: [
          {
            id: 'suggestion-pending-1',
            category: 'clarity',
            severity: 'warning',
            section: 'Introduction',
            textSnippet: 'Some text',
            issue: 'Unclear',
            suggestedFix: 'Fix it',
            status: 'pending',
          },
          {
            id: 'suggestion-approved-1',
            category: 'testability',
            severity: 'info',
            section: 'Testing',
            textSnippet: 'Some text',
            issue: 'Hard to test',
            suggestedFix: 'Add mocks',
            status: 'approved',
          },
          {
            id: 'suggestion-pending-2',
            category: 'completeness',
            severity: 'critical',
            section: 'Requirements',
            textSnippet: 'Some text',
            issue: 'Missing',
            suggestedFix: 'Add it',
            status: 'pending',
          },
        ],
        changeHistory: [],
        chatMessages: [],
      };

      await fs.writeFile(
        join(sessionsDir, 'test-spec.session.json'),
        JSON.stringify(mockSession)
      );
      mockProjectPath = testDir;

      const response = await request(app).get('/api/spec-review/suggestions/suggestions-session-123');

      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBe('suggestions-session-123');
      expect(response.body.suggestions.length).toBe(2);
      expect(response.body.totalCount).toBe(3);
      expect(response.body.pendingCount).toBe(2);
      expect(response.body.suggestions.every((s: { status: string }) => s.status === 'pending')).toBe(true);
    });
  });

  describe('POST /api/spec-review/split/preview-content', () => {
    it('POST_splitPreviewContent_GeneratesPreviewFiles', async () => {
      const mockProposal: SplitProposal = {
        originalFile: testSpecPath,
        reason: 'Too many concerns',
        proposedSpecs: [
          {
            filename: 'auth-spec.md',
            description: 'Authentication',
            estimatedStories: 5,
            sections: ['Authentication'],
          },
          {
            filename: 'user-spec.md',
            description: 'User Management',
            estimatedStories: 8,
            sections: ['Users'],
          },
        ],
      };

      vi.mocked(splitterModule.buildSplitContent).mockImplementation(
        (_content, _original, _sections, description) => `# ${description}\n\nGenerated content...`
      );

      const response = await request(app)
        .post('/api/spec-review/split/preview-content')
        .send({
          specFile: testSpecPath,
          proposal: mockProposal,
        });

      expect(response.status).toBe(200);
      expect(response.body.previewFiles).toHaveLength(2);
      expect(response.body.previewFiles[0].filename).toBe('auth-spec.md');
      expect(response.body.previewFiles[0].content).toBe('# Authentication\n\nGenerated content...');
      expect(response.body.previewFiles[1].filename).toBe('user-spec.md');
      expect(response.body.originalFile).toBe(testSpecPath);
    });

    it('POST_splitPreviewContent_Returns404_WhenFileNotFound', async () => {
      const response = await request(app)
        .post('/api/spec-review/split/preview-content')
        .send({
          specFile: '/nonexistent/path/spec.md',
          proposal: { originalFile: 'test.md', reason: '', proposedSpecs: [] },
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Spec file not found');
    });

    it('POST_splitPreviewContent_Returns400_WhenMissingProposal', async () => {
      const response = await request(app)
        .post('/api/spec-review/split/preview-content')
        .send({
          specFile: testSpecPath,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('proposal is required');
    });
  });

  describe('POST /api/spec-review/split/execute', () => {
    it('POST_splitExecute_WritesFiles', async () => {
      const response = await request(app)
        .post('/api/spec-review/split/execute')
        .send({
          specFile: testSpecPath,
          files: [
            { filename: 'auth-spec.md', description: 'Auth', content: '# Auth\n\nContent...' },
            { filename: 'user-spec.md', description: 'User', content: '# User\n\nContent...' },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.createdFiles).toHaveLength(2);
      expect(response.body.originalFile).toBe(testSpecPath);

      // Verify files were actually written
      const authContent = await fs.readFile(join(testDir, 'auth-spec.md'), 'utf-8');
      expect(authContent).toBe('# Auth\n\nContent...');

      const userContent = await fs.readFile(join(testDir, 'user-spec.md'), 'utf-8');
      expect(userContent).toBe('# User\n\nContent...');
    });

    it('POST_splitExecute_UpdatesSession', async () => {
      const sessionsDir = join(testDir, '.ralph', 'sessions');
      await fs.mkdir(sessionsDir, { recursive: true });
      const mockSession: SessionFile = {
        sessionId: 'split-session-123',
        specFilePath: testSpecPath,
        status: 'completed',
        startedAt: '2026-01-11T10:00:00Z',
        lastUpdatedAt: '2026-01-11T10:01:00Z',
        suggestions: [],
        changeHistory: [],
        chatMessages: [],
      };

      await fs.writeFile(
        join(sessionsDir, 'test-spec.session.json'),
        JSON.stringify(mockSession)
      );
      mockProjectPath = testDir;

      const response = await request(app)
        .post('/api/spec-review/split/execute')
        .send({
          specFile: testSpecPath,
          sessionId: 'split-session-123',
          files: [
            { filename: 'auth-spec.md', description: 'Auth features', content: '# Auth' },
            { filename: 'user-spec.md', description: 'User management', content: '# User' },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify saveSession was called with updated splitSpecs
      expect(sessionFileModule.saveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'split-session-123',
          splitSpecs: [
            { filename: 'auth-spec.md', description: 'Auth features' },
            { filename: 'user-spec.md', description: 'User management' },
          ],
        })
      );
    });

    it('POST_splitExecute_Returns400_WhenNoFiles', async () => {
      const response = await request(app)
        .post('/api/spec-review/split/execute')
        .send({
          specFile: testSpecPath,
          files: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('files array is required');
    });
  });
});
