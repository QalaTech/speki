import chalk from 'chalk';
import { Command } from 'commander';
import { Project, findProjectRoot } from '../../core/project.js';

export const updateCommand = new Command('update')
  .description('Update template files from the latest qala version (prompt.md, standards, etc.)')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('--dry-run', 'Show what would be updated without making changes')
  .action(async (options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(chalk.red('Error: No Qala project found. Run `qala init` first.'));
        process.exit(1);
      }

      console.log(chalk.blue('Updating template files...'));
      console.log(`  ${chalk.gray('Project:')} ${projectPath}`);
      console.log('');

      if (options.dryRun) {
        console.log(chalk.yellow('Dry run - no changes will be made'));
        console.log('');
        console.log('Would update:');
        console.log(`  ${chalk.cyan('.ralph/prompt.md')}`);
        console.log(`  ${chalk.cyan('.ralph/decompose-prompt.md')}`);
        console.log(`  ${chalk.cyan('.ralph/standards/*.md')}`);
        console.log(`  ${chalk.cyan('.ralph/skills/*.md')} (if present)`);
        console.log('');
        console.log(chalk.gray('Run without --dry-run to apply changes.'));
        return;
      }

      const updated = await project.updateTemplates();

      if (updated.length === 0) {
        console.log(chalk.yellow('No template files found to update.'));
        return;
      }

      console.log(chalk.green('Updated files:'));
      for (const file of updated) {
        console.log(`  ${chalk.cyan(`.ralph/${file}`)}`);
      }

      console.log('');
      console.log(chalk.green(`Successfully updated ${updated.length} template file(s)!`));
      console.log('');
      console.log(chalk.gray('Note: Project-specific files were preserved:'));
      console.log(chalk.gray('  config.json, prd.json, progress.txt, peer_feedback.json, logs/, tasks/'));
    } catch (error) {
      console.error(chalk.red('Error updating templates:'), error);
      process.exit(1);
    }
  });
