import { Command } from 'commander';
import chalk from 'chalk';
import { Project, findProjectRoot } from '@speki/core';
import { Registry } from '@speki/core';

export const stopCommand = new Command('stop')
  .description('Stop running Ralph for current project')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .action(async (options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(
          chalk.red('Error: No Qala project found.')
        );
        process.exit(1);
      }

      const entry = await Registry.get(projectPath);
      if (!entry || entry.status !== 'running') {
        console.log(chalk.gray('Ralph is not running for this project.'));
        return;
      }

      if (entry.pid) {
        console.log(chalk.blue(`Stopping Ralph (PID: ${entry.pid})...`));
        try {
          process.kill(entry.pid, 'SIGTERM');
          console.log(chalk.green('Sent stop signal.'));
        } catch (err) {
          console.log(chalk.yellow('Process may have already stopped.'));
        }
      }

      // Update registry status
      await Registry.updateStatus(projectPath, 'idle');

      // Update project status
      await project.saveStatus({ status: 'idle' });

      console.log(chalk.green('Ralph stopped.'));
    } catch (error) {
      console.error(chalk.red('Error stopping Ralph:'), error);
      process.exit(1);
    }
  });
