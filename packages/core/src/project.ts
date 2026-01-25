import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, readFile, writeFile, access, copyFile, readdir, stat } from 'fs/promises';
import type {
  ProjectConfig,
  PRDData,
  DecomposeState,
  RalphStatus,
  UserStory,
  CurrentTaskContext,
  TaskReference,
  PeerFeedback,
} from './types/index.js';

const SPEKI_DIR_NAME = '.speki';

export class Project {
  readonly projectPath: string;
  readonly spekiDir: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath.replace(/[/\\]$/, '');
    this.spekiDir = join(this.projectPath, SPEKI_DIR_NAME);
  }

  // Path helpers
  get configPath(): string {
    return join(this.spekiDir, 'config.json');
  }
  /** @deprecated Use loadPRDForSpec/savePRDForSpec from spec-metadata.ts */
  get prdPath(): string {
    throw new Error('prdPath is deprecated - use loadPRDForSpec/savePRDForSpec for per-spec PRD access');
  }
  /** @deprecated Use loadDecomposeStateForSpec/saveDecomposeStateForSpec from spec-metadata.ts */
  get decomposeStatePath(): string {
    throw new Error('decomposeStatePath is deprecated - use loadDecomposeStateForSpec/saveDecomposeStateForSpec for per-spec access');
  }
  get decomposeFeedbackPath(): string {
    return join(this.spekiDir, 'decompose_feedback.json');
  }
  get statusPath(): string {
    return join(this.spekiDir, '.speki-status.json');
  }
  get progressPath(): string {
    return join(this.spekiDir, 'progress.txt');
  }
  get peerFeedbackPath(): string {
    return join(this.spekiDir, 'peer_feedback.json');
  }
  get promptPath(): string {
    return join(this.spekiDir, 'prompt.md');
  }
  get decomposePromptPath(): string {
    return join(this.spekiDir, 'decompose-prompt.md');
  }
  get tasksDir(): string {
    return join(this.spekiDir, 'tasks');
  }
  /** @deprecated Use getSpecLogsDir from spec-metadata.ts */
  get logsDir(): string {
    throw new Error('logsDir is deprecated - use getSpecLogsDir(projectPath, specId) for per-spec logs');
  }
  get standardsDir(): string {
    return join(this.spekiDir, 'standards');
  }
  get currentTaskPath(): string {
    return join(this.spekiDir, 'current-task.json');
  }

  /**
   * Check if .speki folder exists
   */
  async exists(): Promise<boolean> {
    try {
      await access(this.spekiDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize .speki folder with all required files and directories
   */
  async initialize(options: {
    name: string;
    branchName?: string;
    language?: string;
  }): Promise<void> {
    // Create directories
    await mkdir(this.spekiDir, { recursive: true });
    await mkdir(this.tasksDir, { recursive: true });
    // Note: logsDir is now per-spec, created via ensureSpecDir()
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

    // Note: decompose state is now per-spec, created when decomposing a spec

    // Create initial ralph status
    const ralphStatus: RalphStatus = {
      status: 'idle',
    };
    await this.saveStatus(ralphStatus);

    // Create initial peer feedback (empty knowledge base)
    const peerFeedback: PeerFeedback = {
      blocking: [],
      suggestions: [],
      lessonsLearned: [],
    };
    await this.savePeerFeedback(peerFeedback);

    // Copy templates
    await this.copyTemplates(options.language || 'nodejs');
  }

  /**
   * Copy template files from the package
   */
  private async copyTemplates(language: string): Promise<void> {
    const templatesDir = await this.resolveTemplatesDir();

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

  /**
   * Update template files from the package templates.
   * Only updates: prompt.md, decompose-prompt.md, standards/*.md
   * Does NOT touch: config.json, prd.json, progress.txt, peer_feedback.json, logs/, tasks/
   *
   * @returns List of files that were updated
   */
  async updateTemplates(): Promise<string[]> {
    const updated: string[] = [];
    const templatesDir = await this.resolveTemplatesDir();

    if (!templatesDir) {
      throw new Error('Templates directory not found');
    }

    // Update prompt.md
    try {
      const promptSrc = join(templatesDir, 'prompt.md');
      await access(promptSrc);
      await copyFile(promptSrc, this.promptPath);
      updated.push('prompt.md');
    } catch {
      // Template doesn't exist
    }

    // Update decompose-prompt.md
    try {
      const decomposePromptSrc = join(templatesDir, 'decompose-prompt.md');
      await access(decomposePromptSrc);
      await copyFile(decomposePromptSrc, this.decomposePromptPath);
      updated.push('decompose-prompt.md');
    } catch {
      // Template doesn't exist
    }

    // Update standards files
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
          updated.push(`standards/${file}`);
        }
      }
    } catch {
      // Standards directory doesn't exist
    }

    // Update skills files if they exist
    try {
      const skillsSrcDir = join(templatesDir, 'skills');
      await access(skillsSrcDir);
      const skillsDestDir = join(this.spekiDir, 'skills');
      await mkdir(skillsDestDir, { recursive: true });
      const files = await readdir(skillsSrcDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          await copyFile(
            join(skillsSrcDir, file),
            join(skillsDestDir, file)
          );
          updated.push(`skills/${file}`);
        }
      }
    } catch {
      // Skills directory doesn't exist
    }

    return updated;
  }

  /**
   * Resolve templates directory from source or dist locations.
   */
  private async resolveTemplatesDir(): Promise<string | null> {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const possiblePaths = [
      // Monorepo: templates are in packages/cli/templates
      join(__dirname, '..', '..', '..', 'cli', 'templates'),  // from packages/core/dist
      join(__dirname, '..', '..', 'cli', 'templates'),        // from packages/core/src (dev)
      // Legacy paths (pre-monorepo)
      join(__dirname, '..', '..', '..', 'templates'),
      join(__dirname, '..', '..', 'templates'),
    ];
    for (const p of possiblePaths) {
      try {
        await access(p);
        return p;
      } catch {
        // try next path
      }
    }
    return null;
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
  /** @deprecated Use loadPRDForSpec from spec-metadata.ts */
  async loadPRD(): Promise<PRDData | null> {
    throw new Error('loadPRD is deprecated - use loadPRDForSpec(projectPath, specId) for per-spec PRD access');
  }

  /** @deprecated Use savePRDForSpec from spec-metadata.ts */
  async savePRD(prd: PRDData): Promise<void> {
    throw new Error('savePRD is deprecated - use savePRDForSpec(projectPath, specId, prd) for per-spec PRD access');
  }

  // Decompose state operations
  /** @deprecated Use loadDecomposeStateForSpec from spec-metadata.ts */
  async loadDecomposeState(): Promise<DecomposeState> {
    throw new Error('loadDecomposeState is deprecated - use loadDecomposeStateForSpec(projectPath, specId) for per-spec access');
  }

  /** @deprecated Use saveDecomposeStateForSpec from spec-metadata.ts */
  async saveDecomposeState(state: DecomposeState): Promise<void> {
    throw new Error('saveDecomposeState is deprecated - use saveDecomposeStateForSpec(projectPath, specId, state) for per-spec access');
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

  // Peer feedback operations
  async loadPeerFeedback(): Promise<PeerFeedback> {
    try {
      const content = await readFile(this.peerFeedbackPath, 'utf-8');
      return JSON.parse(content) as PeerFeedback;
    } catch {
      return { blocking: [], suggestions: [], lessonsLearned: [] };
    }
  }

  async savePeerFeedback(feedback: PeerFeedback): Promise<void> {
    await writeFile(this.peerFeedbackPath, JSON.stringify(feedback, null, 2));
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
  /** @deprecated Logs are now per-spec. Use getSpecLogsDir(projectPath, specId) to get logs for a specific spec */
  async listLogs(): Promise<string[]> {
    throw new Error('listLogs is deprecated - logs are now stored per-spec in .speki/specs/<specId>/logs/');
  }

  /**
   * Get the next iteration number based on existing logs
   */
  /** @deprecated Logs are now per-spec. Iteration tracking should be done per-spec */
  async getNextIteration(): Promise<number> {
    throw new Error('getNextIteration is deprecated - iteration tracking is now per-spec');
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

  /**
   * List available standards files in the standards directory
   */
  async listAvailableStandards(): Promise<string[]> {
    try {
      const files = await readdir(this.standardsDir);
      return files.filter((f) => f.endsWith('.md'));
    } catch {
      return [];
    }
  }

  /**
   * Generate focused context for the current task iteration
   */
  async generateCurrentTaskContext(currentTask: UserStory, prd: PRDData, specId: string): Promise<CurrentTaskContext> {
    const config = await this.loadConfig();

    // Get completed task IDs
    const completedIds = new Set(
      prd.userStories.filter((s) => s.passes).map((s) => s.id)
    );

    // Get completed dependencies (just refs)
    const completedDependencies: TaskReference[] = currentTask.dependencies
      .filter((depId) => completedIds.has(depId))
      .map((depId) => {
        const dep = prd.userStories.find((s) => s.id === depId);
        return {
          id: depId,
          title: dep?.title || 'Unknown',
        };
      });

    // Get tasks that this task blocks (downstream tasks depending on this one)
    const blocks: TaskReference[] = prd.userStories
      .filter((s) => !s.passes && s.dependencies.includes(currentTask.id))
      .map((s) => ({
        id: s.id,
        title: s.title,
      }));

    // Get available standards
    const availableStandards = await this.listAvailableStandards();

    const context: CurrentTaskContext = {
      project: {
        name: prd.projectName,
        branch: prd.branchName,
      },
      currentTask,
      completedDependencies,
      blocks,
      availableStandards,
      progressFile: '.speki/progress.txt',
      prdFile: `.speki/specs/${specId}/tasks.json`,
      peerFeedbackFile: '.speki/peer_feedback.json',
    };

    // Save to file
    await writeFile(this.currentTaskPath, JSON.stringify(context, null, 2));

    return context;
  }

  /**
   * Clean up the current task context file
   */
  async cleanupCurrentTaskContext(): Promise<void> {
    try {
      const { unlink } = await import('fs/promises');
      await unlink(this.currentTaskPath);
    } catch {
      // File doesn't exist, ignore
    }
  }
}

/**
 * Find the .speki directory by walking up from current directory
 */
export async function findProjectRoot(startDir: string = process.cwd()): Promise<string | null> {
  let currentDir = startDir;

  while (currentDir !== dirname(currentDir)) {
    const spekiDir = join(currentDir, SPEKI_DIR_NAME);
    try {
      await access(spekiDir);
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
