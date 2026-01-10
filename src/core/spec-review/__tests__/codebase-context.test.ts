import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { gatherCodebaseContext } from '../codebase-context.js';

describe('gatherCodebaseContext', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `codebase-context-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Cleanup may fail if test didn't create directory
    }
  });

  it('gatherCodebaseContext_WithPackageJson_IdentifiesNodeProject', async () => {
    await writeFile(join(testDir, 'package.json'), '{"name": "test"}');

    const result = await gatherCodebaseContext(testDir);

    expect(result.projectType).toBe('nodejs');
  });

  it('gatherCodebaseContext_WithTsConfig_IdentifiesTypeScript', async () => {
    await writeFile(join(testDir, 'tsconfig.json'), '{"compilerOptions": {}}');

    const result = await gatherCodebaseContext(testDir);

    expect(result.projectType).toBe('typescript');
  });

  it('gatherCodebaseContext_WithCsproj_ShouldDetectDotnet', async () => {
    await writeFile(join(testDir, 'MyProject.csproj'), '<Project></Project>');

    const result = await gatherCodebaseContext(testDir);

    expect(result.projectType).toBe('dotnet');
  });

  it('gatherCodebaseContext_WithMissingConfigs_ShouldReturnUnknownType', async () => {
    const result = await gatherCodebaseContext(testDir);

    expect(result.projectType).toBe('unknown');
  });

  it('gatherCodebaseContext_ShouldListSourceDirectories', async () => {
    await mkdir(join(testDir, 'src'));
    await writeFile(join(testDir, 'src', 'index.ts'), '// source');
    await mkdir(join(testDir, 'lib'));
    await writeFile(join(testDir, 'lib', 'utils.js'), '// utils');
    await mkdir(join(testDir, 'node_modules')); // Should be excluded
    await mkdir(join(testDir, '.git')); // Should be excluded (hidden)

    const result = await gatherCodebaseContext(testDir);

    expect(result.relevantFiles).toContain('src');
    expect(result.relevantFiles).toContain('lib');
    expect(result.relevantFiles).not.toContain('node_modules');
    expect(result.relevantFiles).not.toContain('.git');
  });

  it('gatherCodebaseContext_WithSrcDirectory_ListsPatterns', async () => {
    await mkdir(join(testDir, 'src'));
    await mkdir(join(testDir, 'tests'));
    await mkdir(join(testDir, 'docs'));
    await mkdir(join(testDir, 'services'));
    await mkdir(join(testDir, 'components'));

    const result = await gatherCodebaseContext(testDir);

    expect(result.existingPatterns).toContain('src/ directory structure');
    expect(result.existingPatterns).toContain('tests/ directory for tests');
    expect(result.existingPatterns).toContain('docs/ documentation directory');
    expect(result.existingPatterns).toContain('services/ layer pattern');
    expect(result.existingPatterns).toContain('components/ (React/Vue pattern)');
  });

  it('gatherCodebaseContext_WithRequirementsTxt_ShouldDetectPython', async () => {
    await writeFile(join(testDir, 'requirements.txt'), 'flask==2.0.0');

    const result = await gatherCodebaseContext(testDir);

    expect(result.projectType).toBe('python');
  });

  it('gatherCodebaseContext_WithGoMod_ShouldDetectGo', async () => {
    await writeFile(join(testDir, 'go.mod'), 'module example.com/myapp');

    const result = await gatherCodebaseContext(testDir);

    expect(result.projectType).toBe('go');
  });

  it('gatherCodebaseContext_WithNonExistentDirectory_ShouldReturnEmptyResults', async () => {
    const nonExistentDir = join(testDir, 'does-not-exist');

    const result = await gatherCodebaseContext(nonExistentDir);

    expect(result.projectType).toBe('unknown');
    expect(result.existingPatterns).toEqual([]);
    expect(result.relevantFiles).toEqual([]);
  });

  it('gatherCodebaseContext_ReturnsSerializableObject', async () => {
    await writeFile(join(testDir, 'package.json'), '{"name": "test"}');
    await mkdir(join(testDir, 'src'));
    await writeFile(join(testDir, 'src', 'index.ts'), '// source');

    const result = await gatherCodebaseContext(testDir);

    // Verify the object can be serialized to JSON and back without data loss
    const serialized = JSON.stringify(result);
    const deserialized = JSON.parse(serialized);

    expect(deserialized).toEqual(result);
    expect(typeof deserialized.projectType).toBe('string');
    expect(Array.isArray(deserialized.existingPatterns)).toBe(true);
    expect(Array.isArray(deserialized.relevantFiles)).toBe(true);
  });
});
