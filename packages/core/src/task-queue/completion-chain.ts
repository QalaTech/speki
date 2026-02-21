/**
 * Completion Chain
 *
 * Handles the completion chain logic:
 * Task ✓ → User Story ✓ → PRD ✓
 *
 * When a task completes, this module:
 * 1. Marks the task as passes=true in its spec's decompose_state
 * 2. Checks which user stories the task achieves
 * 3. For each user story, checks if ALL tasks achieving it are complete
 * 4. If so, marks the user story as passes=true in the parent PRD
 * 5. Checks if all user stories in the PRD are complete
 */

import path from 'path';
import type {
  CompletionChainResult,
  PrdProgress,
  UserStory,
  PRDData,
  SpecMetadata,
} from '../types/index.js';
import {
  loadPRDForSpec,
  savePRDForSpec,
  readSpecMetadata,
  getChildSpecs,
} from '../spec-review/spec-metadata.js';

/**
 * Process a task completion through the completion chain.
 *
 * This is the main entry point called when a task finishes execution.
 * It handles:
 * 1. Marking the task as complete in its spec
 * 2. Checking if any user stories are now achieved
 * 3. Marking achieved user stories in parent PRD
 */
export async function processTaskCompletion(
  projectRoot: string,
  specId: string,
  taskId: string
): Promise<CompletionChainResult> {
  const result: CompletionChainResult = {
    specId,
    taskId,
    achievedStories: [],
    completedPrds: [],
  };

  try {
    // 1. Load the tech spec's decompose state
    const techSpecPrd = await loadPRDForSpec(projectRoot, specId);
    if (!techSpecPrd) {
      return result;
    }

    // 2. Find and mark the task as complete
    const task = techSpecPrd.userStories.find((s) => s.id === taskId);
    if (!task) {
      return result;
    }

    task.passes = true;
    task.executedAt = new Date().toISOString();
    await savePRDForSpec(projectRoot, specId, techSpecPrd);

    // 3. Check if this task achieves any user stories in a parent PRD
    const metadata = await readSpecMetadata(projectRoot, specId);
    if (!metadata?.parent) {
      // No parent PRD - standalone tech spec
      return result;
    }

    // Extract parent spec ID from path
    const parentSpecId = extractSpecIdFromPath(metadata.parent);
    if (!parentSpecId) {
      return result;
    }

    // 4. Load parent PRD
    const parentPrd = await loadPRDForSpec(projectRoot, parentSpecId);
    if (!parentPrd) {
      return result;
    }

    // 5. Check which user stories this task achieves
    const achievesStories = task.achievesUserStories || [];
    if (achievesStories.length === 0) {
      return result;
    }

    // 6. For each story, check if ALL tasks achieving it are complete
    for (const storyId of achievesStories) {
      const isAchieved = await checkUserStoryAchieved(
        projectRoot,
        parentSpecId,
        storyId
      );

      if (isAchieved) {
        // Mark the user story as achieved in parent PRD
        const story = parentPrd.userStories.find((s) => s.id === storyId);
        if (story && !story.passes) {
          story.passes = true;
          result.achievedStories.push({
            prdSpecId: parentSpecId,
            storyId,
          });
        }
      }
    }

    // Save parent PRD if any stories were achieved
    if (result.achievedStories.length > 0) {
      await savePRDForSpec(projectRoot, parentSpecId, parentPrd);
    }

    // 7. Check if the parent PRD is now complete
    const prdProgress = await calculatePrdProgress(projectRoot, parentSpecId);
    if (prdProgress.isComplete) {
      result.completedPrds.push(parentSpecId);
    }
  } catch (error) {
    // Don't crash the whole iteration - log and return partial result
    console.error(`[CompletionChain] Error processing ${specId}:${taskId}:`, error);
  }

  return result;
}

/**
 * Check if a user story is achieved based on all linked tech spec tasks.
 *
 * A user story is achieved when ALL tasks that reference it (via achievesUserStories)
 * have passes=true.
 */
export async function checkUserStoryAchieved(
  projectRoot: string,
  prdSpecId: string,
  storyId: string
): Promise<boolean> {
  // Find all child tech specs for this PRD
  const childSpecs = await getChildSpecs(projectRoot, prdSpecId);

  // Collect all tasks that achieve this story
  const achievingTasks: Array<{ specId: string; task: UserStory }> = [];

  for (const childSpec of childSpecs) {
    const childSpecId = extractSpecIdFromPath(childSpec.specPath);
    if (!childSpecId) continue;

    const prd = await loadPRDForSpec(projectRoot, childSpecId);
    if (!prd) continue;

    for (const task of prd.userStories) {
      if (task.achievesUserStories?.includes(storyId)) {
        achievingTasks.push({ specId: childSpecId, task });
      }
    }
  }

  // If no tasks achieve this story, it's not achieved
  if (achievingTasks.length === 0) {
    return false;
  }

  // All tasks must be complete for the story to be achieved
  return achievingTasks.every((t) => t.task.passes);
}

/**
 * Mark specific user stories as achieved in a PRD.
 */
export async function markUserStoriesAchieved(
  projectRoot: string,
  prdSpecId: string,
  storyIds: string[]
): Promise<void> {
  const prd = await loadPRDForSpec(projectRoot, prdSpecId);
  if (!prd) {
    throw new Error(`PRD not found: ${prdSpecId}`);
  }

  for (const storyId of storyIds) {
    const story = prd.userStories.find((s) => s.id === storyId);
    if (story) {
      story.passes = true;
    }
  }

  await savePRDForSpec(projectRoot, prdSpecId, prd);
}

/**
 * Calculate progress for a PRD based on its user stories.
 */
export async function calculatePrdProgress(
  projectRoot: string,
  prdSpecId: string
): Promise<PrdProgress> {
  const prd = await loadPRDForSpec(projectRoot, prdSpecId);
  const childSpecs = await getChildSpecs(projectRoot, prdSpecId);

  if (!prd) {
    return {
      specId: prdSpecId,
      totalStories: 0,
      achievedStories: 0,
      isComplete: false,
      pendingStoryIds: [],
      linkedTechSpecs: childSpecs.map((s) => extractSpecIdFromPath(s.specPath) || ''),
    };
  }

  const achievedCount = prd.userStories.filter((s) => s.passes).length;
  const pendingIds = prd.userStories.filter((s) => !s.passes).map((s) => s.id);

  return {
    specId: prdSpecId,
    totalStories: prd.userStories.length,
    achievedStories: achievedCount,
    isComplete: achievedCount === prd.userStories.length && prd.userStories.length > 0,
    pendingStoryIds: pendingIds,
    linkedTechSpecs: childSpecs.map((s) => extractSpecIdFromPath(s.specPath) || ''),
  };
}

/**
 * Get the tasks that achieve a specific user story across all linked tech specs.
 */
export async function getTasksAchievingStory(
  projectRoot: string,
  prdSpecId: string,
  storyId: string
): Promise<Array<{ specId: string; taskId: string; passes: boolean }>> {
  const childSpecs = await getChildSpecs(projectRoot, prdSpecId);
  const result: Array<{ specId: string; taskId: string; passes: boolean }> = [];

  for (const childSpec of childSpecs) {
    const childSpecId = extractSpecIdFromPath(childSpec.specPath);
    if (!childSpecId) continue;

    const prd = await loadPRDForSpec(projectRoot, childSpecId);
    if (!prd) continue;

    for (const task of prd.userStories) {
      if (task.achievesUserStories?.includes(storyId)) {
        result.push({
          specId: childSpecId,
          taskId: task.id,
          passes: task.passes,
        });
      }
    }
  }

  return result;
}

/**
 * Recalculate achievement status for all user stories in a PRD.
 *
 * This should be called when tasks are modified manually or when
 * re-syncing state after changes.
 */
export async function recalculatePrdAchievements(
  projectRoot: string,
  prdSpecId: string
): Promise<{ updated: string[]; unchanged: string[] }> {
  const prd = await loadPRDForSpec(projectRoot, prdSpecId);
  if (!prd) {
    return { updated: [], unchanged: [] };
  }

  const updated: string[] = [];
  const unchanged: string[] = [];

  for (const story of prd.userStories) {
    const wasAchieved = story.passes;
    const isAchieved = await checkUserStoryAchieved(
      projectRoot,
      prdSpecId,
      story.id
    );

    if (wasAchieved !== isAchieved) {
      story.passes = isAchieved;
      updated.push(story.id);
    } else {
      unchanged.push(story.id);
    }
  }

  if (updated.length > 0) {
    await savePRDForSpec(projectRoot, prdSpecId, prd);
  }

  return { updated, unchanged };
}

/**
 * Extract spec ID from a spec file path.
 * E.g., "specs/my-feature.prd.md" -> "my-feature.prd"
 */
function extractSpecIdFromPath(specPath: string): string | null {
  if (!specPath) return null;

  // Get the filename (cross-platform)
  const filename = path.basename(specPath);

  // Remove .md extension
  if (filename.endsWith('.md')) {
    return filename.slice(0, -3);
  }

  return filename;
}
