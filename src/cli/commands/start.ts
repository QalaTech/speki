import { Command } from 'commander';
import chalk from 'chalk';
import { Project, findProjectRoot } from '../../core/project.js';
import { Registry } from '../../core/registry.js';
import { runRalphLoop } from '../../core/ralph-loop/runner.js';
import { calculateLoopLimit } from '../../core/ralph-loop/loop-limit.js';
import { isClaudeAvailable } from '../../core/claude/runner.js';
import { preventSleep, allowSleep, isPreventingSleep } from '../../core/keep-awake.js';
import { loadGlobalSettings } from '../../core/settings.js';

export const startCommand = new Command('start')
  .description('Start Ralph loop for current project')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
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

      const prd = await project.loadPRD();

      if (!prd) {
        console.error(
          chalk.red('Error: No PRD loaded. Run `qala decompose <prd-file>` first.')
        );
        process.exit(1);
      }

      const incompleteStories = prd.userStories.filter((s) => !s.passes);
      if (incompleteStories.length === 0) {
        console.log(chalk.green('All stories are complete!'));
        return;
      }

      if (options.daemon) {
        console.log(
          chalk.yellow('Daemon mode not yet implemented. Running in foreground.')
        );
      }

      const settings = await loadGlobalSettings();
      const shouldKeepAwake = options.keepAwake !== undefined
        ? options.keepAwake
        : settings.execution.keepAwake;

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

      const result = await runRalphLoop(project, {
        maxIterations: getMaxIterations,
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
      if (result.allComplete) {
        console.log(chalk.green(`Successfully completed all ${result.finalPrd.userStories.length} stories!`));
      } else {
        const remaining = result.finalPrd.userStories.filter((s) => !s.passes).length;
        console.log(
          chalk.yellow(`Completed ${result.storiesCompleted} stories. ${remaining} remaining.`)
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
