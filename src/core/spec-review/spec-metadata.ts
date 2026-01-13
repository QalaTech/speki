import path from 'path';

/**
 * Extracts the spec ID from a spec file path.
 * Removes the .md extension from the filename.
 *
 * @param specPath - The path to the spec file (absolute or relative)
 *
 * @example
 * extractSpecId('specs/foo.md') // => 'foo'
 * extractSpecId('specs/20260112-105832-spec-partitioning.md') // => '20260112-105832-spec-partitioning'
 * extractSpecId('/absolute/path/to/spec.md') // => 'spec'
 */
export function extractSpecId(specPath: string): string {
  const basename = path.basename(specPath);
  return basename.replace(/\.md$/, '');
}
