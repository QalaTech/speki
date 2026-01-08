import { Command } from 'commander';
import chalk from 'chalk';
import { findProjectRoot } from '../../core/project.js';
import { Registry } from '../../core/registry.js';
export const unregisterCommand = new Command('unregister')
    .description('Remove project from central registry')
    .option('-p, --project <path>', 'Project path (defaults to current directory)')
    .option('-f, --force', 'Force unregister even if running')
    .action(async (options) => {
    try {
        const projectPath = options.project || (await findProjectRoot()) || process.cwd();
        const entry = await Registry.get(projectPath);
        if (!entry) {
            console.log(chalk.gray('Project is not registered.'));
            return;
        }
        if (entry.status === 'running' && !options.force) {
            console.error(chalk.red('Error: Project is currently running. Use --force to unregister anyway.'));
            process.exit(1);
        }
        const removed = await Registry.unregister(projectPath);
        if (removed) {
            console.log(chalk.green(`Unregistered: ${entry.name}`));
            console.log(chalk.gray(`Path: ${projectPath}`));
            console.log('');
            console.log(chalk.gray('Note: The .ralph directory has not been deleted. Remove it manually if needed.'));
        }
        else {
            console.log(chalk.gray('Project was not registered.'));
        }
    }
    catch (error) {
        console.error(chalk.red('Error unregistering project:'), error);
        process.exit(1);
    }
});
//# sourceMappingURL=unregister.js.map