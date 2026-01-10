import { existsSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join, relative, resolve } from 'path';

import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';

import { findProjectRoot } from '../../core/project.js';
import { runSpecReview } from '../../core/spec-review/runner.js';
import type { CliType, SpecReviewResult } from '../../types/index.js';

export interface SpecFileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateSpecFile(filePath: string): SpecFileValidationResult {
  if (!existsSync(filePath)) {
    return { valid: false, error: `File not found: ${filePath}` };
  }

  if (!filePath.endsWith('.md')) {
    return { valid: false, error: `File must be a markdown file (.md): ${filePath}` };
  }

  return { valid: true };
}

const SPEC_SEARCH_DIRECTORIES = ['specs', 'docs', '.ralph/specs', '.'];

export async function findSpecFiles(baseDir: string): Promise<string[]> {
  const results: string[] = [];

  for (const dir of SPEC_SEARCH_DIRECTORIES) {
    const fullPath = join(baseDir, dir);
    const dirStat = existsSync(fullPath) ? await stat(fullPath) : null;

    if (!dirStat?.isDirectory()) {
      continue;
    }

    const entries = await readdir(fullPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(join(fullPath, entry.name));
      }
    }
  }

  return results;
}

async function showFilePicker(specFiles: string[], baseDir: string): Promise<string> {
  const choices = specFiles.map((filePath) => {
    const relativePath = relative(baseDir, filePath);
    return {
      name: relativePath,
      value: filePath,
    };
  });

  return select({
    message: 'Select a spec file to review:',
    choices,
  });
}

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

export function validateCliOption(value: string): CliType {
  if (value !== 'claude' && value !== 'codex') {
    throw new Error(`Invalid CLI option: ${value}. Must be 'claude' or 'codex'.`);
  }
  return value;
}

export function formatJsonOutput(result: SpecReviewResult): string {
  return JSON.stringify(result, null, 2);
}

export function formatHumanOutput(result: SpecReviewResult): void {
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
}

specCommand
  .command('review [spec-file]')
  .description('Review a specification file for quality and completeness')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds', parseInt)
  .option('-c, --cli <cli>', 'CLI to use (claude or codex)', validateCliOption)
  .option('-v, --verbose', 'Show detailed progress output')
  .option('-j, --json', 'Output machine-readable JSON')
  .action(async (specFile: string | undefined, options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      let resolvedSpecFile: string;

      if (!specFile) {
        const specFiles = await findSpecFiles(projectPath);
        if (specFiles.length === 0) {
          console.error(chalk.red('No markdown files found in specs/, docs/, .ralph/specs/, or current directory'));
          process.exit(1);
        }

        resolvedSpecFile = await showFilePicker(specFiles, projectPath);
      } else {
        resolvedSpecFile = resolve(process.cwd(), specFile);

        const validation = validateSpecFile(resolvedSpecFile);
        if (!validation.valid) {
          console.error(chalk.red(`Error: ${validation.error}`));
          process.exit(1);
        }
      }

      if (!options.json) {
        console.log(chalk.blue(`Reviewing spec: ${resolvedSpecFile}`));
      }

      const onProgress = options.verbose && !options.json
        ? (message: string) => console.log(chalk.gray(`  ${message}`))
        : undefined;

      const result = await runSpecReview(resolvedSpecFile, {
        cwd: projectPath,
        timeoutMs: options.timeout,
        cli: options.cli,
        onProgress,
      });

      if (options.json) {
        console.log(formatJsonOutput(result));
      } else {
        formatHumanOutput(result);
      }

      if (result.verdict === 'FAIL') {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Error reviewing spec:'), error);
      process.exit(1);
    }
  });
