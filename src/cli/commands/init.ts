import { Command } from 'commander';
import { basename } from 'path';
import chalk from 'chalk';
import { Project } from '../../core/project.js';
import { Registry } from '../../core/registry.js';

export const initCommand = new Command('init')
  .description('Initialize a new Qala project in the current directory')
  .option('-n, --name <name>', 'Project name (defaults to directory name)')
  .option('-b, --branch <branch>', 'Default branch name', 'main')
  .option('-l, --language <language>', 'Primary language (nodejs, python, dotnet, go)', 'nodejs')
  .option('-f, --force', 'Overwrite existing .ralph directory')
  .action(async (options) => {
    const projectPath = process.cwd();
    const project = new Project(projectPath);

    // Check if already initialized
    if (await project.exists()) {
      if (!options.force) {
        console.error(
          chalk.red('Error: .ralph directory already exists. Use --force to overwrite.')
        );
        process.exit(1);
      }
      console.log(chalk.yellow('Warning: Overwriting existing .ralph directory...'));
    }

    // Determine project name
    const projectName = options.name || basename(projectPath);

    console.log(chalk.blue('Initializing Qala project...'));
    console.log(`  ${chalk.gray('Path:')} ${projectPath}`);
    console.log(`  ${chalk.gray('Name:')} ${projectName}`);
    console.log(`  ${chalk.gray('Branch:')} ${options.branch}`);
    console.log(`  ${chalk.gray('Language:')} ${options.language}`);

    try {
      // Initialize .ralph directory
      await project.initialize({
        name: projectName,
        branchName: options.branch,
        language: options.language,
      });

      // Register in central registry
      await Registry.register(projectPath, projectName);

      console.log('');
      console.log(chalk.green('Successfully initialized Qala project!'));
      console.log('');
      console.log('Created:');
      console.log(`  ${chalk.cyan('.ralph/')} - Project configuration directory`);
      console.log(`  ${chalk.cyan('.ralph/config.json')} - Project settings`);
      console.log(`  ${chalk.cyan('.ralph/prompt.md')} - Claude prompt template`);
      console.log(`  ${chalk.cyan('.ralph/standards/')} - Language standards`);
      console.log(`  ${chalk.cyan('.ralph/tasks/')} - Generated tasks`);
      console.log(`  ${chalk.cyan('.ralph/logs/')} - Execution logs`);
      console.log('');
      console.log('Next steps:');
      console.log(`  1. Create a PRD file describing your tasks`);
      console.log(`  2. Run ${chalk.cyan('qala decompose <prd-file>')} to generate tasks`);
      console.log(`  3. Run ${chalk.cyan('qala start')} to begin execution`);
      console.log('');
      console.log(`Run ${chalk.cyan('qala status')} to see project status.`);
    } catch (error) {
      console.error(chalk.red('Error initializing project:'), error);
      process.exit(1);
    }
  });
