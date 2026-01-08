import { Command } from 'commander';
import { join } from 'path';
import { promises as fs } from 'fs';
import chalk from 'chalk';
import { Project, findProjectRoot } from '../../core/project.js';
import type { PRDData } from '../../types/index.js';

export const activateCommand = new Command('activate')
  .description('Activate a task draft file as the current prd.json')
  .argument('[draft-file]', 'Draft file name from tasks/ directory (or path)')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('-l, --list', 'List available draft files')
  .action(async (draftFile, options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(
          chalk.red('Error: No Qala project found. Run `qala init` first.')
        );
        process.exit(1);
      }

      // List mode
      if (options.list || !draftFile) {
        const tasks = await project.listTasks();
        if (tasks.length === 0) {
          console.log(chalk.gray('No draft files found in tasks/'));
          console.log('');
          console.log(`Run ${chalk.cyan('qala decompose <prd-file>')} to generate tasks.`);
          return;
        }

        console.log(chalk.bold('Available draft files:'));
        console.log('');
        for (const task of tasks) {
          const taskPath = join(project.tasksDir, task);
          try {
            const content = await fs.readFile(taskPath, 'utf-8');
            const prd = JSON.parse(content) as PRDData;
            const total = prd.userStories?.length || 0;
            const completed = prd.userStories?.filter(s => s.passes).length || 0;
            console.log(`  ${chalk.cyan(task)}`);
            console.log(`    ${prd.projectName || 'Unknown'} - ${total} stories (${completed} complete)`);
          } catch {
            console.log(`  ${chalk.cyan(task)} (invalid JSON)`);
          }
        }
        console.log('');
        console.log(`Run ${chalk.cyan('qala activate <filename>')} to activate a draft.`);
        return;
      }

      // Resolve draft file path
      let draftPath: string;
      if (draftFile.includes('/') || draftFile.includes('\\')) {
        // Absolute or relative path provided
        draftPath = draftFile;
      } else {
        // Just filename, look in tasks/
        draftPath = join(project.tasksDir, draftFile);
      }

      // Ensure .json extension
      if (!draftPath.endsWith('.json')) {
        draftPath += '.json';
      }

      // Read draft file
      let draftContent: string;
      try {
        draftContent = await fs.readFile(draftPath, 'utf-8');
      } catch {
        console.error(chalk.red(`Draft file not found: ${draftPath}`));
        console.log('');
        console.log(`Run ${chalk.cyan('qala activate --list')} to see available drafts.`);
        process.exit(1);
      }

      // Validate JSON
      let prd: PRDData;
      try {
        prd = JSON.parse(draftContent) as PRDData;
        if (!prd.userStories || !Array.isArray(prd.userStories)) {
          throw new Error('Missing userStories array');
        }
      } catch (e) {
        console.error(chalk.red(`Invalid draft file: ${e}`));
        process.exit(1);
      }

      // Check current prd.json
      const currentPrd = await project.loadPRD();
      if (currentPrd && currentPrd.userStories.some(s => s.passes)) {
        const completed = currentPrd.userStories.filter(s => s.passes).length;
        console.log(chalk.yellow(`Warning: Current prd.json has ${completed} completed stories.`));
        console.log(chalk.yellow('Activating a new draft will overwrite the current progress.'));
        console.log('');
      }

      // Copy to prd.json
      await project.savePRD(prd);

      console.log(chalk.green('Draft activated!'));
      console.log('');
      console.log(`  ${chalk.cyan('Project:')} ${prd.projectName}`);
      console.log(`  ${chalk.cyan('Branch:')} ${prd.branchName}`);
      console.log(`  ${chalk.cyan('Stories:')} ${prd.userStories.length}`);
      console.log('');
      console.log(`Run ${chalk.cyan('qala start')} to begin execution.`);
    } catch (error) {
      console.error(chalk.red('Error activating draft:'), error);
      process.exit(1);
    }
  });
