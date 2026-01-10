import { Command } from 'commander';
import chalk from 'chalk';
import { Project, findProjectRoot } from '../../core/project.js';
import { UserStory } from '../../types/index.js';

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

export const tasksCommand = new Command('tasks')
  .description('Manage PRD tasks');

// qala tasks list
tasksCommand
  .command('list')
  .description('List all tasks with their status')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
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

      const prd = await project.loadPRD();
      if (!prd) {
        console.error(chalk.red('Error: No PRD found. Run `qala decompose` first.'));
        process.exit(1);
      }

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
  .option('--task-only', 'Output only the task without context')
  .action(async (options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(chalk.red('Error: No Qala project found.'));
        process.exit(1);
      }

      const prd = await project.loadPRD();
      if (!prd) {
        console.error(chalk.red('Error: No PRD found.'));
        process.exit(1);
      }

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

      // Completed dependencies with summary info
      const completedDependencies = nextTask.dependencies
        .filter(depId => completedIds.has(depId))
        .map(depId => {
          const dep = prd.userStories.find(s => s.id === depId);
          return { id: depId, title: dep?.title || 'Unknown' };
        });

      // Tasks blocked by this one
      const blocks = prd.userStories
        .filter(s => !s.passes && s.dependencies.includes(nextTask.id))
        .map(s => ({ id: s.id, title: s.title }));

      // Available standards
      const availableStandards = await project.listAvailableStandards();

      const context = {
        project: {
          name: prd.projectName,
          branch: prd.branchName || config.branchName,
        },
        currentTask: nextTask,
        completedDependencies,
        blocks,
        availableStandards,
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
  .action(async (id, options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(chalk.red('Error: No Qala project found.'));
        process.exit(1);
      }

      const prd = await project.loadPRD();
      if (!prd) {
        console.error(chalk.red('Error: No PRD found.'));
        process.exit(1);
      }

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
  .option('-n, --notes <notes>', 'Add notes to the task')
  .action(async (id, options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(chalk.red('Error: No Qala project found.'));
        process.exit(1);
      }

      const prd = await project.loadPRD();
      if (!prd) {
        console.error(chalk.red('Error: No PRD found.'));
        process.exit(1);
      }

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

      await project.savePRD(prd);
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
  .option('-a, --append', 'Append to existing notes instead of replacing')
  .action(async (id, notes, options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(chalk.red('Error: No Qala project found.'));
        process.exit(1);
      }

      const prd = await project.loadPRD();
      if (!prd) {
        console.error(chalk.red('Error: No PRD found.'));
        process.exit(1);
      }

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

      await project.savePRD(prd);
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
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(chalk.red('Error: No Qala project found.'));
        process.exit(1);
      }

      const prd = await project.loadPRD();
      if (!prd) {
        console.error(chalk.red('Error: No PRD found.'));
        process.exit(1);
      }

      const task = prd.userStories.find(s => s.id === id);
      if (!task) {
        console.error(chalk.red(`Task not found: ${id}`));
        process.exit(1);
      }

      const deps = task.dependencies.map(depId => {
        const dep = prd.userStories.find(s => s.id === depId);
        return dep ? { id: dep.id, title: dep.title, passes: dep.passes } : { id: depId, missing: true };
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
