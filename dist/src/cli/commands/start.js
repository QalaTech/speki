import { Command } from 'commander';
import chalk from 'chalk';
import { Project, findProjectRoot } from '../../core/project.js';
import { Registry } from '../../core/registry.js';
import { runRalphLoop } from '../../core/ralph-loop/runner.js';
import { isClaudeAvailable } from '../../core/claude/runner.js';
export const startCommand = new Command('start')
    .description('Start Ralph loop for current project')
    .option('-p, --project <path>', 'Project path (defaults to current directory)')
    .option('-i, --iterations <number>', 'Maximum iterations', '25')
    .option('--daemon', 'Run in background (not yet implemented)')
    .action(async (options) => {
    try {
        const projectPath = options.project || (await findProjectRoot()) || process.cwd();
        const project = new Project(projectPath);
        if (!(await project.exists())) {
            console.error(chalk.red('Error: No Qala project found. Run `qala init` first.'));
            process.exit(1);
        }
        // Check Claude CLI is available
        if (!(await isClaudeAvailable())) {
            console.error(chalk.red('Error: Claude CLI is not available.'));
            console.error(chalk.gray('Install it from: https://docs.anthropic.com/claude-code'));
            process.exit(1);
        }
        const prd = await project.loadPRD();
        if (!prd) {
            console.error(chalk.red('Error: No PRD loaded. Run `qala decompose <prd-file>` first.'));
            process.exit(1);
        }
        const incompleteStories = prd.userStories.filter((s) => !s.passes);
        if (incompleteStories.length === 0) {
            console.log(chalk.green('All stories are complete!'));
            return;
        }
        if (options.daemon) {
            console.log(chalk.yellow('Daemon mode not yet implemented. Running in foreground.'));
        }
        // Handle graceful shutdown
        let stopping = false;
        const cleanup = async () => {
            if (stopping)
                return;
            stopping = true;
            console.log('');
            console.log(chalk.yellow('Stopping Ralph loop...'));
            await project.saveStatus({ status: 'idle' });
            await Registry.updateStatus(projectPath, 'idle');
            process.exit(0);
        };
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        // Run the loop
        const maxIterations = parseInt(options.iterations, 10);
        const result = await runRalphLoop(project, { maxIterations });
        // Summary
        console.log('');
        if (result.allComplete) {
            console.log(chalk.green(`Successfully completed all ${result.finalPrd.userStories.length} stories!`));
        }
        else {
            const remaining = result.finalPrd.userStories.filter((s) => !s.passes).length;
            console.log(chalk.yellow(`Completed ${result.storiesCompleted} stories. ${remaining} remaining.`));
        }
    }
    catch (error) {
        console.error(chalk.red('Error starting Ralph:'), error);
        process.exit(1);
    }
});
//# sourceMappingURL=start.js.map