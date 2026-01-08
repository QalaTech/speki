import { Command } from 'commander';
import chalk from 'chalk';
import { Project, findProjectRoot } from '../../core/project.js';

export const statusCommand = new Command('status')
  .description('Show current project status')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('--json', 'Output as JSON')
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

      const config = await project.loadConfig();
      const status = await project.loadStatus();
      const decomposeState = await project.loadDecomposeState();
      const prd = await project.loadPRD();

      if (options.json) {
        console.log(
          JSON.stringify({ config, status, decomposeState, prd }, null, 2)
        );
        return;
      }

      console.log(chalk.bold(`Project: ${config.name}`));
      console.log(`  ${chalk.gray('Path:')} ${config.path}`);
      console.log(`  ${chalk.gray('Branch:')} ${config.branchName}`);
      console.log(`  ${chalk.gray('Language:')} ${config.language}`);
      console.log('');

      // Ralph status
      console.log(chalk.bold('Ralph Status:'));
      const statusColor =
        status.status === 'running'
          ? chalk.green
          : status.status === 'error'
            ? chalk.red
            : chalk.gray;
      console.log(`  ${chalk.gray('Status:')} ${statusColor(status.status)}`);
      if (status.currentIteration) {
        console.log(
          `  ${chalk.gray('Iteration:')} ${status.currentIteration}/${status.maxIterations || '?'}`
        );
      }
      if (status.currentStory) {
        console.log(`  ${chalk.gray('Current Story:')} ${status.currentStory}`);
      }
      console.log('');

      // Decompose status
      console.log(chalk.bold('Decompose Status:'));
      console.log(`  ${chalk.gray('Status:')} ${decomposeState.status}`);
      console.log(`  ${chalk.gray('Message:')} ${decomposeState.message}`);
      if (decomposeState.verdict) {
        const verdictColor =
          decomposeState.verdict === 'PASS' ? chalk.green : chalk.red;
        console.log(
          `  ${chalk.gray('Verdict:')} ${verdictColor(decomposeState.verdict)}`
        );
      }
      console.log('');

      // PRD summary
      if (prd) {
        console.log(chalk.bold('PRD Summary:'));
        const total = prd.userStories.length;
        const completed = prd.userStories.filter((s) => s.passes).length;
        console.log(
          `  ${chalk.gray('Stories:')} ${completed}/${total} completed`
        );
        console.log(`  ${chalk.gray('Project:')} ${prd.projectName}`);
      } else {
        console.log(chalk.gray('No PRD loaded.'));
      }
    } catch (error) {
      console.error(chalk.red('Error getting status:'), error);
      process.exit(1);
    }
  });
