import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initTaskQueue,
  addTasksToQueue,
  markTaskRunning,
  markTaskQueued,
  clearRunningTasks,
  loadTaskQueue,
  reconcileQueueState,
} from '../queue-manager.js';

function createMockPRD(stories: Array<{ id: string; passes: boolean }>) {
  return {
    projectName: 'Test',
    branchName: 'test-branch',
    language: 'nodejs',
    standardsFile: '',
    description: 'Test PRD',
    userStories: stories.map(s => ({
      id: s.id,
      title: `Story ${s.id}`,
      description: 'Test',
      acceptanceCriteria: [],
      priority: 1,
      passes: s.passes,
      notes: '',
      dependencies: [],
    })),
  };
}

describe('task queue manager', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'queue-manager-test-'));
    await mkdir(join(projectRoot, '.speki'), { recursive: true });
    await initTaskQueue(projectRoot, {
      projectName: 'Test',
      branchName: 'test-branch',
      language: 'nodejs',
    });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('markTaskRunning clears stale running tasks before marking the next task', async () => {
    await addTasksToQueue(projectRoot, [
      { specId: 'test.tech', taskId: 'TS-039' },
      { specId: 'test.tech', taskId: 'TS-040' },
    ]);

    await markTaskRunning(projectRoot, 'test.tech', 'TS-039');
    await markTaskRunning(projectRoot, 'test.tech', 'TS-040');

    const queue = await loadTaskQueue(projectRoot);
    expect(queue).not.toBeNull();

    const runningTasks = queue!.queue.filter((task) => task.status === 'running');
    const ts039 = queue!.queue.find((task) => task.taskId === 'TS-039');
    const ts040 = queue!.queue.find((task) => task.taskId === 'TS-040');

    expect(runningTasks).toHaveLength(1);
    expect(runningTasks[0]?.taskId).toBe('TS-040');
    expect(ts039?.status).toBe('queued');
    expect(ts040?.status).toBe('running');
  });

  it('markTaskQueued resets a running task back to queued', async () => {
    await addTasksToQueue(projectRoot, [
      { specId: 'test.tech', taskId: 'TS-050' },
    ]);

    await markTaskRunning(projectRoot, 'test.tech', 'TS-050');
    await markTaskQueued(projectRoot, 'test.tech', 'TS-050');

    const queue = await loadTaskQueue(projectRoot);
    const task = queue?.queue.find((entry) => entry.taskId === 'TS-050');

    expect(task?.status).toBe('queued');
    expect(task?.startedAt).toBeUndefined();
    expect(task?.completedAt).toBeUndefined();
  });

  it('clearRunningTasks resets all running tasks and returns count', async () => {
    await addTasksToQueue(projectRoot, [
      { specId: 'test.tech', taskId: 'TS-059' },
      { specId: 'test.tech', taskId: 'TS-060' },
    ]);

    await markTaskRunning(projectRoot, 'test.tech', 'TS-059');
    const resetCount = await clearRunningTasks(projectRoot);

    const queue = await loadTaskQueue(projectRoot);
    const runningTasks = queue?.queue.filter((task) => task.status === 'running') ?? [];
    const ts059 = queue?.queue.find((task) => task.taskId === 'TS-059');

    expect(resetCount).toBe(1);
    expect(runningTasks).toHaveLength(0);
    expect(ts059?.status).toBe('queued');
  });

  it('reconcileQueueState fixes tasks marked running but completed in spec', async () => {
    await addTasksToQueue(projectRoot, [
      { specId: 'test.tech', taskId: 'TS-070' },
      { specId: 'test.tech', taskId: 'TS-071' },
    ]);

    await markTaskRunning(projectRoot, 'test.tech', 'TS-070', false);
    await markTaskRunning(projectRoot, 'test.tech', 'TS-071', false);

    // Create a spec with tasks.json showing TS-070 as completed
    await mkdir(join(projectRoot, '.speki', 'specs', 'test.tech'), { recursive: true });
    await writeFile(
      join(projectRoot, '.speki', 'specs', 'test.tech', 'tasks.json'),
      JSON.stringify(createMockPRD([
        { id: 'TS-070', passes: true },
        { id: 'TS-071', passes: false },
      ]))
    );

    const { fixed, issues } = await reconcileQueueState(projectRoot);

    expect(fixed).toBe(1);
    expect(issues).toContainEqual(expect.stringContaining('TS-070'));

    const queue = await loadTaskQueue(projectRoot);
    const ts070 = queue?.queue.find(t => t.taskId === 'TS-070');
    const ts071 = queue?.queue.find(t => t.taskId === 'TS-071');

    expect(ts070?.status).toBe('completed');
    expect(ts071?.status).toBe('running'); // Still running, not completed in spec
  });

  it('reconcileQueueState resets stalled tasks running for more than 2 hours', async () => {
    await addTasksToQueue(projectRoot, [
      { specId: 'test.tech', taskId: 'TS-080' },
    ]);

    // Mark as running with an old timestamp
    await markTaskRunning(projectRoot, 'test.tech', 'TS-080');
    const queue = await loadTaskQueue(projectRoot);
    const task = queue!.queue.find(t => t.taskId === 'TS-080');
    task!.startedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3 hours ago
    await writeFile(join(projectRoot, '.speki', 'task-queue.json'), JSON.stringify(queue));

    // Create empty spec
    await mkdir(join(projectRoot, '.speki', 'specs', 'test.tech'), { recursive: true });
    await writeFile(
      join(projectRoot, '.speki', 'specs', 'test.tech', 'tasks.json'),
      JSON.stringify(createMockPRD([{ id: 'TS-080', passes: false }]))
    );

    const { fixed, issues } = await reconcileQueueState(projectRoot);

    expect(fixed).toBe(1);
    expect(issues).toContainEqual(expect.stringContaining('stalled'));

    const updatedQueue = await loadTaskQueue(projectRoot);
    const ts080 = updatedQueue?.queue.find(t => t.taskId === 'TS-080');
    expect(ts080?.status).toBe('queued');
  });
});
