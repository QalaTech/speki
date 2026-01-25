import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import specsRouter from '../routes/specs.js';
import type { SpecMetadata, PRDData } from '@speki/core';

let mockProjectPath = '/test/project';

vi.mock('../middleware/project-context.js', () => ({
  projectContext: function () {
    return function (req: express.Request, _res: express.Response, next: express.NextFunction) {
      req.projectPath = mockProjectPath;
      next();
    };
  },
}));

describe('specs routes', function () {
  let app: express.Express;
  let testDir: string;

  beforeEach(async function () {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/specs', specsRouter);

    testDir = await fs.mkdtemp(join(tmpdir(), 'specs-routes-test-'));
    mockProjectPath = testDir;
  });

  afterEach(async function () {
    vi.restoreAllMocks();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function createSpecWithMetadata(
    specId: string,
    metadata: SpecMetadata,
    prd?: PRDData
  ): Promise<void> {
    // Create the actual spec file in specs/ directory
    const specsDir = join(testDir, 'specs');
    await fs.mkdir(specsDir, { recursive: true });
    await fs.writeFile(join(specsDir, `${specId}.md`), `# ${specId}\n\nSpec content for ${specId}`);

    // Create metadata in .speki/specs/<specId>/
    const specDir = join(testDir, '.speki', 'specs', specId);
    await fs.mkdir(specDir, { recursive: true });
    await fs.writeFile(join(specDir, 'metadata.json'), JSON.stringify(metadata));
    if (prd) {
      await fs.writeFile(join(specDir, 'tasks.json'), JSON.stringify(prd));
    }
  }

  describe('GET /api/specs', function () {
    it('getSpecs_ReturnsAllSpecsWithMetadata', async function () {
      const metadata1: SpecMetadata = {
        created: '2026-01-13T10:00:00Z',
        lastModified: '2026-01-13T10:30:00Z',
        status: 'decomposed',
        specPath: 'specs/feature-a.md',
      };
      const metadata2: SpecMetadata = {
        created: '2026-01-13T11:00:00Z',
        lastModified: '2026-01-13T11:15:00Z',
        status: 'draft',
        specPath: 'specs/feature-b.md',
      };

      await createSpecWithMetadata('feature-a', metadata1);
      await createSpecWithMetadata('feature-b', metadata2);

      const response = await request(app).get('/api/specs');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('specs');
      expect(response.body.specs).toHaveLength(2);

      const specIds = response.body.specs.map(function (s: { specId: string }) {
        return s.specId;
      });
      expect(specIds).toContain('feature-a');
      expect(specIds).toContain('feature-b');

      const featureA = response.body.specs.find(function (s: { specId: string }) {
        return s.specId === 'feature-a';
      });
      expect(featureA.status).toBe('decomposed');
      expect(featureA.specPath).toBe('specs/feature-a.md');
    });

    it('getSpecs_WithNoSpecs_ReturnsEmptyArray', async function () {
      const response = await request(app).get('/api/specs');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('specs');
      expect(response.body.specs).toHaveLength(0);
    });
  });

  describe('GET /api/specs/:specId/tasks', function () {
    it('getSpecTasks_WithValidSpecId_ReturnsTasks', async function () {
      const metadata: SpecMetadata = {
        created: '2026-01-13T10:00:00Z',
        lastModified: '2026-01-13T10:30:00Z',
        status: 'decomposed',
        specPath: 'specs/feature.md',
      };
      const prd: PRDData = {
        projectName: 'Test Feature',
        branchName: 'feature/test',
        language: 'typescript',
        standardsFile: '',
        description: 'Test feature description',
        userStories: [
          {
            id: 'US-001',
            title: 'First Story',
            description: 'Description 1',
            acceptanceCriteria: ['AC1'],
            testCases: ['Test1'],
            priority: 10,
            passes: false,
            notes: '',
            dependencies: [],
          },
          {
            id: 'US-002',
            title: 'Second Story',
            description: 'Description 2',
            acceptanceCriteria: ['AC2'],
            testCases: ['Test2'],
            priority: 20,
            passes: true,
            notes: '',
            dependencies: [],
          },
        ],
      };

      await createSpecWithMetadata('feature', metadata, prd);

      const response = await request(app).get('/api/specs/feature/tasks');

      expect(response.status).toBe(200);
      expect(response.body.specId).toBe('feature');
      expect(response.body.projectName).toBe('Test Feature');
      expect(response.body.tasks).toHaveLength(2);
      expect(response.body.tasks[0].id).toBe('US-001');
      expect(response.body.tasks[1].id).toBe('US-002');
    });

    it('getSpecTasks_WithInvalidSpecId_Returns404', async function () {
      const response = await request(app).get('/api/specs/nonexistent/tasks');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Spec not found');
      expect(response.body.specId).toBe('nonexistent');
    });

    it('getSpecTasks_WithNoPRD_ReturnsEmptyTasks', async function () {
      const metadata: SpecMetadata = {
        created: '2026-01-13T10:00:00Z',
        lastModified: '2026-01-13T10:30:00Z',
        status: 'reviewed',
        specPath: 'specs/feature.md',
      };

      await createSpecWithMetadata('feature', metadata);

      const response = await request(app).get('/api/specs/feature/tasks');

      expect(response.status).toBe(200);
      expect(response.body.specId).toBe('feature');
      expect(response.body.tasks).toHaveLength(0);
      expect(response.body.projectName).toBeNull();
    });
  });

  describe('GET /api/specs/:specId/status', function () {
    it('getSpecStatus_WithValidSpecId_ReturnsMetadata', async function () {
      const metadata: SpecMetadata = {
        created: '2026-01-13T10:00:00Z',
        lastModified: '2026-01-13T10:30:00Z',
        status: 'active',
        specPath: 'specs/active-feature.md',
      };

      await createSpecWithMetadata('active-feature', metadata);

      const response = await request(app).get('/api/specs/active-feature/status');

      expect(response.status).toBe(200);
      expect(response.body.specId).toBe('active-feature');
      expect(response.body.status).toBe('active');
      expect(response.body.created).toBe('2026-01-13T10:00:00Z');
      expect(response.body.lastModified).toBe('2026-01-13T10:30:00Z');
      expect(response.body.specPath).toBe('specs/active-feature.md');
    });

    it('getSpecStatus_WithInvalidSpecId_Returns404', async function () {
      const response = await request(app).get('/api/specs/nonexistent/status');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Spec not found');
      expect(response.body.specId).toBe('nonexistent');
    });
  });
});
