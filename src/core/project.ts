import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, readFile, writeFile, access, copyFile, readdir, stat } from 'fs/promises';
import type {
  ProjectConfig,
  PRDData,
  DecomposeState,
  RalphStatus,
} from '../types/index.js';

const RALPH_DIR_NAME = '.ralph';

export class Project {
  readonly projectPath: string;
  readonly ralphDir: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath.replace(/\/$/, '');
    this.ralphDir = join(this.projectPath, RALPH_DIR_NAME);
  }

  // Path helpers
  get configPath(): string {
    return join(this.ralphDir, 'config.json');
  }
  get prdPath(): string {
    return join(this.ralphDir, 'prd.json');
  }
  get decomposeStatePath(): string {
    return join(this.ralphDir, 'decompose_state.json');
  }
  get decomposeFeedbackPath(): string {
    return join(this.ralphDir, 'decompose_feedback.json');
  }
  get statusPath(): string {
    return join(this.ralphDir, '.ralph-status.json');
  }
  get progressPath(): string {
    return join(this.ralphDir, 'progress.txt');
  }
  get peerFeedbackPath(): string {
    return join(this.ralphDir, 'peer_feedback.json');
  }
  get promptPath(): string {
    return join(this.ralphDir, 'prompt.md');
  }
  get decomposePromptPath(): string {
    return join(this.ralphDir, 'decompose-prompt.md');
  }
  get tasksDir(): string {
    return join(this.ralphDir, 'tasks');
  }
  get logsDir(): string {
    return join(this.ralphDir, 'logs');
  }
  get standardsDir(): string {
    return join(this.ralphDir, 'standards');
  }

  /**
   * Check if .ralph folder exists
   */
  async exists(): Promise<boolean> {
    try {
      await access(this.ralphDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize .ralph folder with all required files and directories
   */
  async initialize(options: {
    name: string;
    branchName?: string;
    language?: string;
  }): Promise<void> {
    // Create directories
    await mkdir(this.ralphDir, { recursive: true });
    await mkdir(this.tasksDir, { recursive: true });
    await mkdir(this.logsDir, { recursive: true });
    await mkdir(this.standardsDir, { recursive: true });

    // Create config
    const config: ProjectConfig = {
      name: options.name,
      path: this.projectPath,
      branchName: options.branchName || 'main',
      language: options.language || 'nodejs',
      createdAt: new Date().toISOString(),
    };
    await this.saveConfig(config);

    // Create initial decompose state
    const decomposeState: DecomposeState = {
      status: 'IDLE',
      message: 'Ready to decompose PRD',
    };
    await this.saveDecomposeState(decomposeState);

    // Create initial ralph status
    const ralphStatus: RalphStatus = {
      status: 'idle',
    };
    await this.saveStatus(ralphStatus);

    // Copy templates
    await this.copyTemplates(options.language || 'nodejs');
  }

  /**
   * Copy template files from the package
   */
  private async copyTemplates(language: string): Promise<void> {
    // Get the templates directory - try multiple locations
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Try possible template locations:
    // 1. From dist/src/core -> ../../.. -> package root -> templates
    // 2. From src/core -> ../.. -> package root -> templates
    const possiblePaths = [
      join(__dirname, '..', '..', '..', 'templates'),  // from dist/src/core
      join(__dirname, '..', '..', 'templates'),        // from src/core (dev)
    ];

    let templatesDir: string | null = null;
    for (const p of possiblePaths) {
      try {
        await access(p);
        templatesDir = p;
        break;
      } catch {
        // Try next path
      }
    }

    if (!templatesDir) {
      // No templates found, create placeholders
      await writeFile(
        this.promptPath,
        '# Ralph Prompt\n\nThis file will be used as the prompt for Claude.\n'
      );
      await writeFile(
        join(this.standardsDir, `${language}.md`),
        `# ${language} Standards\n\nAdd your coding standards here.\n`
      );
      return;
    }

    // Copy prompt.md
    try {
      const promptSrc = join(templatesDir, 'prompt.md');
      await access(promptSrc);
      await copyFile(promptSrc, this.promptPath);
    } catch {
      // Template doesn't exist yet, create a placeholder
      await writeFile(
        this.promptPath,
        '# Ralph Prompt\n\nThis file will be used as the prompt for Claude.\n'
      );
    }

    // Copy decompose-prompt.md
    try {
      const decomposePromptSrc = join(templatesDir, 'decompose-prompt.md');
      await access(decomposePromptSrc);
      await copyFile(decomposePromptSrc, this.decomposePromptPath);
    } catch {
      // Template doesn't exist, skip
    }

    // Copy standards files
    try {
      const standardsSrcDir = join(templatesDir, 'standards');
      await access(standardsSrcDir);
      const files = await readdir(standardsSrcDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          await copyFile(
            join(standardsSrcDir, file),
            join(this.standardsDir, file)
          );
        }
      }
    } catch {
      // Standards directory doesn't exist, create placeholder for chosen language
      await writeFile(
        join(this.standardsDir, `${language}.md`),
        `# ${language} Standards\n\nAdd your coding standards here.\n`
      );
    }
  }

  // Config operations
  async loadConfig(): Promise<ProjectConfig> {
    const content = await readFile(this.configPath, 'utf-8');
    return JSON.parse(content) as ProjectConfig;
  }

  async saveConfig(config: ProjectConfig): Promise<void> {
    await writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  // PRD operations
  async loadPRD(): Promise<PRDData | null> {
    try {
      const content = await readFile(this.prdPath, 'utf-8');
      return JSON.parse(content) as PRDData;
    } catch {
      return null;
    }
  }

  async savePRD(prd: PRDData): Promise<void> {
    await writeFile(this.prdPath, JSON.stringify(prd, null, 2));
  }

  // Decompose state operations
  async loadDecomposeState(): Promise<DecomposeState> {
    try {
      const content = await readFile(this.decomposeStatePath, 'utf-8');
      return JSON.parse(content) as DecomposeState;
    } catch {
      return { status: 'IDLE', message: 'Not initialized' };
    }
  }

  async saveDecomposeState(state: DecomposeState): Promise<void> {
    await writeFile(this.decomposeStatePath, JSON.stringify(state, null, 2));
  }

  // Ralph status operations
  async loadStatus(): Promise<RalphStatus> {
    try {
      const content = await readFile(this.statusPath, 'utf-8');
      return JSON.parse(content) as RalphStatus;
    } catch {
      return { status: 'idle' };
    }
  }

  async saveStatus(status: RalphStatus): Promise<void> {
    await writeFile(this.statusPath, JSON.stringify(status, null, 2));
  }

  // Progress log operations
  async appendProgress(message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    try {
      const existing = await readFile(this.progressPath, 'utf-8');
      await writeFile(this.progressPath, existing + line);
    } catch {
      await writeFile(this.progressPath, line);
    }
  }

  async readProgress(): Promise<string> {
    try {
      return await readFile(this.progressPath, 'utf-8');
    } catch {
      return '';
    }
  }

  // Task operations
  async listTasks(): Promise<string[]> {
    try {
      const files = await readdir(this.tasksDir);
      return files.filter((f) => f.endsWith('.json'));
    } catch {
      return [];
    }
  }

  async loadTask(filename: string): Promise<PRDData | null> {
    try {
      const content = await readFile(join(this.tasksDir, filename), 'utf-8');
      return JSON.parse(content) as PRDData;
    } catch {
      return null;
    }
  }

  async saveTask(filename: string, task: PRDData): Promise<void> {
    await writeFile(join(this.tasksDir, filename), JSON.stringify(task, null, 2));
  }

  // Log operations
  async listLogs(): Promise<string[]> {
    try {
      const files = await readdir(this.logsDir);
      const logFiles = files.filter((f) => f.endsWith('.jsonl') || f.endsWith('.err'));

      // Sort by modification time (oldest first, newest last)
      const filesWithStats = await Promise.all(
        logFiles.map(async (f) => {
          try {
            const stats = await stat(join(this.logsDir, f));
            return { name: f, mtime: stats.mtimeMs };
          } catch {
            return { name: f, mtime: 0 };
          }
        })
      );

      return filesWithStats
        .sort((a, b) => a.mtime - b.mtime)
        .map((f) => f.name);
    } catch {
      return [];
    }
  }

  /**
   * Get the next iteration number based on existing logs
   */
  async getNextIteration(): Promise<number> {
    const logs = await this.listLogs();
    const iterations = logs
      .map((f) => {
        const match = f.match(/iteration_(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => n > 0);

    return iterations.length > 0 ? Math.max(...iterations) + 1 : 1;
  }

  /**
   * Get the standards file path for a language
   */
  getStandardsPath(language: string): string {
    return join(this.standardsDir, `${language}.md`);
  }

  /**
   * Check if standards file exists for a language
   */
  async hasStandards(language: string): Promise<boolean> {
    try {
      await access(this.getStandardsPath(language));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Find the .ralph directory by walking up from current directory
 */
export async function findProjectRoot(startDir: string = process.cwd()): Promise<string | null> {
  let currentDir = startDir;

  while (currentDir !== dirname(currentDir)) {
    const ralphDir = join(currentDir, RALPH_DIR_NAME);
    try {
      await access(ralphDir);
      return currentDir;
    } catch {
      currentDir = dirname(currentDir);
    }
  }

  return null;
}

/**
 * Get a Project instance for the current directory or specified path
 */
export async function getProject(projectPath?: string): Promise<Project | null> {
  const resolvedPath = projectPath || (await findProjectRoot());
  if (!resolvedPath) {
    return null;
  }
  const project = new Project(resolvedPath);
  if (await project.exists()) {
    return project;
  }
  return null;
}
