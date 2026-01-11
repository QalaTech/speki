import { readFile, writeFile } from 'fs/promises';
import { dirname, basename, join } from 'path';
import type { SplitProposal } from '../../types/index.js';

/**
 * Extracts a section from markdown content by heading name.
 * Returns the section content from the heading to the next heading of same or higher level.
 */
export function extractSection(content: string, sectionName: string): string {
  const escapedName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^##\\s+${escapedName}[\\s\\S]*?(?=^##\\s|$)`, 'gim');
  const match = content.match(pattern);
  return match ? match[0].trim() : '';
}

/**
 * Builds the split header that identifies the source of the new spec.
 */
export function buildSplitHeader(originalFilename: string): string {
  return `<!-- Split from: ${originalFilename} -->\n\n`;
}

/**
 * Builds the content for a new split spec file by extracting
 * relevant sections from the original spec content.
 */
export function buildSplitContent(
  originalContent: string,
  originalFilename: string,
  sections: string[],
  description: string
): string {
  const header = buildSplitHeader(originalFilename);
  const title = `# ${description}\n\n`;

  const sectionContents = sections
    .map((section) => extractSection(originalContent, section))
    .filter(Boolean);

  return header + title + sectionContents.join('\n\n');
}

/**
 * Executes a split proposal by creating new spec files from an original spec.
 *
 * @param originalPath - Absolute path to the original spec file
 * @param proposal - The split proposal containing proposed specs
 * @returns List of absolute paths to the created files
 */
export async function executeSplit(
  originalPath: string,
  proposal: SplitProposal
): Promise<string[]> {
  const originalContent = await readFile(originalPath, 'utf-8');
  const originalDir = dirname(originalPath);
  const originalFilename = basename(originalPath);

  const createdPaths: string[] = [];

  for (const proposedSpec of proposal.proposedSpecs) {
    const newFilePath = join(originalDir, proposedSpec.filename);
    const newContent = buildSplitContent(
      originalContent,
      originalFilename,
      proposedSpec.sections,
      proposedSpec.description
    );

    await writeFile(newFilePath, newContent, 'utf-8');
    createdPaths.push(newFilePath);
  }

  return createdPaths;
}
