import { Command } from 'commander';
import chalk from 'chalk';
import { runTui } from '../../tui/index.js';

export const tuiCommand = new Command('tui')
  .description('Launch the interactive Qala TUI')
  .action(async () => {
    try {
      await runTui();
    } catch (err) {
      console.error(chalk.red('Failed to start TUI:'), err);
      process.exit(1);
    }
  });

