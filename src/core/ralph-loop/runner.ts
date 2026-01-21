/**
 * Ralph Loop Runner
 *
 * Orchestrates the iterative development process:
 * 1. Read PRD and find next incomplete story
 * 2. Run Claude with the prompt
 * 3. Check for completion
 * 4. Repeat until done or max iterations reached
 */

import chalk from 'chalk';
import { Project } from '../project.js';
import { Registry } from '../registry.js';
import { isDefaultEngineAvailable, selectEngine } from '../llm/engine-factory.js';
import { createConsoleCallbacks } from '../claude/stream-parser.js';
import type { PRDData, UserStory, RalphStatus } from '../../types/index.js';
import type { StreamCallbacks } from '../claude/types.js';

export interface LoopOptions {
  /** Maximum number of iterations (static value or getter for dynamic updates) */
  maxIterations: number | (() => number);
  /** Callback when an iteration starts */
  onIterationStart?: (iteration: number, story: UserStory | null) => void;
  /** Callback when an iteration ends */
  onIterationEnd?: (iteration: number, storyCompleted: boolean, isAllComplete: boolean) => void;
  /** Callback when task count changes (for recalculating loop limit) */
  onTasksChanged?: (newTaskCount: number) => void;
  /** Custom PRD loader for spec-partitioned state (overrides project.loadPRD) */
  loadPRD?: () => Promise<PRDData | null>;
  /** Custom PRD saver for spec-partitioned state (overrides project.savePRD) */
  savePRD?: (prd: PRDData) => Promise<void>;
  /** Preferred engine name and model (overrides settings/env) */
  engineName?: string;
  model?: string;
  /** Optional stream callbacks (e.g., for SSE log piping) */
  streamCallbacks?: StreamCallbacks;
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
 * Get the next story to work on (highest priority incomplete with satisfied dependencies)
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

  const ready = incomplete.filter(hasSatisfiedDependencies);

  if (ready.length === 0) {
    const blocked = incomplete[0];
    const blockedBy = (blocked.dependencies ?? []).filter(
      (dep) => !completedIds.has(dep)
    );
    return { story: blocked, status: 'blocked', blockedBy };
  }

  ready.sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
  return { story: ready[0], status: 'ready' };
}

/**
 * Print iteration header
 */
function printIterationHeader(
  iteration: number,
  maxIterations: number,
  prd: PRDData,
  nextInfo: NextStoryResult
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

  if (nextInfo.status === 'blocked') {
    console.log(chalk.bold('│') + `  ${chalk.red('⏸ Blocked:')} ${nextInfo.story.id}: ${nextInfo.story.title}`);
    console.log(chalk.bold('│') + `  ${chalk.yellow(`Waiting on: ${nextInfo.blockedBy.join(', ')}`)}`);
  } else if (nextInfo.story) {
    console.log(chalk.bold('│') + `  ${chalk.cyan('▶ Next:')} ${nextInfo.story.id}: ${nextInfo.story.title}`);
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
  const { onIterationStart, onIterationEnd, onTasksChanged } = options;

  // Support both static and dynamic max iterations
  const getMaxIterations = typeof options.maxIterations === 'function'
    ? options.maxIterations
    : () => options.maxIterations as number;

  const loadPRD = options.loadPRD ?? (() => project.loadPRD());

  if (!(await isDefaultEngineAvailable())) {
    throw new Error('No compatible LLM engine is available. Configure or install one to proceed.');
  }

  let prd = await loadPRD();
  if (!prd) {
    throw new Error('No PRD loaded. Run `qala decompose <prd-file>` first.');
  }

  const initialCompleted = prd.userStories.filter((s) => s.passes).length;
  let storiesCompleted = 0;

  console.log('');
  console.log(chalk.bold('╔═══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold('║') + `  ${chalk.cyan('Ralph Loop')} - Structured Task Runner                        ` + chalk.bold('║'));
  console.log(chalk.bold('╠═══════════════════════════════════════════════════════════════╣'));
  console.log(chalk.bold('║') + `  Project: ${chalk.cyan(prd.projectName)}`);
  console.log(chalk.bold('║') + `  Branch:  ${chalk.yellow(prd.branchName)}`);
  console.log(chalk.bold('║') + `  Stories: ${chalk.green(String(prd.userStories.length))} total`);
  console.log(chalk.bold('║') + `  Max iterations: ${getMaxIterations()} (dynamic)`);
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
      const nextInfo = getNextStory(prd);
      const currentMax = getMaxIterations();

      printIterationHeader(iteration, currentMax, prd, nextInfo);

      onIterationStart?.(iteration, nextInfo.story);

      await project.saveStatus({
        status: 'running',
        currentIteration: iteration,
        maxIterations: currentMax,
        currentStory: nextInfo.story ? `${nextInfo.story.id}: ${nextInfo.story.title}` : undefined,
        startedAt: new Date().toISOString(),
        pid: process.pid,
      });

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
        console.log(chalk.red('║  Check prd.json for circular or unmet dependencies            ║'));
        console.log(chalk.red('╚═══════════════════════════════════════════════════════════════╝'));
        return {
          allComplete: false,
          iterationsRun: iteration - 1,
          storiesCompleted,
          finalPrd: prd,
        };
      }

      console.log(chalk.yellow('Starting Claude...'));
      console.log('');

      const callbacks = options.streamCallbacks || createConsoleCallbacks();
      const sel = await selectEngine({ engineName: options.engineName, model: options.model, purpose: 'taskRunner' });
      const result = await sel.engine.runStream({
        promptPath: project.promptPath,
        cwd: project.projectPath,
        logDir: project.logsDir,
        iteration,
        callbacks,
        model: sel.model,
      });

      console.log('');
      console.log(`  ${chalk.cyan('JSONL saved:')} ${result.jsonlPath}`);
      console.log(`  ${chalk.cyan('Duration:')} ${Math.round(result.durationMs / 1000)}s`);

      if (result.isComplete) {
        console.log('');
        console.log(chalk.green('╔═══════════════════════════════════════════════════════════════╗'));
        console.log(chalk.green('║  ✅ All stories complete!                                      ║'));
        console.log(chalk.green(`║  Finished at iteration ${iteration}                                       ║`));
        console.log(chalk.green('╚═══════════════════════════════════════════════════════════════╝'));

        // Reload PRD to get final state
        prd = (await loadPRD()) || prd;
        storiesCompleted = prd.userStories.filter((s) => s.passes).length - initialCompleted;

        onIterationEnd?.(iteration, true, true);

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
        prd = newPrd;

        if (newTotal > oldTotal) {
          const incompleteCount = newPrd.userStories.filter((s) => !s.passes).length;
          onTasksChanged?.(incompleteCount);
        }

        if (newCompleted > oldCompleted) {
          console.log(chalk.green(`  ✓ Story completed! (${oldCompleted} → ${newCompleted})`));
          storiesCompleted++;
          onIterationEnd?.(iteration, true, false);
        } else {
          console.log(chalk.yellow('  ⚠ No story marked complete this iteration'));
          onIterationEnd?.(iteration, false, false);
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
    console.log(chalk.yellow('║  Check prd.json for remaining stories                         ║'));
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
