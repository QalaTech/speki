import path from 'path';
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import type { DecomposeState, PRDData, SpecMetadata, SpecStatus } from '../../types/index.js';

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
 * Initializes metadata for a new spec with draft status.
 *
 * @param projectRoot - The project root directory
 * @param specPath - Path to the spec file
 * @returns The created metadata
 */
export async function initSpecMetadata(
  projectRoot: string,
  specPath: string
): Promise<SpecMetadata> {
  const specId = extractSpecId(specPath);
  const now = new Date().toISOString();
  const metadata: SpecMetadata = {
    created: now,
    lastModified: now,
    status: 'draft',
    specPath,
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
 * Lists all spec directories in .ralph/specs/.
 *
 * @param projectRoot - The project root directory
 * @returns Array of spec IDs (directory names)
 */
export async function listSpecs(projectRoot: string): Promise<string[]> {
  const specsDir = path.join(projectRoot, '.ralph', 'specs');
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
