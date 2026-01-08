import { Command } from 'commander';
import { resolve } from 'path';
import chalk from 'chalk';
import { Project, findProjectRoot } from '../../core/project.js';
import { Registry } from '../../core/registry.js';
import { runDecompose } from '../../core/decompose/runner.js';
export const decomposeCommand = new Command('decompose')
    .description('Decompose a PRD file into tasks')
    .argument('<prd-file>', 'Path to the PRD markdown file')
    .option('-p, --project <path>', 'Project path (defaults to current directory)')
    .option('-b, --branch <name>', 'Branch name for the feature', 'main')
    .option('-l, --language <lang>', 'Language type (dotnet, python, nodejs, go)')
    .option('-o, --output <name>', 'Output filename (defaults to PRD filename + .json)')
    .option('-f, --fresh', 'Start from US-001 (ignore existing numbering)')
    .option('-r, --redecompose', 'Force re-decomposition even if draft exists')
    .option('--review', 'Enable peer review (experimental)')
    .action(async (prdFile, options) => {
    try {
        const projectPath = options.project || (await findProjectRoot()) || process.cwd();
        const project = new Project(projectPath);
        if (!(await project.exists())) {
            console.error(chalk.red('Error: No Qala project found. Run `qala init` first.'));
            process.exit(1);
        }
        const config = await project.loadConfig();
        // Resolve PRD file path
        const resolvedPrdFile = resolve(process.cwd(), prdFile);
        // Update registry status
        await Registry.updateStatus(projectPath, 'decomposing');
        try {
            const result = await runDecompose(project, {
                prdFile: resolvedPrdFile,
                branchName: options.branch,
                language: options.language || config.language,
                outputName: options.output,
                freshStart: options.fresh,
                forceRedecompose: options.redecompose,
                enablePeerReview: options.review,
            });
            if (!result.success) {
                console.error(chalk.red(`Decomposition failed: ${result.error}`));
                process.exit(1);
            }
        }
        finally {
            // Reset registry status
            await Registry.updateStatus(projectPath, 'idle');
        }
    }
    catch (error) {
        console.error(chalk.red('Error decomposing PRD:'), error);
        process.exit(1);
    }
});
//# sourceMappingURL=decompose.js.map