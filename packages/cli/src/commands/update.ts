import chalk from 'chalk';
import { Command } from 'commander';
import { Project, findProjectRoot } from '@speki/core';
import { Registry } from '@speki/core';

/**
 * Update a single project's templates
 */
async function updateSingleProject(projectPath: string, dryRun: boolean): Promise<{ path: string; updated: string[]; error?: string }> {
  const project = new Project(projectPath);

  if (!(await project.exists())) {
    return { path: projectPath, updated: [], error: 'No Qala project found (.speki/ missing)' };
  }

  if (dryRun) {
    return {
      path: projectPath,
      updated: ['prompt.md', 'decompose-prompt.md', 'standards/*.md', 'skills/*.md'],
    };
  }

  try {
    const updated = await project.updateTemplates();
    return { path: projectPath, updated };
  } catch (error) {
    return {
      path: projectPath,
      updated: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export const updateCommand = new Command('update')
  .description('Update template files from the latest qala version (prompt.md, standards, etc.)')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('-a, --all', 'Update all registered projects')
  .option('--dry-run', 'Show what would be updated without making changes')
  .action(async (options) => {
    try {
      // Global update - all registered projects
      if (options.all) {
        const projects = await Registry.list();

        if (projects.length === 0) {
          console.log(chalk.yellow('No registered projects found.'));
          console.log(chalk.gray('Register projects with: qala init'));
          return;
        }

        console.log(chalk.blue(`Updating ${projects.length} registered project(s)...`));
        console.log('');

        if (options.dryRun) {
          console.log(chalk.yellow('Dry run - no changes will be made'));
          console.log('');
        }

        let successCount = 0;
        let errorCount = 0;

        for (const entry of projects) {
          console.log(chalk.cyan(`→ ${entry.name}`));
          console.log(chalk.gray(`  ${entry.path}`));

          const result = await updateSingleProject(entry.path, options.dryRun);

          if (result.error) {
            console.log(chalk.red(`  ✗ ${result.error}`));
            errorCount++;
          } else if (result.updated.length === 0) {
            console.log(chalk.yellow('  No template files found to update.'));
          } else {
            for (const file of result.updated) {
              console.log(chalk.green(`  ✓ .speki/${file}`));
            }
            successCount++;
          }
          console.log('');
        }

        // Summary
        console.log(chalk.blue('─'.repeat(40)));
        console.log(chalk.green(`✓ ${successCount} project(s) updated`));
        if (errorCount > 0) {
          console.log(chalk.red(`✗ ${errorCount} project(s) failed`));
        }

        if (options.dryRun) {
          console.log('');
          console.log(chalk.gray('Run without --dry-run to apply changes.'));
        }

        return;
      }

      // Single project update (original behavior)
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
        console.log(`  ${chalk.cyan('.speki/prompt.md')}`);
        console.log(`  ${chalk.cyan('.speki/decompose-prompt.md')}`);
        console.log(`  ${chalk.cyan('.speki/standards/*.md')}`);
        console.log(`  ${chalk.cyan('.speki/skills/*.md')} (if present)`);
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
        console.log(`  ${chalk.cyan(`.speki/${file}`)}`);
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
