/**
 * Ralph Loop Runner
 *
 * Orchestrates the iterative development process:
 * 1. Read PRD and find next incomplete story
 * 2. Run Claude with the prompt
 * 3. Check for completion
 * 4. Repeat until done or max iterations reached
 */
import chalk from 'chalk';
import { Registry } from '../registry.js';
import { runClaude, isClaudeAvailable } from '../claude/runner.js';
import { createConsoleCallbacks } from '../claude/stream-parser.js';
/**
 * Get the next story to work on (highest priority incomplete with satisfied dependencies)
 */
function getNextStory(prd) {
    const completedIds = new Set(prd.userStories.filter((s) => s.passes).map((s) => s.id));
    const incomplete = prd.userStories.filter((s) => !s.passes);
    if (incomplete.length === 0) {
        return { story: null, status: 'complete' };
    }
    // Check which stories have all dependencies satisfied
    const ready = incomplete.filter((s) => (s.dependencies || []).every((dep) => completedIds.has(dep)));
    if (ready.length === 0) {
        // All remaining stories are blocked
        const blocked = incomplete[0];
        const blockedBy = (blocked.dependencies || []).filter((dep) => !completedIds.has(dep));
        return { story: blocked, status: 'blocked', blockedBy };
    }
    // Sort by priority and return highest priority ready story
    ready.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    return { story: ready[0], status: 'ready' };
}
/**
 * Print iteration header
 */
function printIterationHeader(iteration, maxIterations, prd, nextInfo) {
    const total = prd.userStories.length;
    const completed = prd.userStories.filter((s) => s.passes).length;
    const completedIds = new Set(prd.userStories.filter((s) => s.passes).map((s) => s.id));
    const incomplete = prd.userStories.filter((s) => !s.passes);
    const readyCount = incomplete.filter((s) => (s.dependencies || []).every((dep) => completedIds.has(dep))).length;
    const blockedCount = incomplete.length - readyCount;
    console.log('');
    console.log(chalk.bold('┌─────────────────────────────────────────────────────────────────┐'));
    console.log(chalk.bold('│') +
        `  ${chalk.blue(`Iteration ${iteration} / ${maxIterations}`)}` +
        ' '.repeat(Math.max(0, 47 - `Iteration ${iteration} / ${maxIterations}`.length)) +
        chalk.bold('│'));
    console.log(chalk.bold('│') +
        `  Progress: ${chalk.green(String(completed))}/${total} complete (${chalk.green(String(readyCount))} ready, ${chalk.yellow(String(blockedCount))} blocked)` +
        ' '.repeat(Math.max(0, 30)) +
        chalk.bold('│'));
    console.log(chalk.bold('├─────────────────────────────────────────────────────────────────┤'));
    if (nextInfo.status === 'blocked' && nextInfo.story) {
        console.log(chalk.bold('│') +
            `  ${chalk.red('⏸ Blocked:')} ${nextInfo.story.id}: ${nextInfo.story.title}`);
        console.log(chalk.bold('│') +
            `  ${chalk.yellow(`Waiting on: ${nextInfo.blockedBy?.join(', ')}`)}`);
    }
    else if (nextInfo.story) {
        console.log(chalk.bold('│') +
            `  ${chalk.cyan('▶ Next:')} ${nextInfo.story.id}: ${nextInfo.story.title}`);
    }
    console.log(chalk.bold('└─────────────────────────────────────────────────────────────────┘'));
    console.log('');
}
/**
 * Run the Ralph loop
 */
export async function runRalphLoop(project, options) {
    const { maxIterations, onIterationStart, onIterationEnd } = options;
    // Check Claude is available
    if (!(await isClaudeAvailable())) {
        throw new Error('Claude CLI is not available. Please install it first.');
    }
    // Load initial PRD
    let prd = await project.loadPRD();
    if (!prd) {
        throw new Error('No PRD loaded. Run `qala decompose <prd-file>` first.');
    }
    const initialCompleted = prd.userStories.filter((s) => s.passes).length;
    let storiesCompleted = 0;
    // Print header
    console.log('');
    console.log(chalk.bold('╔═══════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold('║') + `  ${chalk.cyan('Ralph Loop')} - Structured Task Runner                        ` + chalk.bold('║'));
    console.log(chalk.bold('╠═══════════════════════════════════════════════════════════════╣'));
    console.log(chalk.bold('║') + `  Project: ${chalk.cyan(prd.projectName)}`);
    console.log(chalk.bold('║') + `  Branch:  ${chalk.yellow(prd.branchName)}`);
    console.log(chalk.bold('║') + `  Stories: ${chalk.green(String(prd.userStories.length))} total`);
    console.log(chalk.bold('║') + `  Max iterations: ${maxIterations}`);
    console.log(chalk.bold('╚═══════════════════════════════════════════════════════════════╝'));
    console.log('');
    // Update status
    await project.saveStatus({
        status: 'running',
        currentIteration: 0,
        maxIterations,
        startedAt: new Date().toISOString(),
        pid: process.pid,
    });
    await Registry.updateStatus(project.projectPath, 'running', process.pid);
    try {
        for (let iteration = 1; iteration <= maxIterations; iteration++) {
            // Check for next story
            const nextInfo = getNextStory(prd);
            printIterationHeader(iteration, maxIterations, prd, nextInfo);
            onIterationStart?.(iteration, nextInfo.story);
            // Update status
            await project.saveStatus({
                status: 'running',
                currentIteration: iteration,
                maxIterations,
                currentStory: nextInfo.story ? `${nextInfo.story.id}: ${nextInfo.story.title}` : undefined,
                startedAt: new Date().toISOString(),
                pid: process.pid,
            });
            if (nextInfo.status === 'complete') {
                console.log(chalk.green('All stories already complete!'));
                return {
                    allComplete: true,
                    iterationsRun: iteration - 1,
                    storiesCompleted,
                    finalPrd: prd,
                };
            }
            if (nextInfo.status === 'blocked') {
                console.log(chalk.red('╔═══════════════════════════════════════════════════════════════╗'));
                console.log(chalk.red('║  ⛔ All remaining stories are blocked by dependencies         ║'));
                console.log(chalk.red('║  Check prd.json for circular or unmet dependencies            ║'));
                console.log(chalk.red('╚═══════════════════════════════════════════════════════════════╝'));
                return {
                    allComplete: false,
                    iterationsRun: iteration - 1,
                    storiesCompleted,
                    finalPrd: prd,
                };
            }
            console.log(chalk.yellow('Starting Claude...'));
            console.log('');
            // Use console callbacks - progress.txt is managed by Claude per prompt instructions
            const callbacks = createConsoleCallbacks();
            // Run Claude
            const result = await runClaude({
                promptPath: project.promptPath,
                cwd: project.projectPath,
                logDir: project.logsDir,
                iteration,
                callbacks,
            });
            console.log('');
            console.log(`  ${chalk.cyan('JSONL saved:')} ${result.jsonlPath}`);
            console.log(`  ${chalk.cyan('Duration:')} ${Math.round(result.durationMs / 1000)}s`);
            // Check for completion
            if (result.isComplete) {
                console.log('');
                console.log(chalk.green('╔═══════════════════════════════════════════════════════════════╗'));
                console.log(chalk.green('║  ✅ All stories complete!                                      ║'));
                console.log(chalk.green(`║  Finished at iteration ${iteration}                                       ║`));
                console.log(chalk.green('╚═══════════════════════════════════════════════════════════════╝'));
                // Reload PRD to get final state
                prd = (await project.loadPRD()) || prd;
                storiesCompleted = prd.userStories.filter((s) => s.passes).length - initialCompleted;
                onIterationEnd?.(iteration, true, true);
                return {
                    allComplete: true,
                    iterationsRun: iteration,
                    storiesCompleted,
                    finalPrd: prd,
                };
            }
            // Reload PRD to check progress
            const newPrd = await project.loadPRD();
            if (newPrd) {
                const oldCompleted = prd.userStories.filter((s) => s.passes).length;
                const newCompleted = newPrd.userStories.filter((s) => s.passes).length;
                prd = newPrd;
                if (newCompleted > oldCompleted) {
                    console.log(chalk.green(`  ✓ Story completed! (${oldCompleted} → ${newCompleted})`));
                    storiesCompleted++;
                    onIterationEnd?.(iteration, true, false);
                }
                else {
                    console.log(chalk.yellow('  ⚠ No story marked complete this iteration'));
                    onIterationEnd?.(iteration, false, false);
                }
            }
            console.log('');
            console.log(chalk.blue('───────────────────────────────────────────────────────────────────'));
            // Small delay between iterations
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        // Max iterations reached
        console.log('');
        console.log(chalk.yellow('╔═══════════════════════════════════════════════════════════════╗'));
        console.log(chalk.yellow(`║  ⚠ Max iterations (${maxIterations}) reached                            ║`));
        console.log(chalk.yellow('║  Check prd.json for remaining stories                         ║'));
        console.log(chalk.yellow('╚═══════════════════════════════════════════════════════════════╝'));
        return {
            allComplete: false,
            iterationsRun: maxIterations,
            storiesCompleted,
            finalPrd: prd,
        };
    }
    finally {
        // Reset status
        await project.saveStatus({ status: 'idle' });
        await Registry.updateStatus(project.projectPath, 'idle');
    }
}
//# sourceMappingURL=runner.js.map