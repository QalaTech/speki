import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'path';
import { runSpecReview } from '../../core/spec-review/runner.js';
import { findProjectRoot } from '../../core/project.js';

function getVerdictColor(verdict: string): (text: string) => string {
  switch (verdict) {
    case 'PASS':
      return chalk.green;
    case 'FAIL':
      return chalk.red;
    case 'SPLIT_RECOMMENDED':
      return chalk.magenta;
    default:
      return chalk.yellow;
  }
}

function getSeverityColor(severity: string): (text: string) => string {
  switch (severity) {
    case 'critical':
      return chalk.red;
    case 'warning':
      return chalk.yellow;
    default:
      return chalk.gray;
  }
}

export const specCommand = new Command('spec')
  .description('Spec review and validation commands');

specCommand
  .command('review <spec-file>')
  .description('Review a specification file for quality and completeness')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds', parseInt)
  .action(async (specFile, options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const resolvedSpecFile = resolve(process.cwd(), specFile);

      console.log(chalk.blue(`Reviewing spec: ${resolvedSpecFile}`));

      const result = await runSpecReview(resolvedSpecFile, {
        cwd: projectPath,
        timeoutMs: options.timeout,
      });

      const verdictColor = getVerdictColor(result.verdict);
      console.log(`\nVerdict: ${verdictColor(result.verdict)}`);

      if (result.suggestions && result.suggestions.length > 0) {
        console.log(chalk.bold('\nSuggestions:'));
        for (const suggestion of result.suggestions) {
          const severityColor = getSeverityColor(suggestion.severity);
          console.log(`  ${severityColor(`[${suggestion.severity}]`)} ${suggestion.issue}`);
          console.log(`    ${chalk.gray(suggestion.suggestedFix)}`);
        }
      }

      if (result.logPath) {
        console.log(chalk.gray(`\nDetailed log: ${result.logPath}`));
      }

      if (result.verdict === 'FAIL') {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Error reviewing spec:'), error);
      process.exit(1);
    }
  });
