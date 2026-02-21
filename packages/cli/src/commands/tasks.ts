import { Command } from 'commander';
import chalk from 'chalk';
import { Project, findProjectRoot } from '@speki/core';
import { PRDData, UserStory } from '@speki/core';
import {
  loadPRDForSpec,
  savePRDForSpec,
} from '@speki/core';
import { resolveSpecAndLoadPRD } from '../shared/spec-utils.js';
import {
  loadTaskQueue,
  loadQueueWithTaskData,
  markTaskCompleted,
  markTaskRunning,
} from '@speki/core';

/**
 * Get current/next task from queue (by queue order, respecting dependencies)
 * Uses task-queue.json as source of truth for status
 * 
 * If QALA_CURRENT_TASK_ID env var is set, returns that specific task
 * (used for parallel execution to ensure each engine gets its assigned task)
 */
async function getNextTaskFromQueue(projectPath: string): Promise<{ task: UserStory; specId: string } | null> {
  const queueWithTasks = await loadQueueWithTaskData(projectPath);
  if (!queueWithTasks.length) return null;

  // Check for explicit task assignment via env var (parallel execution)
  const assignedTaskId = process.env.QALA_CURRENT_TASK_ID;
  if (assignedTaskId) {
    const assignedRef = queueWithTasks.find(ref => ref.taskId === assignedTaskId && ref.task);
    if (assignedRef && assignedRef.task) {
      // Only return assigned task if it's still active (not completed/failed/skipped)
      if (assignedRef.status === 'running' || assignedRef.status === 'queued') {
        return { task: assignedRef.task, specId: assignedRef.specId };
      }
      // Assigned task is completed/failed/skipped - return null to signal no more work
      // This prevents the engine from picking up other parallel tasks
      return null;
    }
    // Assigned task not found in queue - fall through to normal logic
  }

  // If a task is already running, that is the current task.
  // This keeps `qala tasks next` aligned with the Ralph runner and live execution UI.
  for (const ref of queueWithTasks) {
    if (ref.status === 'running' && ref.task) {
      return { task: ref.task, specId: ref.specId };
    }
  }

  // Get completed task IDs from queue status
  const completedIds = new Set(
    queueWithTasks
      .filter(ref => ref.status === 'completed')
      .map(ref => ref.taskId)
  );

  // Find first queued task whose dependencies are all complete
  for (const ref of queueWithTasks) {
    if (ref.status !== 'queued' || !ref.task) continue;

    const depsComplete = ref.task.dependencies.every(dep => completedIds.has(dep));
    if (depsComplete) {
      return { task: ref.task, specId: ref.specId };
    }
  }

  return null;
}

/**
 * Legacy: Get next pending task from PRD (for non-queue workflows)
 */
function getNextTaskFromPRD(stories: UserStory[]): UserStory | null {
  const completedIds = new Set(stories.filter(s => s.passes).map(s => s.id));

  // Find pending tasks whose dependencies are all complete
  const ready = stories
    .filter(s => !s.passes && !s.executedAt)
    .filter(s => s.dependencies.every(dep => completedIds.has(dep)))
    .sort((a, b) => a.priority - b.priority);

  return ready[0] || null;
}

// Spec resolution DRY: pulled into ../shared/spec-utils

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

      const result = await resolveSpecAndLoadPRD(projectPath, options.spec);
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
  .description('Get the current running task (or next pending task) with full context')
  .option('-p, --project <path>', 'Project path (defaults to current directory)')
  .option('-s, --spec <spec-id>', 'Spec ID to read tasks from (legacy, ignored when queue exists)')
  .option('--task-only', 'Output only the task without context')
  .option('--mark-running', 'Mark the task as running in the queue')
  .action(async (options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(chalk.red('Error: No Qala project found.'));
        process.exit(1);
      }

      // Try queue-based workflow first (preferred)
      const queue = await loadTaskQueue(projectPath);
      if (queue && queue.queue.length > 0) {
        const nextResult = await getNextTaskFromQueue(projectPath);

        if (!nextResult) {
          // Check if all tasks are completed or blocked
          const queueWithTasks = await loadQueueWithTaskData(projectPath);
          const allCompleted = queueWithTasks.every(ref => ref.status === 'completed');
          if (allCompleted) {
            console.log(JSON.stringify({ complete: true, message: 'All tasks completed' }, null, 2));
          } else {
            console.log(JSON.stringify({ blocked: true, message: 'Remaining tasks are blocked by dependencies' }, null, 2));
          }
          return;
        }

        const { task, specId } = nextResult;

        // Mark as running if requested
        if (options.markRunning) {
          await markTaskRunning(projectPath, specId, task.id);
        }

        if (options.taskOnly) {
          console.log(JSON.stringify(task, null, 2));
          return;
        }

        // Build context from queue data
        const queueWithTasks = await loadQueueWithTaskData(projectPath);
        const completedIds = new Set(
          queueWithTasks.filter(ref => ref.status === 'completed').map(ref => ref.taskId)
        );
        const taskById = new Map(
          queueWithTasks.filter(ref => ref.task).map(ref => [ref.taskId, ref.task!])
        );

        const completedDependencies = task.dependencies
          .filter(depId => completedIds.has(depId))
          .map(depId => {
            const dep = taskById.get(depId);
            return { id: depId, title: dep?.title || 'Unknown' };
          });

        const blocks = queueWithTasks
          .filter(ref => ref.task && ref.status === 'queued' && ref.task.dependencies.includes(task.id))
          .map(ref => ({ id: ref.taskId, title: ref.task!.title }));

        const config = await project.loadConfig();
        const context = {
          project: {
            name: queue.projectName,
            branch: queue.branchName || config.branchName,
          },
          currentTask: task,
          specId,
          completedDependencies,
          blocks,
        };

        console.log(JSON.stringify(context, null, 2));
        return;
      }

      // Fall back to legacy PRD-based workflow
      const result = await resolveSpecAndLoadPRD(projectPath, options.spec);
      if (!result) {
        console.error(chalk.red('Error: No tasks found. Run `qala decompose` or add tasks to queue.'));
        process.exit(1);
      }

      const { prd } = result;
      const config = await project.loadConfig();
      const nextTask = getNextTaskFromPRD(prd.userStories);

      if (!nextTask) {
        console.log(JSON.stringify({ complete: true, message: 'All tasks completed' }, null, 2));
        return;
      }

      if (options.taskOnly) {
        console.log(JSON.stringify(nextTask, null, 2));
        return;
      }

      const completedIds = new Set(prd.userStories.filter(s => s.passes).map(s => s.id));
      const storyById = new Map(prd.userStories.map(s => [s.id, s]));

      const completedDependencies = nextTask.dependencies
        .filter(depId => completedIds.has(depId))
        .map(depId => {
          const dep = storyById.get(depId);
          return { id: depId, title: dep?.title || 'Unknown' };
        });

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

      const result = await resolveSpecAndLoadPRD(projectPath, options.spec);
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
  .option('-s, --spec <spec-id>', 'Spec ID (auto-detected from queue if not provided)')
  .option('-n, --notes <notes>', 'Add notes to the task')
  .action(async (id, options) => {
    try {
      const projectPath = options.project || (await findProjectRoot()) || process.cwd();
      const project = new Project(projectPath);

      if (!(await project.exists())) {
        console.error(chalk.red('Error: No Qala project found.'));
        process.exit(1);
      }

      // Try queue-based workflow first (preferred)
      const queueWithTasks = await loadQueueWithTaskData(projectPath);
      const runningRef = queueWithTasks.find(ref => ref.status === 'running');

      // Guardrail: when a task is running, only that task can be completed.
      // This prevents the agent from completing "next" tasks out of order and
      // desynchronizing the live execution queue.
      if (runningRef && runningRef.taskId !== id) {
        console.error(
          chalk.red(
            `Cannot complete ${id}: ${runningRef.taskId} is currently running. Complete the running task first.`
          )
        );
        process.exit(1);
      }

      // Additional guardrail: if no task is marked running, only allow
      // completing the current expected queue task.
      if (!runningRef) {
        const expected = await getNextTaskFromQueue(projectPath);
        if (expected && expected.task.id !== id) {
          console.error(
            chalk.red(
              `Cannot complete ${id}: expected current task is ${expected.task.id}.`
            )
          );
          process.exit(1);
        }
      }

      const queueRef = queueWithTasks.find(ref => ref.taskId === id);

      if (queueRef) {
        // Mark completed in queue (source of truth for status)
        await markTaskCompleted(projectPath, queueRef.specId, id);
        
        // Also update PRD to sync passes field (needed for decompose view consistency)
        const { processTaskCompletion } = await import('@speki/core');
        await processTaskCompletion(projectPath, queueRef.specId, id);
        
        console.log(chalk.green(`Task ${id} marked complete`));
        return;
      }

      // Fall back to legacy PRD-based workflow
      const result = await resolveSpecAndLoadPRD(projectPath, options.spec);
      if (!result) {
        console.error(chalk.red(`Task not found: ${id}`));
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

      // Save to per-spec location
      if (!specId) {
        throw new Error('No spec ID available. Tasks must be associated with a spec.');
      }
      await savePRDForSpec(projectPath, specId, prd);
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

      const result = await resolveSpecAndLoadPRD(projectPath, options.spec);
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

      // Save to per-spec location
      if (!specId) {
        throw new Error('No spec ID available. Tasks must be associated with a spec.');
      }
      await savePRDForSpec(projectPath, specId, prd);
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

      const result = await resolveSpecAndLoadPRD(projectPath, options.spec);
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
