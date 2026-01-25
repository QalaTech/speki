import { Command } from 'commander';
import chalk from 'chalk';
import { findProjectRoot } from '@speki/core';
import { IdRegistry } from '@speki/core';
import type { IdPrefix } from '@speki/core';

export const idsCommand = new Command('ids')
  .description('Manage global task ID registry');

// qala ids list
idsCommand
  .command('list')
  .description('Show all allocated IDs with their specs')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('--prefix <prefix>', 'Filter by prefix (US or TS)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();

      const prefix = options.prefix?.toUpperCase() as IdPrefix | undefined;
      if (prefix && prefix !== 'US' && prefix !== 'TS') {
        console.error(chalk.red('Error: Prefix must be US or TS'));
        process.exit(1);
      }

      const ids = await IdRegistry.listAllocatedIds(projectPath, prefix);

      if (options.json) {
        console.log(JSON.stringify(ids, null, 2));
        return;
      }

      if (ids.length === 0) {
        console.log(chalk.yellow('No IDs allocated yet.'));
        return;
      }

      console.log(chalk.bold(`Allocated IDs (${ids.length}):\n`));

      // Group by spec
      const bySpec = new Map<string, string[]>();
      for (const { id, specId } of ids) {
        const list = bySpec.get(specId) || [];
        list.push(id);
        bySpec.set(specId, list);
      }

      for (const [specId, specIds] of bySpec) {
        console.log(chalk.cyan(`  ${specId}:`));
        for (const id of specIds) {
          console.log(`    ${id}`);
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// qala ids next
idsCommand
  .command('next')
  .description('Show next available US and TS IDs')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();

      const nextUS = await IdRegistry.getNextId(projectPath, 'US');
      const nextTS = await IdRegistry.getNextId(projectPath, 'TS');

      if (options.json) {
        console.log(JSON.stringify({ US: nextUS, TS: nextTS }, null, 2));
        return;
      }

      console.log(chalk.bold('Next available IDs:'));
      console.log(`  ${chalk.cyan('US:')} ${nextUS}`);
      console.log(`  ${chalk.cyan('TS:')} ${nextTS}`);
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// qala ids check <id>
idsCommand
  .command('check <id>')
  .description('Check if an ID is allocated')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();

      const parsed = IdRegistry.parseId(id);
      if (!parsed) {
        console.error(chalk.red(`Invalid ID format: ${id}`));
        console.error(chalk.gray('Expected format: US-XXX or TS-XXX'));
        process.exit(1);
      }

      const isAllocated = await IdRegistry.isIdAllocated(projectPath, id);
      const owner = isAllocated ? await IdRegistry.getIdOwner(projectPath, id) : null;

      if (options.json) {
        console.log(JSON.stringify({ id, allocated: isAllocated, specId: owner }, null, 2));
        return;
      }

      if (isAllocated) {
        console.log(`${chalk.green('ALLOCATED')} ${id} -> ${chalk.cyan(owner)}`);
      } else {
        console.log(`${chalk.yellow('AVAILABLE')} ${id}`);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// qala ids rebuild
idsCommand
  .command('rebuild')
  .description('Rebuild registry from existing specs (migration tool)')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('--force', 'Force rebuild even if registry exists')
  .action(async (options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const registryPath = IdRegistry.getRegistryPath(projectPath);

      if (options.force) {
        // Delete existing registry to force rebuild
        const { rm } = await import('fs/promises');
        try {
          await rm(registryPath);
          console.log(chalk.yellow('Removed existing registry'));
        } catch {
          // File doesn't exist, that's fine
        }
      }

      // ensureExists will scan and rebuild
      await IdRegistry.ensureExists(projectPath);

      const registry = await IdRegistry.load(projectPath);
      const allocatedCount = Object.keys(registry.allocated).length;

      console.log(chalk.green('Registry rebuilt successfully'));
      console.log(`  ${chalk.cyan('US counter:')} ${registry.counters.US}`);
      console.log(`  ${chalk.cyan('TS counter:')} ${registry.counters.TS}`);
      console.log(`  ${chalk.cyan('IDs allocated:')} ${allocatedCount}`);
      console.log(`  ${chalk.cyan('Registry path:')} ${registryPath}`);
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });
