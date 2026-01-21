import { watch, FSWatcher } from 'fs';
import { join, relative } from 'path';
import { readdir, stat } from 'fs/promises';
import { publishSpecReview } from './sse.js';

// Track active watchers per project
const projectWatchers = new Map<string, FSWatcher[]>();

// Debounce map to avoid duplicate events
const debounceTimers = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 100;

/**
 * Start watching the specs directory for a project.
 * Publishes 'spec-review/file-changed' SSE events when files change.
 */
export async function startFileWatcher(projectPath: string): Promise<void> {
  // Stop any existing watchers for this project
  stopFileWatcher(projectPath);

  const specsDir = join(projectPath, 'specs');
  const watchers: FSWatcher[] = [];

  try {
    // Watch the specs directory recursively
    await watchDirectory(specsDir, projectPath, watchers);
    projectWatchers.set(projectPath, watchers);
    console.log(`[file-watcher] Started watching specs for project: ${projectPath}`);
  } catch (error) {
    console.error(`[file-watcher] Failed to start watching ${specsDir}:`, error);
  }
}

/**
 * Recursively watch a directory and its subdirectories
 */
async function watchDirectory(
  dirPath: string,
  projectPath: string,
  watchers: FSWatcher[]
): Promise<void> {
  try {
    const dirStat = await stat(dirPath);
    if (!dirStat.isDirectory()) return;

    // Watch this directory
    console.log(`[file-watcher] Setting up watcher for directory: ${dirPath}`);
    const watcher = watch(dirPath, { persistent: false }, (eventType, filename) => {
      console.log(`[file-watcher] Raw event: ${eventType} on ${filename} in ${dirPath}`);
      if (!filename) return;

      const fullPath = join(dirPath, filename);
      const relativePath = relative(projectPath, fullPath);

      // Only watch markdown files
      if (!filename.endsWith('.md')) {
        console.log(`[file-watcher] Ignoring non-markdown file: ${filename}`);
        return;
      }

      // Debounce to avoid duplicate events
      const debounceKey = `${projectPath}:${relativePath}`;
      const existingTimer = debounceTimers.get(debounceKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      debounceTimers.set(debounceKey, setTimeout(async () => {
        debounceTimers.delete(debounceKey);

        // Determine change type
        let changeType: 'add' | 'change' | 'unlink' = 'change';
        try {
          await stat(fullPath);
          // File exists - could be add or change, we treat as 'change' for simplicity
          changeType = 'change';
        } catch {
          // File doesn't exist - it was deleted
          changeType = 'unlink';
        }

        console.log(`[file-watcher] File ${changeType}: ${relativePath}`);

        publishSpecReview(projectPath, 'spec-review/file-changed', {
          filePath: relativePath,
          changeType,
        });
      }, DEBOUNCE_MS));
    });

    watcher.on('error', (error) => {
      console.error(`[file-watcher] Watch error on ${dirPath}:`, error);
    });

    watchers.push(watcher);

    // Recursively watch subdirectories
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        await watchDirectory(join(dirPath, entry.name), projectPath, watchers);
      }
    }
  } catch (error) {
    // Directory might not exist yet, which is fine
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`[file-watcher] Error watching ${dirPath}:`, error);
    }
  }
}

/**
 * Stop watching files for a project
 */
export function stopFileWatcher(projectPath: string): void {
  const watchers = projectWatchers.get(projectPath);
  if (watchers) {
    for (const watcher of watchers) {
      watcher.close();
    }
    projectWatchers.delete(projectPath);
    console.log(`[file-watcher] Stopped watching specs for project: ${projectPath}`);
  }
}

/**
 * Stop all file watchers
 */
export function stopAllFileWatchers(): void {
  for (const projectPath of projectWatchers.keys()) {
    stopFileWatcher(projectPath);
  }
}
