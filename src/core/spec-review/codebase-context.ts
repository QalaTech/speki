import { readdir, access } from 'fs/promises';
import { join } from 'path';
import type { CodebaseContext } from '../../types/index.js';

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'vendor',
  '__pycache__',
]);

/**
 * Detects the project type from config files in the project root.
 */
async function detectProjectType(projectRoot: string): Promise<string> {
  const configIndicators: Array<{ file: string; type: string }> = [
    { file: 'package.json', type: 'nodejs' },
    { file: 'tsconfig.json', type: 'typescript' },
    { file: 'requirements.txt', type: 'python' },
    { file: 'pyproject.toml', type: 'python' },
    { file: 'go.mod', type: 'go' },
  ];

  for (const indicator of configIndicators) {
    const filePath = join(projectRoot, indicator.file);
    if (await fileExists(filePath)) {
      return indicator.type;
    }
  }

  // Check for .csproj files (glob pattern)
  if (await hasCsprojFiles(projectRoot)) {
    return 'dotnet';
  }

  return 'unknown';
}

/**
 * Checks if a file exists at the given path.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if the project root contains any .csproj files.
 */
async function hasCsprojFiles(projectRoot: string): Promise<boolean> {
  try {
    const entries = await readdir(projectRoot, { withFileTypes: true });
    return entries.some(
      (entry) => entry.isFile() && entry.name.endsWith('.csproj')
    );
  } catch {
    return false;
  }
}

/**
 * Identifies existing patterns from directory structure.
 */
async function identifyPatterns(projectRoot: string): Promise<string[]> {
  const patterns: string[] = [];
  const knownPatterns: Array<{ dir: string; pattern: string }> = [
    { dir: 'src', pattern: 'src/ directory structure' },
    { dir: 'lib', pattern: 'lib/ directory structure' },
    { dir: 'test', pattern: 'test/ directory for tests' },
    { dir: 'tests', pattern: 'tests/ directory for tests' },
    { dir: '__tests__', pattern: '__tests__/ directory (Jest/Vitest pattern)' },
    { dir: 'spec', pattern: 'spec/ directory (RSpec pattern)' },
    { dir: 'docs', pattern: 'docs/ documentation directory' },
    { dir: 'api', pattern: 'api/ directory structure' },
    { dir: 'controllers', pattern: 'MVC controllers pattern' },
    { dir: 'services', pattern: 'services/ layer pattern' },
    { dir: 'models', pattern: 'models/ layer pattern' },
    { dir: 'utils', pattern: 'utils/ utility functions' },
    { dir: 'helpers', pattern: 'helpers/ helper functions' },
    { dir: 'components', pattern: 'components/ (React/Vue pattern)' },
    { dir: 'pages', pattern: 'pages/ (Next.js/Nuxt pattern)' },
    { dir: 'routes', pattern: 'routes/ routing pattern' },
    { dir: 'middleware', pattern: 'middleware/ pattern' },
    { dir: 'types', pattern: 'types/ TypeScript types' },
    { dir: 'interfaces', pattern: 'interfaces/ directory' },
  ];

  try {
    const entries = await readdir(projectRoot, { withFileTypes: true });
    const dirNames = new Set(
      entries.filter((e) => e.isDirectory()).map((e) => e.name)
    );

    for (const { dir, pattern } of knownPatterns) {
      if (dirNames.has(dir)) {
        patterns.push(pattern);
      }
    }
  } catch {
    // Ignore read errors
  }

  return patterns;
}

/**
 * Lists relevant source directories in the project.
 */
async function listSourceDirectories(projectRoot: string): Promise<string[]> {
  const sourceDirectories: string[] = [];
  const candidateDirs = ['src', 'lib', 'app', 'packages', 'modules'];

  try {
    const entries = await readdir(projectRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Skip hidden directories and common non-source directories
      if (entry.name.startsWith('.') || EXCLUDED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      // Prioritize known source directories
      if (candidateDirs.includes(entry.name)) {
        sourceDirectories.push(entry.name);
        continue;
      }

      // Check if directory contains source files
      const hasSourceFiles = await containsSourceFiles(
        join(projectRoot, entry.name)
      );
      if (hasSourceFiles) {
        sourceDirectories.push(entry.name);
      }
    }
  } catch {
    // Ignore read errors
  }

  return sourceDirectories;
}

/**
 * Checks if a directory contains common source code files.
 */
async function containsSourceFiles(dirPath: string): Promise<boolean> {
  const sourceExtensions = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.py',
    '.go',
    '.cs',
    '.java',
    '.rb',
    '.rs',
  ];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.some(
      (entry) =>
        entry.isFile() &&
        sourceExtensions.some((ext) => entry.name.endsWith(ext))
    );
  } catch {
    return false;
  }
}

/**
 * Gathers codebase context for spec review.
 *
 * @param projectRoot - The root directory of the project to analyze
 * @returns CodebaseContext with project type, patterns, and relevant files
 */
export async function gatherCodebaseContext(
  projectRoot: string
): Promise<CodebaseContext> {
  const [projectType, existingPatterns, relevantFiles] = await Promise.all([
    detectProjectType(projectRoot),
    identifyPatterns(projectRoot),
    listSourceDirectories(projectRoot),
  ]);

  return {
    projectType,
    existingPatterns,
    relevantFiles,
  };
}
