import { Command } from 'commander';
import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import { Project, findProjectRoot } from '../../core/project.js';
import { Registry } from '../../core/registry.js';
import { runRalphLoop } from '../../core/ralph-loop/runner.js';
import { calculateLoopLimit } from '../../core/ralph-loop/loop-limit.js';
import { isClaudeAvailable } from '../../core/claude/runner.js';
import { preventSleep, allowSleep, isPreventingSleep } from '../../core/keep-awake.js';
import { loadGlobalSettings } from '../../core/settings.js';
import {
  listSpecs,
  loadPRDForSpec,
  updateSpecStatus,
  readSpecMetadata,
} from '../../core/spec-review/spec-metadata.js';
import type { PRDData } from '../../types/index.js';

/**
 * Resolves the spec ID and loads PRD from spec-partitioned location.
 * Falls back to legacy .ralph/prd.json if no specs exist.
 *
 * @param projectPath - The project root path
 * @param project - The Project instance
 * @param specOption - Optional spec ID provided via --spec flag
 * @returns The PRD and spec ID (null if using legacy location)
 */
async function resolveSpecAndLoadPRD(
  projectPath: string,
  project: Project,
  specOption?: string
): Promise<{ prd: PRDData; specId: string | null } | null> {
  const specs = await listSpecs(projectPath);

  // If --spec flag is provided, use that
  if (specOption) {
    return resolveExplicitSpec(projectPath, specs, specOption);
  }

  // If single spec exists, use it
  if (specs.length === 1) {
    const specId = specs[0];
    const prd = await loadPRDForSpec(projectPath, specId);
    if (prd) {
      return { prd, specId };
    }
  }

  // If multiple specs exist, prompt user to select
  if (specs.length > 1) {
    return resolveMultipleSpecs(projectPath, specs);
  }

  // No specs exist, fall back to legacy location
  const legacyPrd = await project.loadPRD();
  if (legacyPrd) {
    return { prd: legacyPrd, specId: null };
  }

  return null;
}

/**
 * Handles explicit --spec flag by validating and loading the specified spec.
 */
async function resolveExplicitSpec(
  projectPath: string,
  specs: string[],
  specOption: string
): Promise<{ prd: PRDData; specId: string } | null> {
  if (!specs.includes(specOption)) {
    console.error(chalk.red(`Error: Spec '${specOption}' not found.`));
    console.error(chalk.yellow(`Available specs: ${specs.join(', ') || 'none'}`));
    return null;
  }

  const prd = await loadPRDForSpec(projectPath, specOption);
  if (!prd) {
    console.error(chalk.red(`Error: No PRD found for spec '${specOption}'. Run \`qala decompose\` first.`));
    return null;
  }

  return { prd, specId: specOption };
}

/**
 * Handles multiple specs by filtering to those with decomposed PRDs and prompting for selection.
 */
async function resolveMultipleSpecs(
  projectPath: string,
  specs: string[]
): Promise<{ prd: PRDData; specId: string } | null> {
  const validStatuses = ['decomposed', 'active', 'completed'];
  const specsWithPrds: string[] = [];

  for (const spec of specs) {
    const metadata = await readSpecMetadata(projectPath, spec);
    if (metadata && validStatuses.includes(metadata.status)) {
      const prd = await loadPRDForSpec(projectPath, spec);
      if (prd) {
        specsWithPrds.push(spec);
      }
    }
  }

  if (specsWithPrds.length === 0) {
    console.error(chalk.red('Error: No specs have decomposed PRDs. Run `qala decompose` first.'));
    return null;
  }

  const specId = specsWithPrds.length === 1
    ? specsWithPrds[0]
    : await select({
        message: 'Multiple decomposed specs found. Select one to start:',
        choices: specsWithPrds.map((spec) => ({ name: spec, value: spec })),
      });

  const prd = await loadPRDForSpec(projectPath, specId);
  return prd ? { prd, specId } : null;
}

export const startCommand = new Command('start')
  .description('Start Ralph loop for current project')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('-s, --spec <spec-id>', 'Spec ID to run (prompts for selection if multiple specs exist)')
  .option('-i, --iterations <number>', 'Maximum iterations (default: auto-calculated based on task count)')
  .option('-k, --keep-awake', 'Prevent system sleep (default: from settings, use --no-keep-awake to disable)')
  .option('--no-keep-awake', 'Allow system to sleep while running')
  .option('--daemon', 'Run in background (not yet implemented)')
  .action(async (options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(
          chalk.red('Error: No Qala project found. Run `qala init` first.')
        );
        process.exit(1);
      }

      if (!(await isClaudeAvailable())) {
        console.error(
          chalk.red('Error: Claude CLI is not available.')
        );
        console.error(
          chalk.gray('Install it from: https://docs.anthropic.com/claude-code')
        );
        process.exit(1);
      }

      // Resolve spec and load PRD
      const result = await resolveSpecAndLoadPRD(projectPath, project, options.spec);
      if (!result) {
        console.error(
          chalk.red('Error: No PRD found. Run `qala decompose <prd-file>` first.')
        );
        process.exit(1);
      }

      const { prd, specId } = result;

      const incompleteStories = prd.userStories.filter((s) => !s.passes);
      if (incompleteStories.length === 0) {
        console.log(chalk.green('All stories are complete!'));
        return;
      }

      // Transition spec status to 'active' if using spec-partitioned state
      if (specId) {
        try {
          await updateSpecStatus(projectPath, specId, 'active');
          console.log(chalk.cyan(`  Spec '${specId}' status: active`));
        } catch (error) {
          // Status transition may fail if already active or other valid state
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (!errorMessage.includes('Invalid status transition')) {
            throw error;
          }
          // Already in valid state for running (e.g., already active)
        }
      }

      if (options.daemon) {
        console.log(
          chalk.yellow('Daemon mode not yet implemented. Running in foreground.')
        );
      }

      const settings = await loadGlobalSettings();
      const shouldKeepAwake = options.keepAwake ?? settings.execution.keepAwake;

      if (shouldKeepAwake) {
        const sleepResult = preventSleep();
        if (sleepResult.success) {
          console.log(chalk.green(`  Sleep prevention active (${sleepResult.method})`));
        } else {
          console.log(
            chalk.yellow(`  Sleep prevention unavailable: ${sleepResult.error}`)
          );
          console.log(
            chalk.gray('  Tip: Ensure AC power is connected for overnight runs')
          );
        }
      }

      let stopping = false;
      const cleanup = async () => {
        if (stopping) return;
        stopping = true;
        console.log('');
        console.log(chalk.yellow('Stopping Ralph loop...'));

        if (isPreventingSleep()) {
          allowSleep();
          console.log(chalk.gray('  Sleep prevention disabled'));
        }

        await project.saveStatus({ status: 'idle' });
        await Registry.updateStatus(projectPath, 'idle');
        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      let currentMaxIterations: number;
      if (options.iterations) {
        currentMaxIterations = parseInt(options.iterations, 10);
        console.log(chalk.gray(`  Using specified iterations: ${currentMaxIterations}`));
      } else {
        currentMaxIterations = calculateLoopLimit(incompleteStories.length);
        console.log(chalk.gray(`  Auto-calculated iterations: ${currentMaxIterations} (${incompleteStories.length} tasks + 20% buffer)`));
      }

      const getMaxIterations = () => currentMaxIterations;

      // Create spec-aware PRD loader if using spec-partitioned state
      const loadPRD = specId
        ? () => loadPRDForSpec(projectPath, specId)
        : () => project.loadPRD();

      const loopResult = await runRalphLoop(project, {
        maxIterations: getMaxIterations,
        loadPRD,
        onTasksChanged: (newTaskCount) => {
          const newLimit = calculateLoopLimit(newTaskCount);
          if (newLimit > currentMaxIterations) {
            console.log(chalk.gray(`  Loop limit updated: ${currentMaxIterations} → ${newLimit} (${newTaskCount} tasks)`));
            currentMaxIterations = newLimit;
          }
        },
      });

      if (isPreventingSleep()) {
        allowSleep();
      }

      console.log('');
      if (loopResult.allComplete) {
        console.log(chalk.green(`Successfully completed all ${loopResult.finalPrd.userStories.length} stories!`));
      } else {
        const remaining = loopResult.finalPrd.userStories.filter((s) => !s.passes).length;
        console.log(
          chalk.yellow(`Completed ${loopResult.storiesCompleted} stories. ${remaining} remaining.`)
        );
      }
    } catch (error) {
      if (isPreventingSleep()) {
        allowSleep();
      }
      console.error(chalk.red('Error starting Ralph:'), error);
      process.exit(1);
    }
  });
