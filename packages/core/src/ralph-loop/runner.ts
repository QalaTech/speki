/**
 * Ralph Loop Runner
 *
 * Orchestrates the iterative development process:
 * 1. Read PRD and find next incomplete story
 * 2. Run Engine with the prompt
 * 3. Check for completion
 * 4. Repeat until done or max iterations reached
 */

import chalk from 'chalk';
import { Project } from '../project.js';
import { Registry } from '../registry.js';
import { isDefaultEngineAvailable, selectEngine } from '../llm/engine-factory.js';
import { createConsoleCallbacks } from '../claude/stream-parser.js';
import type { PRDData, UserStory, RalphStatus } from '../types/index.js';
import type { StreamCallbacks } from '../claude/types.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface LoopOptions {
  /** Maximum number of iterations (static value or getter for dynamic updates) */
  maxIterations: number | (() => number);
  /** Spec ID being executed (optional for queue-based execution) */
  specId?: string;
  /** Directory for storing iteration logs */
  logDir: string;
  /** Callback when an iteration starts */
  onIterationStart?: (iteration: number, story: UserStory | null) => void | Promise<void>;
  /** Callback when an iteration ends */
  onIterationEnd?: (iteration: number, storyCompleted: boolean, isAllComplete: boolean) => void | Promise<void>;
  /** Callback when task count changes (for recalculating loop limit) */
  onTasksChanged?: (newTaskCount: number) => void;
  /** PRD loader for spec-partitioned state (required) */
  loadPRD: () => Promise<PRDData | null>;
  /** PRD saver for spec-partitioned state */
  savePRD?: (prd: PRDData) => Promise<void>;
  /** Preferred engine name and model (overrides settings/env) */
  engineName?: string;
  model?: string;
  /** Optional stream callbacks (e.g., for SSE log piping) */
  streamCallbacks?: StreamCallbacks;
  /** Parallel execution configuration */
  parallel?: {
    /** Enable parallel task execution */
    enabled: boolean;
    /** Maximum number of parallel tasks (1-8) */
    maxParallel: number;
  };
}

export interface LoopResult {
  /** Whether all stories were completed */
  allComplete: boolean;
  /** Number of iterations run */
  iterationsRun: number;
  /** Number of stories completed during this run */
  storiesCompleted: number;
  /** Final PRD state */
  finalPrd: PRDData;
}

type NextStoryResult =
  | { story: null; status: 'complete' }
  | { story: UserStory; status: 'ready' }
  | { story: UserStory; status: 'blocked'; blockedBy: string[] };

/**
 * Get the next story to work on (first incomplete in queue order with satisfied dependencies)
 * Note: Queue order takes precedence over priority to match CLI behavior
 */
function getNextStory(prd: PRDData): NextStoryResult {
  const completedIds = new Set(
    prd.userStories.filter((s) => s.passes).map((s) => s.id)
  );
  const incomplete = prd.userStories.filter((s) => !s.passes);

  if (incomplete.length === 0) {
    return { story: null, status: 'complete' };
  }

  const hasSatisfiedDependencies = (story: UserStory): boolean =>
    (story.dependencies ?? []).every((dep) => completedIds.has(dep));

  // Find first task in queue order with satisfied dependencies
  // (preserves queue order instead of sorting by priority)
  for (const story of incomplete) {
    if (hasSatisfiedDependencies(story)) {
      return { story, status: 'ready' };
    }
  }

  // All incomplete tasks are blocked
  const blocked = incomplete[0];
  const blockedBy = (blocked.dependencies ?? []).filter(
    (dep) => !completedIds.has(dep)
  );
  return { story: blocked, status: 'blocked', blockedBy };
}

/**
 * Get multiple ready stories to execute in parallel.
 * Returns up to maxCount stories that have their dependencies satisfied.
 */
function getReadyStories(prd: PRDData, maxCount: number): UserStory[] {
  const completedIds = new Set(
    prd.userStories.filter((s) => s.passes).map((s) => s.id)
  );
  const incomplete = prd.userStories.filter((s) => !s.passes);

  if (incomplete.length === 0) {
    return [];
  }

  const ready: UserStory[] = [];

  for (const story of incomplete) {
    const deps = story.dependencies ?? [];
    if (deps.every((dep) => completedIds.has(dep))) {
      ready.push(story);
      if (ready.length >= maxCount) {
        break;
      }
    }
  }

  return ready;
}

/**
 * Execute a single story with its own log directory.
 * Returns true if the story was completed.
 */
async function executeStory(
  project: Project,
  story: UserStory,
  prd: PRDData,
  specId: string,
  baseLogDir: string,
  iteration: number,
  engineName?: string,
  model?: string,
  streamCallbacks?: StreamCallbacks
): Promise<{ completed: boolean; jsonlPath: string; durationMs: number }> {
  // Create a unique log directory for this task
  const taskLogDir = path.join(baseLogDir, `task-${story.id}-${Date.now()}`);
  await fs.mkdir(taskLogDir, { recursive: true });

  // Generate task context for this specific story
  await project.generateCurrentTaskContext(story, prd, specId);

  const sel = await selectEngine({ engineName, model, purpose: 'taskRunner' });
  const engineDisplayName = sel.engineName.includes('claude') ? 'Claude' :
                           sel.engineName.includes('gemini') ? 'Gemini' :
                           sel.engineName.includes('codex') ? 'Codex' : 'Engine';

  console.log(chalk.yellow(`  [${story.id}] Starting ${engineDisplayName}...`));

  const callbacks = streamCallbacks || createConsoleCallbacks();
  const result = await sel.engine.runStream({
    promptPath: project.promptPath,
    cwd: project.projectPath,
    logDir: taskLogDir,
    iteration,
    callbacks,
    model: sel.model,
  });

  console.log(chalk.gray(`  [${story.id}] JSONL saved: ${result.jsonlPath}`));
  console.log(chalk.gray(`  [${story.id}] Duration: ${Math.round(result.durationMs / 1000)}s`));

  return {
    completed: result.isComplete,
    jsonlPath: result.jsonlPath,
    durationMs: result.durationMs,
  };
}

/**
 * Print parallel execution header showing multiple tasks
 */
function printParallelHeader(
  iteration: number,
  maxIterations: number,
  prd: PRDData,
  runningStories: UserStory[]
): void {
  const total = prd.userStories.length;
  const completed = prd.userStories.filter((s) => s.passes).length;
  const completedIds = new Set(
    prd.userStories.filter((s) => s.passes).map((s) => s.id)
  );
  const incomplete = prd.userStories.filter((s) => !s.passes);
  const readyCount = incomplete.filter((s) =>
    (s.dependencies ?? []).every((dep) => completedIds.has(dep))
  ).length;
  const blockedCount = incomplete.length - readyCount;

  const iterationText = `Iteration ${iteration} / ${maxIterations}`;
  const progressText = `Progress: ${chalk.green(String(completed))}/${total} complete (${chalk.green(String(readyCount))} ready, ${chalk.yellow(String(blockedCount))} blocked)`;

  console.log('');
  console.log(chalk.bold('┌─────────────────────────────────────────────────────────────────┐'));
  console.log(chalk.bold('│') + `  ${chalk.blue(iterationText)}` + ' '.repeat(Math.max(0, 47 - iterationText.length)) + chalk.bold('│'));
  console.log(chalk.bold('│') + `  ${progressText}` + ' '.repeat(30) + chalk.bold('│'));
  console.log(chalk.bold('├─────────────────────────────────────────────────────────────────┤'));
  console.log(chalk.bold('│') + `  ${chalk.cyan('▶ Running ' + runningStories.length + ' tasks in parallel:')}`);
  for (const story of runningStories) {
    console.log(chalk.bold('│') + `      - ${story.id}: ${story.title.substring(0, 40)}`);
  }
  console.log(chalk.bold('└─────────────────────────────────────────────────────────────────┘'));
  console.log('');
}

/**
 * Run the Ralph loop
 */
export async function runRalphLoop(
  project: Project,
  options: LoopOptions
): Promise<LoopResult> {
  const { onIterationStart, onIterationEnd, onTasksChanged, loadPRD, logDir, specId } = options;

  // Support both static and dynamic max iterations
  const getMaxIterations = typeof options.maxIterations === 'function'
    ? options.maxIterations
    : () => options.maxIterations as number;

  if (!(await isDefaultEngineAvailable())) {
    throw new Error('No compatible LLM engine is available. Configure or install one to proceed.');
  }

  const loadedPrd = await loadPRD();
  if (!loadedPrd) {
    throw new Error('No PRD loaded. Run `qala decompose <prd-file>` first.');
  }
  let prd: PRDData = loadedPrd;

  const initialCompleted = prd.userStories.filter((s) => s.passes).length;
  let storiesCompleted = 0;

  console.log('');
  console.log(chalk.bold('╔═══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold('║') + `  ${chalk.cyan('Ralph Loop')} - Structured Task Runner                        ` + chalk.bold('║'));
  console.log(chalk.bold('╠═══════════════════════════════════════════════════════════════╣'));
  console.log(chalk.bold('║') + `  Project: ${chalk.cyan(prd.projectName)}`);
  if (specId) {
    console.log(chalk.bold('║') + `  Spec:    ${chalk.yellow(specId)}`);
  } else {
    console.log(chalk.bold('║') + `  Mode:    ${chalk.yellow('Queue-based execution')}`);
  }
  console.log(chalk.bold('║') + `  Branch:  ${chalk.yellow(prd.branchName)}`);
  console.log(chalk.bold('║') + `  Stories: ${chalk.green(String(prd.userStories.length))} total`);
  const parallelConfig = options.parallel?.enabled
    ? { enabled: true, maxParallel: options.parallel.maxParallel }
    : { enabled: false, maxParallel: 1 };

  if (parallelConfig.enabled) {
    console.log(chalk.bold('║') + `  Parallel: ${chalk.green('enabled')} (max ${parallelConfig.maxParallel} tasks)`);
  }
  console.log(chalk.bold('╚═══════════════════════════════════════════════════════════════╝'));
  console.log('');

  await project.saveStatus({
    status: 'running',
    currentIteration: 0,
    maxIterations: getMaxIterations(),
    startedAt: new Date().toISOString(),
    pid: process.pid,
  });
  await Registry.updateStatus(project.projectPath, 'running', process.pid);

  try {
    let iteration = 1;
    while (iteration <= getMaxIterations()) {
      const currentMax = getMaxIterations();

      // Get ready stories based on parallel config
      const readyStories = parallelConfig.enabled
        ? getReadyStories(prd, parallelConfig.maxParallel)
        : [getNextStory(prd)].filter((r): r is { story: UserStory; status: 'ready' } => r.status === 'ready').map(r => r.story);

      // Debug: Log ready stories count
      console.log(chalk.gray(`  Debug: Found ${readyStories.length} ready stories (maxParallel: ${parallelConfig.maxParallel})`));

      if (readyStories.length === 0) {
        // Check if blocked or complete
        const nextInfo = getNextStory(prd);
        if (nextInfo.status === 'complete') {
          console.log(chalk.green('All stories already complete!'));
          return {
            allComplete: true,
            iterationsRun: iteration - 1,
            storiesCompleted,
            finalPrd: prd,
          };
        }
        if (nextInfo.status === 'blocked') {
          console.log(chalk.red('╔═══════════════════════════════════════════════════════════════╗'));
          console.log(chalk.red('║  ⛔ All remaining stories are blocked by dependencies         ║'));
          console.log(chalk.red('║  Check tasks.json for circular or unmet dependencies          ║'));
          console.log(chalk.red('╚═══════════════════════════════════════════════════════════════╝'));
          return {
            allComplete: false,
            iterationsRun: iteration - 1,
            storiesCompleted,
            finalPrd: prd,
          };
        }
      }

      // Print appropriate header
      if (parallelConfig.enabled && readyStories.length > 1) {
        printParallelHeader(iteration, currentMax, prd, readyStories);
      } else if (readyStories.length > 0) {
        const nextInfo = getNextStory(prd);
        // Use inline header for single task
        const total = prd.userStories.length;
        const completed = prd.userStories.filter((s) => s.passes).length;
        console.log('');
        console.log(chalk.bold('┌─────────────────────────────────────────────────────────────────┐'));
        console.log(chalk.bold('│') + `  ${chalk.blue(`Iteration ${iteration} / ${currentMax}`)}` + ' '.repeat(47 - 18 - String(iteration).length - String(currentMax).length) + chalk.bold('│'));
        console.log(chalk.bold('│') + `  Progress: ${chalk.green(String(completed))}/${total} complete` + ' '.repeat(30) + chalk.bold('│'));
        console.log(chalk.bold('├─────────────────────────────────────────────────────────────────┤'));
        console.log(chalk.bold('│') + `  ${chalk.cyan('▶ Next:')} ${readyStories[0].id}: ${readyStories[0].title}`);
        console.log(chalk.bold('└─────────────────────────────────────────────────────────────────┘'));
        console.log('');
      }

      await onIterationStart?.(iteration, readyStories[0] || null);

      await project.saveStatus({
        status: 'running',
        currentIteration: iteration,
        maxIterations: currentMax,
        currentStory: readyStories.map(s => s.id).join(', '),
        startedAt: new Date().toISOString(),
        pid: process.pid,
      });

      // Execute stories
      let allComplete = false;
      let taskResults: Array<{ story: UserStory; completed: boolean }> = [];

      // Run in parallel if:
      // 1. Parallel is enabled AND
      // 2. We have at least 1 ready story AND maxParallel > 1 OR we have multiple ready stories
      const shouldParallelize = parallelConfig.enabled &&
        readyStories.length >= 1 &&
        (readyStories.length > 1 || parallelConfig.maxParallel > 1);

      if (shouldParallelize) {
        // Execute in parallel
        console.log(chalk.cyan(`  Running ${readyStories.length} tasks in parallel...\n`));
        const results = await Promise.all(
          readyStories.map(story =>
            executeStory(
              project, story, prd, specId || '', logDir, iteration,
              options.engineName, options.model, options.streamCallbacks
            ).then(result => ({ story, completed: result.completed }))
          )
        );
        taskResults = results;
        allComplete = results.every(r => r.completed);
      } else if (readyStories.length > 0) {
        // Single task execution (original behavior)
        const story = readyStories[0];
        const result = await executeStory(
          project, story, prd, specId || '', logDir, iteration,
          options.engineName, options.model, options.streamCallbacks
        );
        taskResults = [{ story, completed: result.completed }];
        allComplete = result.completed;
      }

      console.log('');

      if (allComplete) {
        console.log('');
        console.log(chalk.green('╔═══════════════════════════════════════════════════════════════╗'));
        console.log(chalk.green('║  ✅ All stories complete!                                      ║'));
        console.log(chalk.green(`║  Finished at iteration ${iteration}                                       ║`));
        console.log(chalk.green('╚═══════════════════════════════════════════════════════════════╝'));

        // Reload PRD to get final state
        prd = (await loadPRD()) || prd;
        storiesCompleted = prd.userStories.filter((s) => s.passes).length - initialCompleted;

        await onIterationEnd?.(iteration, true, true);

        return {
          allComplete: true,
          iterationsRun: iteration,
          storiesCompleted,
          finalPrd: prd,
        };
      }

      const newPrd = await loadPRD();
      if (newPrd) {
        const oldCompleted = prd.userStories.filter((s) => s.passes).length;
        const newCompleted = newPrd.userStories.filter((s) => s.passes).length;
        const oldTotal = prd.userStories.length;
        const newTotal = newPrd.userStories.length;
        prd = newPrd as PRDData;

        if (newTotal > oldTotal) {
          const incompleteCount = newPrd.userStories.filter((s) => !s.passes).length;
          onTasksChanged?.(incompleteCount);
        }

        if (newCompleted > oldCompleted) {
          console.log(chalk.green(`  ✓ Stories completed: ${oldCompleted} → ${newCompleted}`));
          storiesCompleted += (newCompleted - oldCompleted);
          await onIterationEnd?.(iteration, true, false);
        } else {
          console.log(chalk.yellow('  ⚠ No stories marked complete this iteration'));
          await onIterationEnd?.(iteration, false, false);
        }
      }

      console.log('');
      console.log(chalk.blue('───────────────────────────────────────────────────────────────────'));

      await new Promise((resolve) => setTimeout(resolve, 2000));

      iteration++;
    }

    // Max iterations reached
    const finalMax = getMaxIterations();
    console.log('');
    console.log(chalk.yellow('╔═══════════════════════════════════════════════════════════════╗'));
    console.log(chalk.yellow(`║  ⚠ Max iterations (${finalMax}) reached                            ║`));
    console.log(chalk.yellow('║  Check tasks.json for remaining stories                       ║'));
    console.log(chalk.yellow('╚═══════════════════════════════════════════════════════════════╝'));

    return {
      allComplete: false,
      iterationsRun: finalMax,
      storiesCompleted,
      finalPrd: prd,
    };
  } finally {
    await project.cleanupCurrentTaskContext();
    await project.saveStatus({ status: 'idle' });
    await Registry.updateStatus(project.projectPath, 'idle');
  }
}
