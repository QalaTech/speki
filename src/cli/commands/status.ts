import { Command } from 'commander';
import chalk from 'chalk';
import { Project, findProjectRoot } from '../../core/project.js';
import {
  listSpecs,
  readSpecMetadata,
  loadPRDForSpec,
} from '../../core/spec-review/spec-metadata.js';
import type { SpecMetadata, SpecStatus } from '../../types/index.js';

const STATUS_COLORS: Record<SpecStatus, (text: string) => string> = {
  draft: chalk.gray,
  reviewed: chalk.blue,
  decomposed: chalk.cyan,
  active: chalk.green,
  completed: chalk.magenta,
};

function formatSpecStatus(status: SpecStatus): string {
  const colorFn = STATUS_COLORS[status] ?? chalk.white;
  return colorFn(status);
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case 'running':
      return chalk.green;
    case 'error':
      return chalk.red;
    default:
      return chalk.gray;
  }
}

export interface SpecInfo {
  id: string;
  metadata: SpecMetadata;
  taskProgress?: { completed: number; total: number };
}

export async function getSpecsInfo(projectPath: string): Promise<SpecInfo[]> {
  const specIds = await listSpecs(projectPath);
  const specs: SpecInfo[] = [];

  for (const specId of specIds) {
    const metadata = await readSpecMetadata(projectPath, specId);
    if (!metadata) continue;

    const specInfo: SpecInfo = { id: specId, metadata };

    if (metadata.status === 'decomposed' || metadata.status === 'active' || metadata.status === 'completed') {
      const prd = await loadPRDForSpec(projectPath, specId);
      if (prd) {
        const total = prd.userStories.length;
        const completed = prd.userStories.filter((s) => s.passes).length;
        specInfo.taskProgress = { completed, total };
      }
    }

    specs.push(specInfo);
  }

  return specs;
}

export const statusCommand = new Command('status')
  .description('Show current project status')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(
          chalk.red('Error: No Qala project found. Run `qala init` first.')
        );
        process.exit(1);
      }

      const config = await project.loadConfig();
      const status = await project.loadStatus();
      const decomposeState = await project.loadDecomposeState();
      const prd = await project.loadPRD();
      const specs = await getSpecsInfo(projectPath);

      if (options.json) {
        console.log(
          JSON.stringify({ config, status, decomposeState, prd, specs }, null, 2)
        );
        return;
      }

      console.log(chalk.bold(`Project: ${config.name}`));
      console.log(`  ${chalk.gray('Path:')} ${config.path}`);
      console.log(`  ${chalk.gray('Branch:')} ${config.branchName}`);
      console.log(`  ${chalk.gray('Language:')} ${config.language}`);
      console.log('');

      // Ralph status
      console.log(chalk.bold('Ralph Status:'));
      const statusColor = getStatusColor(status.status);
      console.log(`  ${chalk.gray('Status:')} ${statusColor(status.status)}`);
      if (status.currentIteration) {
        console.log(
          `  ${chalk.gray('Iteration:')} ${status.currentIteration}/${status.maxIterations || '?'}`
        );
      }
      if (status.currentStory) {
        console.log(`  ${chalk.gray('Current Story:')} ${status.currentStory}`);
      }
      console.log('');

      // Decompose status
      console.log(chalk.bold('Decompose Status:'));
      console.log(`  ${chalk.gray('Status:')} ${decomposeState.status}`);
      console.log(`  ${chalk.gray('Message:')} ${decomposeState.message}`);
      if (decomposeState.verdict) {
        const verdictColor =
          decomposeState.verdict === 'PASS' ? chalk.green : chalk.red;
        console.log(
          `  ${chalk.gray('Verdict:')} ${verdictColor(decomposeState.verdict)}`
        );
      }
      console.log('');

      // PRD summary
      if (prd) {
        console.log(chalk.bold('PRD Summary:'));
        const total = prd.userStories.length;
        const completed = prd.userStories.filter((s) => s.passes).length;
        console.log(
          `  ${chalk.gray('Stories:')} ${completed}/${total} completed`
        );
        console.log(`  ${chalk.gray('Project:')} ${prd.projectName}`);
      } else {
        console.log(chalk.gray('No PRD loaded.'));
      }
      console.log('');

      // Specs status
      console.log(chalk.bold('Specs:'));
      if (specs.length === 0) {
        console.log(chalk.gray('  No specs found.'));
      } else {
        for (const spec of specs) {
          const isActive = spec.metadata.status === 'active';
          const prefix = isActive ? chalk.yellow('▶ ') : '  ';
          const statusStr = formatSpecStatus(spec.metadata.status);
          const modified = formatDate(spec.metadata.lastModified);

          let progressStr = '';
          if (spec.taskProgress) {
            const { completed: done, total: all } = spec.taskProgress;
            progressStr = chalk.gray(` (${done}/${all} tasks)`);
          }

          console.log(`${prefix}${spec.id}: ${statusStr}${progressStr}`);
          console.log(`    ${chalk.gray('Modified:')} ${modified}`);
        }
      }
    } catch (error) {
      console.error(chalk.red('Error getting status:'), error);
      process.exit(1);
    }
  });
