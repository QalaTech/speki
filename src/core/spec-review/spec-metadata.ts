import path from 'path';
import { mkdir } from 'fs/promises';

/**
 * Extracts the spec ID from a spec file path by removing the .md extension.
 *
 * @param specPath - The path to the spec file (absolute or relative)
 * @example
 * extractSpecId('specs/foo.md') // => 'foo'
 * extractSpecId('specs/20260112-105832-spec-partitioning.md') // => '20260112-105832-spec-partitioning'
 */
export function extractSpecId(specPath: string): string {
  const basename = path.basename(specPath);
  return basename.replace(/\.md$/, '');
}

/**
 * Returns the path to the spec-specific directory under .ralph/specs/.
 *
 * @param projectRoot - The project root directory
 * @param specId - The spec identifier
 * @example
 * getSpecDir('/project', 'my-spec') // => '/project/.ralph/specs/my-spec'
 */
export function getSpecDir(projectRoot: string, specId: string): string {
  return path.join(projectRoot, '.ralph', 'specs', specId);
}

/**
 * Ensures the spec directory exists, creating it if necessary.
 *
 * @param projectRoot - The project root directory
 * @param specId - The spec identifier
 * @returns The path to the created/existing directory
 */
export async function ensureSpecDir(
  projectRoot: string,
  specId: string
): Promise<string> {
  const specDir = getSpecDir(projectRoot, specId);
  await mkdir(specDir, { recursive: true });
  return specDir;
}

/**
 * Returns the path to the logs subdirectory for a spec.
 *
 * @param projectRoot - The project root directory
 * @param specId - The spec identifier
 * @example
 * getSpecLogsDir('/project', 'my-spec') // => '/project/.ralph/specs/my-spec/logs'
 */
export function getSpecLogsDir(projectRoot: string, specId: string): string {
  return path.join(getSpecDir(projectRoot, specId), 'logs');
}
