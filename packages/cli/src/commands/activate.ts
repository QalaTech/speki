import { Command } from 'commander';
import chalk from 'chalk';

/**
 * @deprecated This command is deprecated. Tasks are now stored per-spec in .speki/specs/<specId>/tasks.json
 * Use `qala decompose <spec>` to generate tasks and `qala start` to run them.
 */
export const activateCommand = new Command('activate')
  .description('[DEPRECATED] Activate a task draft file (no longer needed)')
  .argument('[draft-file]', 'Draft file name (deprecated)')
  .option('-p, --project <path>', 'Project path (deprecated)')
  .option('-l, --list', 'List draft files (deprecated)')
  .action(async () => {
    console.log(chalk.yellow('╔════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.yellow('║  ⚠️  This command is deprecated                                 ║'));
    console.log(chalk.yellow('╠════════════════════════════════════════════════════════════════╣'));
    console.log(chalk.yellow('║  Tasks are now stored per-spec in:                             ║'));
    console.log(chalk.yellow('║    .speki/specs/<specId>/tasks.json                            ║'));
    console.log(chalk.yellow('║                                                                ║'));
    console.log(chalk.yellow('║  The `activate` command is no longer needed.                   ║'));
    console.log(chalk.yellow('║                                                                ║'));
    console.log(chalk.yellow('║  New workflow:                                                 ║'));
    console.log(chalk.yellow('║    1. qala decompose <spec-file>  - Generate tasks             ║'));
    console.log(chalk.yellow('║    2. qala start                  - Run tasks                  ║'));
    console.log(chalk.yellow('╚════════════════════════════════════════════════════════════════╝'));
    console.log('');
  });
