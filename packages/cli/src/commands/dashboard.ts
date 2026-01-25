import { Command } from 'commander';
import chalk from 'chalk';
import { startServer } from '@speki/server';

export const dashboardCommand = new Command('dashboard')
  .description('Launch central web dashboard')
  .option('-p, --port <number>', 'Port number', '3005')
  .option('--host <host>', 'Host to bind to', 'localhost')
  .option('--no-open', 'Do not open browser automatically')
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const host = options.host;
    const url = `http://${host}:${port}`;

    console.log(chalk.blue('Starting Qala dashboard...'));
    console.log(`  ${chalk.cyan('URL:')} ${url}`);
    console.log('');

    try {
      await startServer({ port, host });

      // Open browser by default (use --no-open to disable)
      if (options.open !== false) {
        const { exec } = await import('child_process');

        // Cross-platform open command
        const platform = process.platform;
        const cmd =
          platform === 'darwin'
            ? `open "${url}"`
            : platform === 'win32'
            ? `start "" "${url}"`
            : `xdg-open "${url}"`;

        console.log(chalk.blue('Opening browser...'));
        exec(cmd, (err) => {
          if (err) {
            console.log(chalk.yellow(`Could not open browser automatically.`));
            console.log(chalk.yellow(`Please visit: ${url}`));
          }
        });
      } else {
        console.log(chalk.cyan(`Dashboard running at: ${url}`));
      }
    } catch (error) {
      console.error(chalk.red('Failed to start dashboard server:'));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
