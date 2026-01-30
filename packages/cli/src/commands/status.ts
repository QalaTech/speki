import { Command } from 'commander';
import chalk from 'chalk';
import { Project, findProjectRoot } from '@speki/core';
import {
  listSpecs,
  readSpecMetadata,
  loadPRDForSpec,
} from '@speki/core';
import type { SpecMetadata, SpecStatus } from '@speki/core';

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
      const specs = await getSpecsInfo(projectPath);

      if (options.json) {
        console.log(
          JSON.stringify({ config, status, specs }, null, 2)
        );
        return;
      }

      console.log(chalk.bold(`Project: ${config?.name ?? 'Unknown'}`));
      console.log(`  ${chalk.gray('Path:')} ${config?.path ?? projectPath}`);
      console.log(`  ${chalk.gray('Branch:')} ${config?.branchName ?? 'N/A'}`);
      console.log(`  ${chalk.gray('Language:')} ${config?.language ?? 'N/A'}`);
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
