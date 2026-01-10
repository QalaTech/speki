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
    // Clean up temp directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('gatherCodebaseContext_WithPackageJson_ShouldDetectNodejs', async () => {
    // Arrange
    await writeFile(join(testDir, 'package.json'), '{"name": "test"}');

    // Act
    const result = await gatherCodebaseContext(testDir);

    // Assert
    expect(result.projectType).toBe('nodejs');
  });

  it('gatherCodebaseContext_WithCsproj_ShouldDetectDotnet', async () => {
    // Arrange
    await writeFile(join(testDir, 'MyProject.csproj'), '<Project></Project>');

    // Act
    const result = await gatherCodebaseContext(testDir);

    // Assert
    expect(result.projectType).toBe('dotnet');
  });

  it('gatherCodebaseContext_WithMissingConfigs_ShouldReturnUnknownType', async () => {
    // Arrange
    // Empty directory, no config files

    // Act
    const result = await gatherCodebaseContext(testDir);

    // Assert
    expect(result.projectType).toBe('unknown');
  });

  it('gatherCodebaseContext_ShouldListSourceDirectories', async () => {
    // Arrange
    await mkdir(join(testDir, 'src'));
    await writeFile(join(testDir, 'src', 'index.ts'), '// source');
    await mkdir(join(testDir, 'lib'));
    await writeFile(join(testDir, 'lib', 'utils.js'), '// utils');
    await mkdir(join(testDir, 'node_modules')); // Should be excluded
    await mkdir(join(testDir, '.git')); // Should be excluded (hidden)

    // Act
    const result = await gatherCodebaseContext(testDir);

    // Assert
    expect(result.relevantFiles).toContain('src');
    expect(result.relevantFiles).toContain('lib');
    expect(result.relevantFiles).not.toContain('node_modules');
    expect(result.relevantFiles).not.toContain('.git');
  });

  it('gatherCodebaseContext_ShouldIdentifyPatterns', async () => {
    // Arrange
    await mkdir(join(testDir, 'src'));
    await mkdir(join(testDir, 'tests'));
    await mkdir(join(testDir, 'docs'));
    await mkdir(join(testDir, 'services'));
    await mkdir(join(testDir, 'components'));

    // Act
    const result = await gatherCodebaseContext(testDir);

    // Assert
    expect(result.existingPatterns).toContain('src/ directory structure');
    expect(result.existingPatterns).toContain('tests/ directory for tests');
    expect(result.existingPatterns).toContain('docs/ documentation directory');
    expect(result.existingPatterns).toContain('services/ layer pattern');
    expect(result.existingPatterns).toContain('components/ (React/Vue pattern)');
  });

  it('gatherCodebaseContext_WithRequirementsTxt_ShouldDetectPython', async () => {
    // Arrange
    await writeFile(join(testDir, 'requirements.txt'), 'flask==2.0.0');

    // Act
    const result = await gatherCodebaseContext(testDir);

    // Assert
    expect(result.projectType).toBe('python');
  });

  it('gatherCodebaseContext_WithGoMod_ShouldDetectGo', async () => {
    // Arrange
    await writeFile(join(testDir, 'go.mod'), 'module example.com/myapp');

    // Act
    const result = await gatherCodebaseContext(testDir);

    // Assert
    expect(result.projectType).toBe('go');
  });

  it('gatherCodebaseContext_WithNonExistentDirectory_ShouldReturnEmptyResults', async () => {
    // Arrange
    const nonExistentDir = join(testDir, 'does-not-exist');

    // Act
    const result = await gatherCodebaseContext(nonExistentDir);

    // Assert
    expect(result.projectType).toBe('unknown');
    expect(result.existingPatterns).toEqual([]);
    expect(result.relevantFiles).toEqual([]);
  });
});
