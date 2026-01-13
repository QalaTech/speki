import { Command } from 'commander';
import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import { Project, findProjectRoot } from '../../core/project.js';
import { PRDData, UserStory } from '../../types/index.js';
import {
  listSpecs,
  loadPRDForSpec,
  savePRDForSpec,
} from '../../core/spec-review/spec-metadata.js';

/**
 * Get next pending task (by priority, respecting dependencies)
 */
function getNextTask(stories: UserStory[]): UserStory | null {
  const completedIds = new Set(stories.filter(s => s.passes).map(s => s.id));

  // Find pending tasks whose dependencies are all complete
  const ready = stories
    .filter(s => !s.passes && !s.executedAt)
    .filter(s => s.dependencies.every(dep => completedIds.has(dep)))
    .sort((a, b) => a.priority - b.priority);

  return ready[0] || null;
}

/**
 * Resolves the spec ID and loads PRD from spec-partitioned location.
 * Falls back to legacy .ralph/prd.json if no specs exist.
 *
 * @param projectPath - The project root path
 * @param project - The Project instance
 * @param specOption - Optional spec ID provided via --spec flag
 * @returns The PRD and spec ID (null if using legacy location)
 */
async function resolveSpecAndLoadPRD(
  projectPath: string,
  project: Project,
  specOption?: string
): Promise<{ prd: PRDData; specId: string | null } | null> {
  const specs = await listSpecs(projectPath);

  // If --spec flag is provided, use that
  if (specOption) {
    return resolveExplicitSpec(projectPath, specs, specOption);
  }

  // If single spec exists, use it
  if (specs.length === 1) {
    const specId = specs[0];
    const prd = await loadPRDForSpec(projectPath, specId);
    if (prd) {
      return { prd, specId };
    }
  }

  // If multiple specs exist, prompt user to select
  if (specs.length > 1) {
    return resolveMultipleSpecs(projectPath, specs);
  }

  // No specs exist, fall back to legacy location
  const legacyPrd = await project.loadPRD();
  if (legacyPrd) {
    return { prd: legacyPrd, specId: null };
  }

  return null;
}

/**
 * Handles explicit --spec flag by validating and loading the specified spec.
 */
async function resolveExplicitSpec(
  projectPath: string,
  specs: string[],
  specOption: string
): Promise<{ prd: PRDData; specId: string } | null> {
  if (!specs.includes(specOption)) {
    console.error(chalk.red(`Error: Spec '${specOption}' not found.`));
    console.error(chalk.yellow(`Available specs: ${specs.join(', ') || 'none'}`));
    return null;
  }

  const prd = await loadPRDForSpec(projectPath, specOption);
  if (!prd) {
    console.error(chalk.red(`Error: No PRD found for spec '${specOption}'.`));
    return null;
  }

  return { prd, specId: specOption };
}

/**
 * Handles multiple specs by filtering to those with PRDs and prompting for selection.
 */
async function resolveMultipleSpecs(
  projectPath: string,
  specs: string[]
): Promise<{ prd: PRDData; specId: string } | null> {
  // Check if any specs have PRDs
  const specsWithPrds: string[] = [];
  for (const spec of specs) {
    const prd = await loadPRDForSpec(projectPath, spec);
    if (prd) {
      specsWithPrds.push(spec);
    }
  }

  if (specsWithPrds.length === 0) {
    console.error(chalk.red('Error: No specs have decomposed PRDs. Run `qala decompose` first.'));
    return null;
  }

  // Single spec with PRD - use it directly
  if (specsWithPrds.length === 1) {
    const specId = specsWithPrds[0];
    const prd = await loadPRDForSpec(projectPath, specId);
    if (prd) {
      return { prd, specId };
    }
    return null;
  }

  // Multiple specs with PRDs - prompt for selection
  const specId = await select({
    message: 'Multiple specs found. Select one:',
    choices: specsWithPrds.map((spec) => ({ name: spec, value: spec })),
  });

  const prd = await loadPRDForSpec(projectPath, specId);
  if (prd) {
    return { prd, specId };
  }
  return null;
}

export const tasksCommand = new Command('tasks')
  .description('Manage PRD tasks');

// qala tasks list
tasksCommand
  .command('list')
  .description('List all tasks with their status')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('-s, --spec <spec-id>', 'Spec ID to read tasks from')
  .option('--pending', 'Show only pending tasks')
  .option('--completed', 'Show only completed tasks')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(chalk.red('Error: No Qala project found. Run `qala init` first.'));
        process.exit(1);
      }

      const result = await resolveSpecAndLoadPRD(projectPath, project, options.spec);
      if (!result) {
        console.error(chalk.red('Error: No PRD found. Run `qala decompose` first.'));
        process.exit(1);
      }

      const { prd } = result;
      let tasks = prd.userStories;
      if (options.pending) {
        tasks = tasks.filter(t => !t.passes);
      } else if (options.completed) {
        tasks = tasks.filter(t => t.passes);
      }

      if (options.json) {
        console.log(JSON.stringify(tasks, null, 2));
        return;
      }

      console.log(chalk.bold(`Tasks (${tasks.length}):\n`));
      for (const task of tasks) {
        const status = task.passes ? chalk.green('DONE') : chalk.yellow('PENDING');
        const complexity = task.complexity ? chalk.gray(`[${task.complexity}]`) : '';
        console.log(`  ${status} ${task.id}: ${task.title} ${complexity}`);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// qala tasks next
tasksCommand
  .command('next')
  .description('Get the next pending task with full context (respects dependencies)')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('-s, --spec <spec-id>', 'Spec ID to read tasks from')
  .option('--task-only', 'Output only the task without context')
  .action(async (options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(chalk.red('Error: No Qala project found.'));
        process.exit(1);
      }

      const result = await resolveSpecAndLoadPRD(projectPath, project, options.spec);
      if (!result) {
        console.error(chalk.red('Error: No PRD found.'));
        process.exit(1);
      }

      const { prd } = result;
      const config = await project.loadConfig();
      const nextTask = getNextTask(prd.userStories);

      if (!nextTask) {
        // All tasks complete
        console.log(JSON.stringify({ complete: true, message: 'All tasks completed' }, null, 2));
        return;
      }

      if (options.taskOnly) {
        console.log(JSON.stringify(nextTask, null, 2));
        return;
      }

      // Build full context (similar to generateCurrentTaskContext)
      const completedIds = new Set(prd.userStories.filter(s => s.passes).map(s => s.id));
      const storyById = new Map(prd.userStories.map(s => [s.id, s]));

      // Completed dependencies with summary info
      const completedDependencies = nextTask.dependencies
        .filter(depId => completedIds.has(depId))
        .map(depId => {
          const dep = storyById.get(depId);
          return { id: depId, title: dep?.title || 'Unknown' };
        });

      // Tasks blocked by this one
      const blocks = prd.userStories
        .filter(s => !s.passes && s.dependencies.includes(nextTask.id))
        .map(s => ({ id: s.id, title: s.title }));

      const context = {
        project: {
          name: prd.projectName,
          branch: prd.branchName || config.branchName,
        },
        currentTask: nextTask,
        completedDependencies,
        blocks,
      };

      console.log(JSON.stringify(context, null, 2));
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// qala tasks get <id>
tasksCommand
  .command('get <id>')
  .description('Get a specific task by ID')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('-s, --spec <spec-id>', 'Spec ID to read tasks from')
  .action(async (id, options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(chalk.red('Error: No Qala project found.'));
        process.exit(1);
      }

      const result = await resolveSpecAndLoadPRD(projectPath, project, options.spec);
      if (!result) {
        console.error(chalk.red('Error: No PRD found.'));
        process.exit(1);
      }

      const { prd } = result;
      const task = prd.userStories.find(s => s.id === id);
      if (task) {
        console.log(JSON.stringify(task, null, 2));
      } else {
        console.error(chalk.red(`Task not found: ${id}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// qala tasks complete <id>
tasksCommand
  .command('complete <id>')
  .description('Mark a task as complete')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('-s, --spec <spec-id>', 'Spec ID to read tasks from')
  .option('-n, --notes <notes>', 'Add notes to the task')
  .action(async (id, options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(chalk.red('Error: No Qala project found.'));
        process.exit(1);
      }

      const result = await resolveSpecAndLoadPRD(projectPath, project, options.spec);
      if (!result) {
        console.error(chalk.red('Error: No PRD found.'));
        process.exit(1);
      }

      const { prd, specId } = result;
      const task = prd.userStories.find(s => s.id === id);
      if (!task) {
        console.error(chalk.red(`Task not found: ${id}`));
        process.exit(1);
      }

      task.passes = true;
      task.executedAt = new Date().toISOString();
      if (options.notes) {
        task.notes = options.notes;
      }

      // Save to appropriate location
      if (specId) {
        await savePRDForSpec(projectPath, specId, prd);
      } else {
        await project.savePRD(prd);
      }
      console.log(chalk.green(`Task ${id} marked complete`));
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// qala tasks notes <id> <notes>
tasksCommand
  .command('notes <id> <notes>')
  .description('Add or update notes for a task')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('-s, --spec <spec-id>', 'Spec ID to read tasks from')
  .option('-a, --append', 'Append to existing notes instead of replacing')
  .action(async (id, notes, options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(chalk.red('Error: No Qala project found.'));
        process.exit(1);
      }

      const result = await resolveSpecAndLoadPRD(projectPath, project, options.spec);
      if (!result) {
        console.error(chalk.red('Error: No PRD found.'));
        process.exit(1);
      }

      const { prd, specId } = result;
      const task = prd.userStories.find(s => s.id === id);
      if (!task) {
        console.error(chalk.red(`Task not found: ${id}`));
        process.exit(1);
      }

      if (options.append && task.notes) {
        task.notes = `${task.notes}\n${notes}`;
      } else {
        task.notes = notes;
      }

      // Save to appropriate location
      if (specId) {
        await savePRDForSpec(projectPath, specId, prd);
      } else {
        await project.savePRD(prd);
      }
      console.log(chalk.green(`Notes updated for task ${id}`));
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

// qala tasks deps <id>
tasksCommand
  .command('deps <id>')
  .description('Show dependencies for a task (with their status)')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('-s, --spec <spec-id>', 'Spec ID to read tasks from')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(chalk.red('Error: No Qala project found.'));
        process.exit(1);
      }

      const result = await resolveSpecAndLoadPRD(projectPath, project, options.spec);
      if (!result) {
        console.error(chalk.red('Error: No PRD found.'));
        process.exit(1);
      }

      const { prd } = result;
      const task = prd.userStories.find(s => s.id === id);
      if (!task) {
        console.error(chalk.red(`Task not found: ${id}`));
        process.exit(1);
      }

      const storyById = new Map(prd.userStories.map(s => [s.id, s]));
      const deps = task.dependencies.map(depId => {
        const dep = storyById.get(depId);
        if (dep) {
          return { id: dep.id, title: dep.title, passes: dep.passes };
        }
        return { id: depId, missing: true };
      });

      if (options.json) {
        console.log(JSON.stringify(deps, null, 2));
        return;
      }

      if (deps.length === 0) {
        console.log(chalk.gray('No dependencies'));
        return;
      }

      console.log(chalk.bold(`Dependencies for ${id}:\n`));
      for (const dep of deps) {
        if ('missing' in dep) {
          console.log(`  ${chalk.red('MISSING')} ${dep.id}`);
        } else {
          const status = dep.passes ? chalk.green('DONE') : chalk.yellow('PENDING');
          console.log(`  ${status} ${dep.id}: ${dep.title}`);
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });
