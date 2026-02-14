import { mkdtemp, mkdir, rm } from 'fs/promises';
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
} from '../queue-manager.js';

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
});
