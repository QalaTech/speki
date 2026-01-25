import path from 'path';
import { existsSync } from 'fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'fs/promises';
import type { DecomposeState, PRDData, SpecMetadata, SpecStatus, SpecType } from '../../types/index.js';

/**
 * The specs directory relative to project root.
 */
const SPECS_DIRECTORY = 'specs';

/**
 * Parses YAML frontmatter from markdown content.
 * Returns the frontmatter as an object, or null if not present.
 */
export function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter: Record<string, unknown> = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      frontmatter[key] = value;
    }
  }

  return frontmatter;
}

/**
 * Detects spec type from filename pattern.
 * - *.prd.md → prd
 * - *.tech.md → tech-spec
 * - *.bug.md → bug
 * - default → prd (legacy files)
 */
export function detectTypeFromFilename(filename: string): SpecType {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.prd.md')) return 'prd';
  if (lower.endsWith('.tech.md')) return 'tech-spec';
  if (lower.endsWith('.bug.md')) return 'bug';
  // Legacy files without type suffix default to PRD
  return 'prd';
}

/**
 * Detects spec type from file content (frontmatter) or filename.
 * Priority: frontmatter > filename pattern > default (prd)
 */
export async function detectSpecType(
  specPath: string,
  content?: string
): Promise<{ type: SpecType; parent?: string }> {
  // Try to read content if not provided
  if (!content) {
    try {
      content = await readFile(specPath, 'utf-8');
    } catch {
      // Fall back to filename detection
      return { type: detectTypeFromFilename(path.basename(specPath)) };
    }
  }

  // Parse frontmatter
  const frontmatter = parseFrontmatter(content);
  if (frontmatter) {
    const type = frontmatter.type as string;
    const parent = frontmatter.parent as string | undefined;

    if (type === 'prd' || type === 'tech-spec' || type === 'bug') {
      return { type, parent };
    }
  }

  // Fall back to filename detection
  return { type: detectTypeFromFilename(path.basename(specPath)) };
}

/**
 * Discovers spec files (.md) from the specs/ directory.
 *
 * @param projectRoot - The project root directory
 * @returns Array of absolute paths to spec files
 */
export async function findSpecFiles(projectRoot: string): Promise<string[]> {
  const specsDir = path.join(projectRoot, SPECS_DIRECTORY);

  if (!existsSync(specsDir)) {
    return [];
  }

  const dirStat = await stat(specsDir);
  if (!dirStat.isDirectory()) {
    return [];
  }

  const entries = await readdir(specsDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(path.join(specsDir, entry.name));
    }
  }

  return results;
}

/**
 * Valid state transitions for spec lifecycle.
 * Each status maps to an array of statuses it can transition to.
 */
const VALID_TRANSITIONS: Record<SpecStatus, SpecStatus[]> = {
  draft: ['reviewed', 'decomposed'],
  reviewed: ['decomposed'],
  decomposed: ['active'],
  active: ['completed'],
  completed: [],
};

/**
 * Extracts a spec identifier from the spec file path.
 * Uses only the basename (filename) without the .md extension.
 * The spec ID is used to organize per-spec state files under .speki/specs/<spec-id>/.
 *
 * @param specPath - The path to the spec file (absolute or relative)
 * @example
 * extractSpecId('specs/foo.md') // => 'foo'
 * extractSpecId('specs/auth/login.md') // => 'login'
 * extractSpecId('/absolute/path/to/test.md') // => 'test'
 * extractSpecId('specs/20260112-105832-spec-partitioning.md') // => '20260112-105832-spec-partitioning'
 */
export function extractSpecId(specPath: string): string {
  // Extract just the filename (basename) and remove .md extension
  const basename = path.basename(specPath);
  const withoutExtension = basename.replace(/\.md$/, '');
  return withoutExtension;
}

/**
 * Returns the path to the spec-specific directory under .speki/specs/.
 *
 * @param projectRoot - The project root directory
 * @param specId - The spec identifier
 * @example
 * getSpecDir('/project', 'my-spec') // => '/project/.speki/specs/my-spec'
 */
export function getSpecDir(projectRoot: string, specId: string): string {
  return path.join(projectRoot, '.speki', 'specs', specId);
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
 * getSpecLogsDir('/project', 'my-spec') // => '/project/.speki/specs/my-spec/logs'
 */
export function getSpecLogsDir(projectRoot: string, specId: string): string {
  return path.join(getSpecDir(projectRoot, specId), 'logs');
}

/**
 * Returns the path to the metadata.json file for a spec.
 *
 * @param projectRoot - The project root directory
 * @param specId - The spec identifier
 * @returns The full path to the metadata.json file
 */
function getMetadataPath(projectRoot: string, specId: string): string {
  return path.join(getSpecDir(projectRoot, specId), 'metadata.json');
}

/**
 * Reads the metadata for a spec.
 *
 * @param projectRoot - The project root directory
 * @param specId - The spec identifier
 * @returns The metadata or null if it doesn't exist
 */
export async function readSpecMetadata(
  projectRoot: string,
  specId: string
): Promise<SpecMetadata | null> {
  const metadataPath = getMetadataPath(projectRoot, specId);
  try {
    const content = await readFile(metadataPath, 'utf-8');
    return JSON.parse(content) as SpecMetadata;
  } catch {
    return null;
  }
}

/**
 * Writes metadata for a spec.
 *
 * @param projectRoot - The project root directory
 * @param specId - The spec identifier
 * @param metadata - The metadata to write
 */
export async function writeSpecMetadata(
  projectRoot: string,
  specId: string,
  metadata: SpecMetadata
): Promise<void> {
  await ensureSpecDir(projectRoot, specId);
  const metadataPath = getMetadataPath(projectRoot, specId);
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

/**
 * Options for initializing spec metadata.
 */
export interface InitSpecMetadataOptions {
  /** Spec type (auto-detected if not provided) */
  type?: SpecType;
  /** Parent spec path (for tech specs linked to PRDs) */
  parent?: string;
}

/**
 * Initializes metadata for a new spec with draft status.
 *
 * @param projectRoot - The project root directory
 * @param specPath - Path to the spec file
 * @param options - Optional type and parent settings
 * @returns The created metadata
 */
export async function initSpecMetadata(
  projectRoot: string,
  specPath: string,
  options?: InitSpecMetadataOptions
): Promise<SpecMetadata> {
  const specId = extractSpecId(specPath);
  const now = new Date().toISOString();

  // Auto-detect type if not provided
  let specType: SpecType = options?.type ?? 'prd';
  let parent = options?.parent;

  if (!options?.type) {
    const detected = await detectSpecType(specPath);
    specType = detected.type;
    parent = parent ?? detected.parent;
  }

  const metadata: SpecMetadata = {
    created: now,
    lastModified: now,
    status: 'draft',
    specPath,
    type: specType,
    ...(parent && { parent }),
  };
  await writeSpecMetadata(projectRoot, specId, metadata);
  return metadata;
}

/**
 * Checks if a status transition is valid.
 *
 * @param current - The current status
 * @param target - The target status
 * @returns True if the transition is valid
 */
export function transitionSpecStatus(
  current: SpecStatus,
  target: SpecStatus
): boolean {
  return VALID_TRANSITIONS[current].includes(target);
}

/**
 * Updates the status of a spec if the transition is valid.
 *
 * @param projectRoot - The project root directory
 * @param specId - The spec identifier
 * @param newStatus - The target status
 * @throws Error if the transition is invalid or metadata doesn't exist
 */
export async function updateSpecStatus(
  projectRoot: string,
  specId: string,
  newStatus: SpecStatus
): Promise<void> {
  const metadata = await readSpecMetadata(projectRoot, specId);
  if (!metadata) {
    throw new Error(`Spec metadata not found for '${specId}'`);
  }

  if (!transitionSpecStatus(metadata.status, newStatus)) {
    throw new Error(
      `Invalid status transition: ${metadata.status} → ${newStatus}`
    );
  }

  metadata.status = newStatus;
  metadata.lastModified = new Date().toISOString();
  await writeSpecMetadata(projectRoot, specId, metadata);
}

/**
 * Lists all spec directories in .speki/specs/.
 *
 * @param projectRoot - The project root directory
 * @returns Array of spec IDs (directory names)
 */
export async function listSpecs(projectRoot: string): Promise<string[]> {
  const specsDir = path.join(projectRoot, '.speki', 'specs');
  try {
    const entries = await readdir(specsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Loads the PRD/decompose_state from a spec directory.
 *
 * @param projectRoot - The project root directory
 * @param specId - The spec identifier
 * @returns The PRD data or null if not found
 */
export async function loadPRDForSpec(
  projectRoot: string,
  specId: string
): Promise<PRDData | null> {
  const prdPath = path.join(getSpecDir(projectRoot, specId), 'decompose_state.json');
  try {
    const content = await readFile(prdPath, 'utf-8');
    return JSON.parse(content) as PRDData;
  } catch {
    return null;
  }
}

/**
 * Saves the PRD/decompose_state to a spec directory.
 *
 * @param projectRoot - The project root directory
 * @param specId - The spec identifier
 * @param prd - The PRD data to save
 */
export async function savePRDForSpec(
  projectRoot: string,
  specId: string,
  prd: PRDData
): Promise<void> {
  await ensureSpecDir(projectRoot, specId);
  const prdPath = path.join(getSpecDir(projectRoot, specId), 'decompose_state.json');
  await writeFile(prdPath, JSON.stringify(prd, null, 2), 'utf-8');
}

/**
 * Returns the path to the decompose_progress.json file for a spec.
 * This tracks the decompose operation status (IDLE, DECOMPOSING, COMPLETED, etc.)
 *
 * @param projectRoot - The project root directory
 * @param specId - The spec identifier
 */
export function getDecomposeProgressPath(projectRoot: string, specId: string): string {
  return path.join(getSpecDir(projectRoot, specId), 'decompose_progress.json');
}

/**
 * Loads the decompose progress state for a spec.
 *
 * @param projectRoot - The project root directory
 * @param specId - The spec identifier
 * @returns The decompose state or default IDLE state if not found
 */
export async function loadDecomposeStateForSpec(
  projectRoot: string,
  specId: string
): Promise<DecomposeState> {
  const statePath = getDecomposeProgressPath(projectRoot, specId);
  try {
    const content = await readFile(statePath, 'utf-8');
    return JSON.parse(content) as DecomposeState;
  } catch {
    return { status: 'IDLE', message: 'Not initialized' };
  }
}

/**
 * Saves the decompose progress state for a spec.
 *
 * @param projectRoot - The project root directory
 * @param specId - The spec identifier
 * @param state - The decompose state to save
 */
export async function saveDecomposeStateForSpec(
  projectRoot: string,
  specId: string,
  state: DecomposeState
): Promise<void> {
  await ensureSpecDir(projectRoot, specId);
  const statePath = getDecomposeProgressPath(projectRoot, specId);
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

// =============================================================================
// Tech Spec / PRD Hierarchy Functions
// =============================================================================

/**
 * Get all child specs (tech specs) linked to a parent PRD.
 *
 * @param projectRoot - The project root directory
 * @param prdSpecId - The parent PRD spec ID
 * @returns Array of SpecMetadata for child tech specs
 */
export async function getChildSpecs(
  projectRoot: string,
  prdSpecId: string
): Promise<SpecMetadata[]> {
  // Method 1: Check the parent PRD's children array
  const prdMetadata = await readSpecMetadata(projectRoot, prdSpecId);
  if (prdMetadata?.children?.length) {
    const children: SpecMetadata[] = [];
    for (const childId of prdMetadata.children) {
      const childMeta = await readSpecMetadata(projectRoot, childId);
      if (childMeta) {
        children.push(childMeta);
      }
    }
    return children;
  }

  // Method 2: Scan all specs and find those with parent pointing to this PRD
  const allSpecIds = await listSpecs(projectRoot);
  const children: SpecMetadata[] = [];

  for (const specId of allSpecIds) {
    if (specId === prdSpecId) continue;

    const metadata = await readSpecMetadata(projectRoot, specId);
    if (!metadata) continue;

    // Check if this spec's parent matches the PRD
    if (metadata.parent) {
      const parentSpecId = extractSpecId(metadata.parent);
      if (parentSpecId === prdSpecId) {
        children.push(metadata);
      }
    }
  }

  return children;
}

/**
 * Get the parent spec for a tech spec.
 *
 * @param projectRoot - The project root directory
 * @param techSpecId - The tech spec ID
 * @returns The parent SpecMetadata or null if no parent
 */
export async function getParentSpec(
  projectRoot: string,
  techSpecId: string
): Promise<SpecMetadata | null> {
  const metadata = await readSpecMetadata(projectRoot, techSpecId);
  if (!metadata?.parent) {
    return null;
  }

  const parentSpecId = extractSpecId(metadata.parent);
  return readSpecMetadata(projectRoot, parentSpecId);
}

/**
 * Link a tech spec to a parent PRD.
 * Updates both the tech spec's parent field and the PRD's children array.
 *
 * @param projectRoot - The project root directory
 * @param techSpecId - The tech spec ID to link
 * @param prdSpecId - The parent PRD spec ID
 */
export async function linkTechSpecToPrd(
  projectRoot: string,
  techSpecId: string,
  prdSpecId: string
): Promise<void> {
  // Update tech spec's parent
  const techSpecMetadata = await readSpecMetadata(projectRoot, techSpecId);
  if (!techSpecMetadata) {
    throw new Error(`Tech spec metadata not found: ${techSpecId}`);
  }

  techSpecMetadata.parent = `specs/${prdSpecId}.md`;
  techSpecMetadata.lastModified = new Date().toISOString();
  await writeSpecMetadata(projectRoot, techSpecId, techSpecMetadata);

  // Update PRD's children array
  const prdMetadata = await readSpecMetadata(projectRoot, prdSpecId);
  if (prdMetadata) {
    const children = prdMetadata.children || [];
    if (!children.includes(techSpecId)) {
      children.push(techSpecId);
      prdMetadata.children = children;
      prdMetadata.lastModified = new Date().toISOString();
      await writeSpecMetadata(projectRoot, prdSpecId, prdMetadata);
    }
  }
}

/**
 * Generate tech spec content from a PRD's user stories.
 *
 * @param prdContent - The PRD markdown content
 * @param userStories - The decomposed user stories
 * @param prdFileName - The PRD filename for the parent reference
 * @returns Generated tech spec markdown content
 */
export function generateTechSpecContent(
  prdContent: string,
  userStories: Array<{ id: string; title: string; acceptanceCriteria: string[] }>,
  prdFileName: string
): string {
  // Extract PRD title from first heading
  const titleMatch = prdContent.match(/^#\s+(.+)$/m);
  const prdTitle = titleMatch ? titleMatch[1] : 'Feature';

  // Build user stories section
  const storiesSection = userStories
    .map((story) => {
      const acList = story.acceptanceCriteria.map((ac) => `- ${ac}`).join('\n');
      return `### ${story.id}: ${story.title}\n${acList}`;
    })
    .join('\n\n');

  return `---
type: tech-spec
status: draft
parent: specs/${prdFileName}
created: ${new Date().toISOString().split('T')[0]}
---

# Technical Specification: ${prdTitle}

## Parent PRD

**Implements:** [${prdFileName}](./${prdFileName})

## User Stories to Achieve

${storiesSection}

---

## Technical Approach

[Describe the overall architecture and how components work together]

## API Design

[Define endpoints, request/response schemas - consider shared auth/middleware]

## Data Model

[Define entities, database changes - design for all user stories]

## Shared Components

[Identify components that serve multiple user stories]

## Implementation Notes

[Any technical considerations, trade-offs, or decisions]
`;
}

/**
 * Create a tech spec from a PRD.
 *
 * @param projectRoot - The project root directory
 * @param prdSpecId - The parent PRD spec ID
 * @param techSpecName - Name for the new tech spec (without extension)
 * @returns Object with created spec info
 */
export async function createTechSpecFromPrd(
  projectRoot: string,
  prdSpecId: string,
  techSpecName?: string
): Promise<{ specId: string; filePath: string }> {
  // Load PRD content
  const prdFilePath = path.join(projectRoot, SPECS_DIRECTORY, `${prdSpecId}.md`);
  const prdContent = await readFile(prdFilePath, 'utf-8');

  // Load decomposed user stories
  const prdData = await loadPRDForSpec(projectRoot, prdSpecId);
  const userStories = prdData?.userStories || [];

  // Generate tech spec filename
  // Default: same base name as PRD but with .tech.md extension
  let techSpecFileName: string;
  if (techSpecName) {
    techSpecFileName = techSpecName.endsWith('.tech.md')
      ? techSpecName
      : `${techSpecName}.tech.md`;
  } else {
    // Extract base name from PRD (remove .prd.md or .md)
    const baseName = prdSpecId
      .replace(/\.prd$/, '')
      .replace(/\.md$/, '');
    techSpecFileName = `${baseName}.tech.md`;
  }

  const techSpecPath = path.join(projectRoot, SPECS_DIRECTORY, techSpecFileName);
  const techSpecId = extractSpecId(techSpecPath);

  // Generate tech spec content
  const content = generateTechSpecContent(
    prdContent,
    userStories.map((s) => ({
      id: s.id,
      title: s.title,
      acceptanceCriteria: s.acceptanceCriteria,
    })),
    `${prdSpecId}.md`
  );

  // Write tech spec file
  await writeFile(techSpecPath, content, 'utf-8');

  // Initialize metadata with parent link
  await initSpecMetadata(projectRoot, techSpecPath, {
    type: 'tech-spec',
    parent: `specs/${prdSpecId}.md`,
  });

  // Link tech spec to PRD
  await linkTechSpecToPrd(projectRoot, techSpecId, prdSpecId);

  return {
    specId: techSpecId,
    filePath: techSpecPath,
  };
}
