import { Command } from 'commander';
import chalk from 'chalk';
import { Project, findProjectRoot } from '@speki/core';
import { Registry } from '@speki/core';
import { runRalphLoop } from '@speki/core';
import { calculateLoopLimit } from '@speki/core';
import { isDefaultEngineAvailable } from '@speki/core';
import { preventSleep, allowSleep, isPreventingSleep } from '@speki/core';
import { loadGlobalSettings } from '@speki/core';
import {
  updateSpecStatus,
  loadPRDForSpec,
  getSpecLogsDir,
} from '@speki/core';
import { resolveSpecAndLoadPRD } from '../shared/spec-utils.js';
import type { PRDData } from '@speki/core';

/**
 * Resolves the spec ID and loads PRD from spec-partitioned location.
 * Falls back to legacy .speki/prd.json if no specs exist.
 *
 * @param projectPath - The project root path
 * @param project - The Project instance
 * @param specOption - Optional spec ID provided via --spec flag
 * @returns The PRD and spec ID (null if using legacy location)
 */
// Spec resolution DRY: pulled into ../shared/spec-utils

export const startCommand = new Command('start')
  .description('Start Ralph loop for current project')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('-s, --spec <spec-id>', 'Spec ID to run (prompts for selection if multiple specs exist)')
  .option('-i, --iterations <number>', 'Maximum iterations (default: auto-calculated based on task count)')
  .option('-k, --keep-awake', 'Prevent system sleep (default: from settings, use --no-keep-awake to disable)')
  .option('--no-keep-awake', 'Allow system to sleep while running')
  .option('--engine <name>', 'LLM engine name (overrides settings)')
  .option('--model <name>', 'LLM model name (overrides settings)')
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

      if (!(await isDefaultEngineAvailable())) {
        console.error(chalk.red('Error: No compatible LLM engine is available.'));
        console.error(chalk.gray('Configure or install an engine via ~/.qala/config.json or environment.'));
        process.exit(1);
      }

      // Resolve spec and load PRD
      const result = await resolveSpecAndLoadPRD(projectPath, options.spec);
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

      // Spec ID is required for per-spec state
      if (!specId) {
        console.error(chalk.red('Error: No spec ID available. Tasks must be associated with a spec.'));
        process.exit(1);
      }

      const logDir = getSpecLogsDir(projectPath, specId);

      const loopResult = await runRalphLoop(project, {
        maxIterations: getMaxIterations,
        specId,
        logDir,
        loadPRD: () => loadPRDForSpec(projectPath, specId),
        onTasksChanged: (newTaskCount) => {
          const newLimit = calculateLoopLimit(newTaskCount);
          if (newLimit > currentMaxIterations) {
            console.log(chalk.gray(`  Loop limit updated: ${currentMaxIterations} → ${newLimit} (${newTaskCount} tasks)`));
            currentMaxIterations = newLimit;
          }
        },
        engineName: options.engine,
        model: options.model,
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
