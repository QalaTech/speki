/**
 * Task Feedback Handler
 *
 * Runs Claude to update a specific task based on user feedback.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { resolveCliPath } from '../cli-path.js';
import type { Project } from '../project.js';
import type { PRDData, UserStory } from '../../types/index.js';

export interface TaskFeedbackOptions {
  /** The task ID to update */
  taskId: string;
  /** User feedback describing the changes */
  feedback: string;
  /** Path to the draft file containing the task */
  draftPath: string;
  /** Path to the original PRD file for context */
  prdPath?: string;
  /** Project instance */
  project: Project;
}

export interface TaskFeedbackResult {
  success: boolean;
  error?: string;
  updatedTask?: UserStory;
}

/**
 * Run Claude to update a task based on user feedback
 */
export async function runTaskFeedback(options: TaskFeedbackOptions): Promise<TaskFeedbackResult> {
  const { taskId, feedback, draftPath, prdPath, project } = options;

  // Load the draft
  const draftContent = await fs.readFile(draftPath, 'utf-8');
  const draft = JSON.parse(draftContent) as PRDData;

  // Find the task
  const taskIndex = draft.userStories.findIndex(s => s.id === taskId);
  if (taskIndex === -1) {
    return { success: false, error: `Task ${taskId} not found in draft` };
  }

  const task = draft.userStories[taskIndex];

  // Load PRD for context if available
  let prdContext = '';
  if (prdPath) {
    try {
      prdContext = await fs.readFile(prdPath, 'utf-8');
    } catch {
      // PRD not available, continue without it
    }
  }

  // Build the prompt
  const prompt = `You are updating a task based on user feedback.

## Current Task
\`\`\`json
${JSON.stringify(task, null, 2)}
\`\`\`

## User Feedback
${feedback}

${prdContext ? `## Original PRD (for context)\n${prdContext}\n` : ''}

## Instructions
Update the task JSON based on the user's feedback. You may:
- Update the title, description, or notes
- Add, modify, or remove acceptance criteria
- Add, modify, or remove test cases
- Change the priority
- Update dependencies
- Modify the context field

Respond with ONLY the updated task as valid JSON. Do not include any explanation or markdown formatting - just the raw JSON object.`;

  // Write prompt to temp file
  const promptPath = join(project.ralphDir, '.task_feedback_prompt.md');
  await fs.writeFile(promptPath, prompt);

  try {
    // Run Claude
    const claudePath = resolveCliPath('claude');
    const result = await new Promise<{ success: boolean; output: string; error?: string }>((resolve) => {
      const claude = spawn(claudePath, ['--print', '-p', prompt], {
        cwd: project.projectPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NO_COLOR: '1',
          FORCE_COLOR: '0',
        },
      });

      let stdout = '';
      let stderr = '';

      claude.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      claude.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      claude.on('close', (code) => {
        if (code !== 0 && code !== 141) {
          resolve({ success: false, output: stdout, error: stderr || `Exit code ${code}` });
        } else {
          resolve({ success: true, output: stdout });
        }
      });

      claude.on('error', (err) => {
        resolve({ success: false, output: '', error: err.message });
      });
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Parse the response - Claude should return just the JSON
    let updatedTask: UserStory;
    try {
      // Try to extract JSON from the response (in case Claude added explanation)
      const jsonMatch = result.output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { success: false, error: 'Could not find JSON in Claude response' };
      }
      updatedTask = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      return { success: false, error: `Failed to parse Claude response: ${parseErr}` };
    }

    // Validate the updated task has required fields
    if (!updatedTask.id || !updatedTask.title) {
      return { success: false, error: 'Invalid task structure in response' };
    }

    // Update the draft
    draft.userStories[taskIndex] = updatedTask;
    await fs.writeFile(draftPath, JSON.stringify(draft, null, 2));

    return { success: true, updatedTask };
  } finally {
    // Clean up temp file
    try {
      await fs.unlink(promptPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}
