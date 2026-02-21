/**
 * Atomic File Write Utility
 *
 * Provides atomic file write operations to prevent race conditions
 * when multiple processes write to the same file.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface AtomicWriteOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial retry delay in milliseconds (default: 10) */
  retryDelayMs?: number;
  /** Encoding for text files (default: 'utf-8') */
  encoding?: BufferEncoding;
}

/**
 * Generate a unique temporary file path.
 */
function getTempPath(filePath: string): string {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return path.join(dir, `.${base}.tmp.${process.pid}.${timestamp}.${random}`);
}

/**
 * Sleep for a given duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Write data to a file atomically using temp file + rename.
 *
 * This prevents race conditions where:
 * - Process A reads file
 * - Process B reads file (same content)
 * - Process A writes new content
 * - Process B writes new content (overwrites A's changes)
 *
 * The rename operation is atomic on POSIX systems and nearly atomic on Windows.
 *
 * @param filePath - Target file path
 * @param data - Data to write
 * @param options - Write options
 * @throws Error if write fails after all retries
 */
export async function atomicWriteFile(
  filePath: string,
  data: string,
  options: AtomicWriteOptions = {}
): Promise<void> {
  const { maxRetries = 3, retryDelayMs = 10, encoding = 'utf-8' } = options;

  const tempPath = getTempPath(filePath);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Ensure the directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Write to temp file
      await fs.writeFile(tempPath, data, encoding);

      // Atomic rename (temp -> target)
      await fs.rename(tempPath, filePath);

      // Success!
      return;
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }

      const isLastAttempt = attempt === maxRetries - 1;

      if (isLastAttempt) {
        throw new Error(
          `Failed to atomically write to ${filePath} after ${maxRetries} attempts: ${error}`
        );
      }

      // Exponential backoff with jitter
      const delay = retryDelayMs * Math.pow(2, attempt) + Math.random() * 10;
      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error(`Unexpected exit from atomicWriteFile for ${filePath}`);
}

/**
 * Write JSON data to a file atomically.
 *
 * @param filePath - Target file path
 * @param data - Data to serialize and write
 * @param options - Write options
 * @param jsonSpace - JSON formatting space (default: 2)
 * @throws Error if write fails after all retries
 */
export async function atomicWriteJSON(
  filePath: string,
  data: unknown,
  options: AtomicWriteOptions = {},
  jsonSpace: number | string = 2
): Promise<void> {
  const jsonString = JSON.stringify(data, null, jsonSpace);
  await atomicWriteFile(filePath, jsonString, options);
}
