import { Command } from 'commander';
import chalk from 'chalk';
import { Registry } from '../../core/registry.js';
const STATUS_COLORS = {
    idle: chalk.gray,
    running: chalk.green,
    decomposing: chalk.blue,
    error: chalk.red,
};
const STATUS_ICONS = {
    idle: '-',
    running: '*',
    decomposing: '~',
    error: '!',
};
export const listCommand = new Command('list')
    .alias('ls')
    .description('List all registered Qala projects')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
    try {
        const projects = await Registry.list();
        if (options.json) {
            console.log(JSON.stringify(projects, null, 2));
            return;
        }
        if (projects.length === 0) {
            console.log(chalk.gray('No projects registered.'));
            console.log('');
            console.log(`Run ${chalk.cyan('qala init')} in a project directory to get started.`);
            return;
        }
        console.log(chalk.bold('Registered Projects:'));
        console.log('');
        // Calculate column widths
        const maxNameLen = Math.max(...projects.map((p) => p.name.length), 4);
        const maxPathLen = Math.max(...projects.map((p) => p.path.length), 4);
        // Header
        console.log(chalk.gray(`  ${'STATUS'.padEnd(12)} ${'NAME'.padEnd(maxNameLen)} ${'PATH'.padEnd(maxPathLen)} LAST ACTIVITY`));
        console.log(chalk.gray('  ' + '-'.repeat(12 + maxNameLen + maxPathLen + 30)));
        // Projects
        for (const project of projects) {
            const statusColor = STATUS_COLORS[project.status];
            const statusIcon = STATUS_ICONS[project.status];
            const statusText = `[${statusIcon}] ${project.status}`;
            const lastActivity = formatRelativeTime(new Date(project.lastActivity));
            console.log(`  ${statusColor(statusText.padEnd(12))} ${project.name.padEnd(maxNameLen)} ${chalk.gray(project.path.padEnd(maxPathLen))} ${chalk.gray(lastActivity)}`);
        }
        console.log('');
        console.log(chalk.gray(`${projects.length} project${projects.length !== 1 ? 's' : ''} registered`));
    }
    catch (error) {
        console.error(chalk.red('Error listing projects:'), error);
        process.exit(1);
    }
});
function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffSecs < 60)
        return 'just now';
    if (diffMins < 60)
        return `${diffMins}m ago`;
    if (diffHours < 24)
        return `${diffHours}h ago`;
    if (diffDays < 7)
        return `${diffDays}d ago`;
    return date.toLocaleDateString();
}
//# sourceMappingURL=list.js.map