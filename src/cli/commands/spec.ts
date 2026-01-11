import { existsSync, mkdirSync } from 'fs';
import { readdir, stat, writeFile } from 'fs/promises';
import { join, relative, resolve } from 'path';

import { editor, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';

import { checkCliAvailable } from '../../core/cli-path.js';
import { findProjectRoot } from '../../core/project.js';
import { runSpecReview } from '../../core/spec-review/runner.js';
import { executeSplit } from '../../core/spec-review/splitter.js';
import type { CliType, SpecReviewVerdict, SplitProposal, SpecReviewResult, TimeoutInfo } from '../../types/index.js';

/**
 * Returns the appropriate exit code for a spec review verdict.
 * Exit codes: 0 = PASS, 1 = FAIL/NEEDS_IMPROVEMENT/SPLIT_RECOMMENDED
 */
export function getExitCodeForVerdict(verdict: SpecReviewVerdict): number {
  return verdict === 'PASS' ? 0 : 1;
}

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

export type GodSpecAction = 'accept' | 'modify' | 'skip';

export interface HandleGodSpecResult {
  action: GodSpecAction;
  createdFiles?: string[];
  skipped?: boolean;
}

function displayGodSpecWarning(result: SpecReviewResult, specFile: string): void {
  const filename = specFile.split('/').pop() ?? specFile;
  console.log(chalk.bold.yellow(`\n⚠️  God Spec Detected: ${filename}`));

  const godSpecCategory = result.categories['god_spec_detection'];
  if (godSpecCategory?.issues && godSpecCategory.issues.length > 0) {
    console.log(chalk.bold('\nDetected Issues:'));
    for (const issue of godSpecCategory.issues) {
      console.log(`  ${chalk.yellow('•')} ${issue}`);
    }
  }

  if (result.splitProposal) {
    console.log(chalk.bold('\nRecommended Split:'));
    console.log(`  ${chalk.gray('Reason:')} ${result.splitProposal.reason}`);
    const totalStories = result.splitProposal.proposedSpecs.reduce(
      (sum, spec) => sum + spec.estimatedStories,
      0
    );
    console.log(`  ${chalk.gray('Total estimated stories:')} ${totalStories}`);
    console.log(chalk.bold('\nProposed Specs:'));
    for (const spec of result.splitProposal.proposedSpecs) {
      console.log(`  ${chalk.green('→')} ${spec.filename}`);
      console.log(`    ${chalk.gray(spec.description)}`);
      console.log(`    ${chalk.gray(`Est. stories: ${spec.estimatedStories}`)}`);
    }
  }
}

async function promptGodSpecAction(): Promise<GodSpecAction> {
  return select({
    message: 'How would you like to proceed?',
    choices: [
      {
        name: 'Accept - Split the spec into separate files',
        value: 'accept' as const,
      },
      {
        name: 'Modify - Edit the split proposal before creating files',
        value: 'modify' as const,
      },
      {
        name: 'Skip - Continue review without splitting',
        value: 'skip' as const,
      },
    ],
  });
}

async function editProposal(proposal: SplitProposal): Promise<SplitProposal> {
  const proposalYaml = formatProposalForEditing(proposal);

  const edited = await editor({
    message: 'Edit the split proposal (save and close to continue):',
    default: proposalYaml,
    postfix: '.yaml',
  });

  return parseEditedProposal(edited, proposal);
}

function formatProposalForEditing(proposal: SplitProposal): string {
  const specsYaml = proposal.proposedSpecs.map((spec) => {
    const sectionsYaml = spec.sections.map((section) => `      - "${section}"`).join('\n');
    return `  - filename: ${spec.filename}
    description: ${spec.description}
    estimatedStories: ${spec.estimatedStories}
    sections:
${sectionsYaml}`;
  }).join('\n\n');

  return `# Split Proposal for: ${proposal.originalFile}
# Reason: ${proposal.reason}
#
# Edit the proposed specs below. You can:
# - Change filenames
# - Edit descriptions
# - Remove specs you don't want
# - Modify sections to include
#
specs:
${specsYaml}
`;
}

function parseEditedProposal(edited: string, original: SplitProposal): SplitProposal {
  const specBlocks = edited.split(/(?=\s+-\s+filename:)/);
  const proposedSpecs: SplitProposal['proposedSpecs'] = [];

  for (const block of specBlocks) {
    const filenameMatch = block.match(/filename:\s*(.+)/);
    if (!filenameMatch) {
      continue;
    }

    const descriptionMatch = block.match(/description:\s*(.+)/);
    const storiesMatch = block.match(/estimatedStories:\s*(\d+)/);
    const sections = [...block.matchAll(/-\s*"([^"]+)"/g)].map((match) => match[1]);

    proposedSpecs.push({
      filename: filenameMatch[1].trim(),
      description: descriptionMatch?.[1]?.trim() ?? '',
      estimatedStories: storiesMatch ? parseInt(storiesMatch[1], 10) : 5,
      sections,
    });
  }

  if (proposedSpecs.length === 0) {
    console.log(chalk.yellow('Could not parse edited proposal. Using original.'));
    return original;
  }

  return {
    ...original,
    proposedSpecs,
  };
}

export async function handleGodSpec(
  result: SpecReviewResult,
  specFile: string
): Promise<HandleGodSpecResult> {
  displayGodSpecWarning(result, specFile);

  const action = await promptGodSpecAction();

  if (action === 'skip') {
    console.log(chalk.yellow('\nContinuing review without splitting. This spec may be too large for effective development.'));
    return { action: 'skip', skipped: true };
  }

  if (!result.splitProposal) {
    console.log(chalk.red('Error: No split proposal available.'));
    return { action: 'skip', skipped: true };
  }

  const proposal = action === 'modify'
    ? await editProposal(result.splitProposal)
    : result.splitProposal;

  if (action === 'modify') {
    console.log(chalk.blue('\nUsing modified proposal:'));
    for (const spec of proposal.proposedSpecs) {
      console.log(`  ${chalk.green('→')} ${spec.filename}`);
    }
  }

  const createdFiles = await executeSplit(specFile, proposal);
  console.log(chalk.green('\nSplit complete! Created files:'));
  for (const file of createdFiles) {
    console.log(`  ${chalk.green('→')} ${file}`);
  }

  return { action, createdFiles };
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

export function formatHumanOutput(result: SpecReviewResult, specFile: string): void {
  const filename = specFile.split('/').pop() ?? specFile;
  console.log(chalk.bold.blue(`\n═══ Spec Review: ${filename} ═══`));

  const verdictColor = getVerdictColor(result.verdict);
  console.log(`\n${chalk.bold('Verdict:')} ${verdictColor(result.verdict)}`);

  const categoryNames = Object.keys(result.categories);
  if (categoryNames.length > 0) {
    console.log(chalk.bold('\nCategories:'));
    for (const categoryName of categoryNames) {
      const category = result.categories[categoryName];
      const catVerdictColor = getVerdictColor(category.verdict);
      console.log(`  ${chalk.cyan(categoryName)}: ${catVerdictColor(category.verdict)}`);
      if (category.issues.length > 0) {
        for (const issue of category.issues) {
          console.log(`    ${chalk.gray('•')} ${issue}`);
        }
      }
    }
  }

  if (result.verdict === 'SPLIT_RECOMMENDED' && result.splitProposal) {
    console.log(chalk.bold.magenta('\n⚠ Split Recommended'));
    console.log(`  ${chalk.gray('Reason:')} ${result.splitProposal.reason}`);
    console.log(chalk.bold('\n  Proposed Specs:'));
    for (const spec of result.splitProposal.proposedSpecs) {
      console.log(`    ${chalk.green('→')} ${spec.filename}`);
      console.log(`      ${chalk.gray(spec.description)}`);
      console.log(`      ${chalk.gray(`Est. stories: ${spec.estimatedStories}`)}`);
    }
  }

  if (result.suggestions && result.suggestions.length > 0) {
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    const sortedSuggestions = [...result.suggestions].sort(
      (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
    );

    console.log(chalk.bold('\nSuggestions:'));
    for (const suggestion of sortedSuggestions) {
      const severityColor = getSeverityColor(suggestion.severity);
      console.log(`  ${severityColor(`[${suggestion.severity}]`)} ${suggestion.issue}`);
      console.log(`    ${chalk.gray(suggestion.suggestedFix)}`);
    }
  }

  if (result.logPath) {
    console.log(chalk.gray(`\nDetailed log: ${result.logPath}`));
  }
}

function formatTimeoutMs(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

export function displayTimeoutError(timeoutInfo: TimeoutInfo, specFile: string): void {
  const filename = specFile.split('/').pop() ?? specFile;
  const timeoutFormatted = formatTimeoutMs(timeoutInfo.timeoutMs);

  console.log(chalk.bold.red(`\n⏱  Review Timed Out: ${filename}`));
  console.log(chalk.red(`\nThe review exceeded the timeout of ${timeoutFormatted}.`));

  if (timeoutInfo.completedPrompts > 0) {
    console.log(chalk.bold('\nPartial Results Available:'));
    console.log(chalk.gray(`  Completed ${timeoutInfo.completedPrompts} of ${timeoutInfo.totalPrompts} review prompts:`));
    for (const promptName of timeoutInfo.completedPromptNames) {
      console.log(chalk.green(`    ✓ ${promptName}`));
    }
  } else {
    console.log(chalk.yellow('\nNo prompts completed before timeout.'));
  }

  console.log(chalk.bold('\nTo increase the timeout, use one of these options:'));
  console.log(chalk.cyan(`  --timeout <ms>                         CLI flag (e.g., --timeout 900000 for 15 minutes)`));
  console.log(chalk.cyan(`  RALPH_REVIEW_TIMEOUT_MS=<ms>           Environment variable`));
  console.log(chalk.gray(`\nCurrent timeout: ${timeoutInfo.timeoutMs}ms (${timeoutFormatted})`));
  console.log(chalk.gray(`Maximum allowed: 1800000ms (30 minutes)`));
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
          process.exit(2);
        }

        resolvedSpecFile = await showFilePicker(specFiles, projectPath);
      } else {
        resolvedSpecFile = resolve(process.cwd(), specFile);

        const validation = validateSpecFile(resolvedSpecFile);
        if (!validation.valid) {
          console.error(chalk.red(`Error: ${validation.error}`));
          process.exit(2);
        }
      }

      // Check CLI availability before running review
      const cli: CliType = options.cli ?? 'claude';
      const cliCheck = checkCliAvailable(cli);
      if (!cliCheck.available) {
        console.error(chalk.red(`Error: ${cliCheck.error}`));
        console.error(chalk.yellow(`\n${cliCheck.installInstructions}`));
        process.exit(2);
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
        cli,
        onProgress,
      });

      // Handle timeout case - exit 2 for errors
      if (result.timeoutInfo) {
        if (options.json) {
          console.log(formatJsonOutput(result));
        } else {
          displayTimeoutError(result.timeoutInfo, resolvedSpecFile);

          // Show partial results if any prompts completed
          if (result.timeoutInfo.completedPrompts > 0) {
            console.log(chalk.bold.yellow('\n═══ Partial Review Results ═══'));
            formatHumanOutput(result, resolvedSpecFile);
          }
        }
        process.exit(2);
      }

      if (options.json) {
        console.log(formatJsonOutput(result));
      } else if (result.verdict === 'SPLIT_RECOMMENDED' && result.splitProposal) {
        await handleGodSpec(result, resolvedSpecFile);
      } else {
        formatHumanOutput(result, resolvedSpecFile);
      }

      // Exit codes based on verdict:
      // 0 = PASS, 1 = FAIL/NEEDS_IMPROVEMENT/SPLIT_RECOMMENDED
      process.exit(getExitCodeForVerdict(result.verdict));
    } catch (error) {
      console.error(chalk.red('Error reviewing spec:'), error);
      process.exit(2);
    }
  });

/**
 * Generate a datetime prefix for spec filenames.
 * Format: YYYYMMDD-HHMMSS
 */
function generateDateTimePrefix(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Sanitize a name for use in a filename.
 * Replaces spaces with hyphens and removes invalid characters.
 */
function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface NewSpecResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export async function createNewSpec(name: string, projectPath: string): Promise<NewSpecResult> {
  const specsDir = join(projectPath, 'specs');

  // Ensure specs directory exists
  if (!existsSync(specsDir)) {
    mkdirSync(specsDir, { recursive: true });
  }

  const datePrefix = generateDateTimePrefix();
  const sanitizedName = sanitizeFileName(name);
  const fileName = `${datePrefix}-${sanitizedName}.md`;
  const filePath = join(specsDir, fileName);

  // Check if file already exists (unlikely with timestamp but check anyway)
  if (existsSync(filePath)) {
    return { success: false, error: `File already exists: ${filePath}` };
  }

  const defaultContent = `# ${name}

Let your imagination go wild.
`;

  try {
    await writeFile(filePath, defaultContent, 'utf-8');
    return { success: true, filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to create spec: ${message}` };
  }
}

specCommand
  .command('new <name>')
  .description('Create a new spec file with a datetime prefix')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .action(async (name: string, options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();

      console.log(chalk.blue(`Creating new spec: ${name}`));

      const result = await createNewSpec(name, projectPath);

      if (!result.success) {
        console.error(chalk.red(`Error: ${result.error}`));
        process.exit(1);
      }

      const relativePath = relative(projectPath, result.filePath!);
      console.log(chalk.green(`✓ Created: ${relativePath}`));
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Error creating spec:'), error);
      process.exit(2);
    }
  });
