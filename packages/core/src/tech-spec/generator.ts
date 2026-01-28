/**
 * Tech Spec Generator
 *
 * Generates a technical specification from a PRD and its user stories.
 * Uses the Engine abstraction for LLM calls.
 */

import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { selectEngine } from '../llm/engine-factory.js';
import {
  extractSpecId,
  getSpecLogsDir,
  loadPRDForSpec,
} from '../spec-review/spec-metadata.js';
import type { UserStory, PRDData } from '../types/index.js';
import type { StreamCallbacks } from '../claude/types.js';

export interface TechSpecGenerateOptions {
  /** Path to the parent PRD file */
  prdPath: string;
  /** Project root directory */
  projectRoot: string;
  /** Output filename (defaults to PRD name with .tech.md) */
  outputName?: string;
  /** Preferred engine name (overrides settings) */
  engineName?: string;
  /** Preferred model (overrides settings) */
  model?: string;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
  /** Stream callbacks for real-time output */
  streamCallbacks?: StreamCallbacks;
}

export interface TechSpecGenerateResult {
  /** Whether generation succeeded */
  success: boolean;
  /** Path to the generated tech spec */
  outputPath?: string;
  /** Error message if failed */
  error?: string;
  /** Validation errors if inputs invalid */
  validationErrors?: Array<{ field: string; error: string }>;
}

interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; error: string }>;
  prdContent?: string;
  userStories?: UserStory[];
}

/**
 * Validate inputs before generation (FR0)
 */
async function validateInputs(
  prdPath: string,
  projectRoot: string
): Promise<ValidationResult> {
  const errors: Array<{ field: string; error: string }> = [];
  let prdContent: string | undefined;
  let userStories: UserStory[] | undefined;

  // Validate PRD file - accept .prd.md or .md files
  if (!prdPath.endsWith('.md')) {
    errors.push({ field: 'prdPath', error: 'PRD file must be a markdown file (.md)' });
  }

  try {
    prdContent = await fs.readFile(prdPath, 'utf-8');

    // Check frontmatter - but allow .prd.md files without it (filename implies type)
    const isPrdByFilename = prdPath.endsWith('.prd.md');
    const hasPrdFrontmatter = prdContent.includes('type: prd');
    if (!isPrdByFilename && !hasPrdFrontmatter) {
      errors.push({ field: 'prd.frontmatter', error: 'PRD must have frontmatter with type: prd (or use .prd.md extension)' });
    }

  } catch (err) {
    errors.push({ field: 'prdPath', error: `Cannot read PRD file: ${(err as Error).message}` });
  }

  // Load user stories from PRD decompose data
  try {
    const specId = extractSpecId(prdPath);
    const prdData = await loadPRDForSpec(projectRoot, specId);

    if (!prdData?.userStories || prdData.userStories.length === 0) {
      errors.push({ field: 'userStories', error: 'No user stories found. Generate stories first.' });
    } else {
      userStories = prdData.userStories;

      // Validate each story has required fields
      for (const story of userStories) {
        if (!story.id || !story.title || !story.description) {
          errors.push({
            field: 'userStories',
            error: `Story ${story.id || 'unknown'} missing required fields (id, title, description)`
          });
          break;
        }
        if (!story.acceptanceCriteria || story.acceptanceCriteria.length === 0) {
          errors.push({
            field: 'userStories',
            error: `Story ${story.id} has no acceptance criteria`
          });
          break;
        }
      }
    }
  } catch (err) {
    errors.push({ field: 'userStories', error: `Cannot load user stories: ${(err as Error).message}` });
  }

  return {
    valid: errors.length === 0,
    errors,
    prdContent,
    userStories,
  };
}

/**
 * Build the tech spec generation prompt
 */
function buildGenerationPrompt(
  prdContent: string,
  userStories: UserStory[],
  outputPath: string,
  prdFilename: string
): string {
  const storiesJson = JSON.stringify(userStories, null, 2);
  const today = new Date().toISOString().split('T')[0];

  return `# Tech Spec Generation Task

You are a pragmatic senior engineer. Your task is to create a technical specification from a PRD.

## Guiding Principles

- **Simplicity first.** Prefer the simplest approach that satisfies the user stories. Do not invent abstractions, patterns, or indirection that the requirements don't demand.
- **Leverage existing code.** Extend what exists rather than building new systems. Match the project's current patterns and conventions exactly.
- **Proportional detail.** A small feature gets a short spec. Only elaborate where genuine complexity or risk exists.
- **No speculative design.** Don't add error handling, fallbacks, or configurability for scenarios that can't happen. Don't design for hypothetical future requirements.
- **No prescriptive refactoring.** Describe what needs to change to deliver the feature — nothing more. Do not include "refactor X for maintainability" or "clean up Y while we're here." The implementing agent will refactor as needed during normal engineering practice. If a structural change is required to make the feature possible, describe it as a necessary change, not as a refactoring goal. Large-scale refactoring that isn't required by the feature belongs in its own PRD.

## Planning Phase

Before writing, explore the codebase to ground your decisions in reality:

1. **Explore the codebase** - Use Glob and Read tools to understand:
   - Project structure, existing patterns, and conventions
   - Related code this feature will interact with
   - How similar features were implemented before

2. **Identify what changes** - Be specific about:
   - Which existing files need modification (and what changes)
   - What new files are needed (only if existing files can't absorb the change)
   - Integration points with existing code

3. **Validate against user stories** - Ensure the approach addresses every user story. If a story is already satisfied by existing code, say so.

## Output: Write Tech Spec to File

**After planning, write the tech spec directly to: ${outputPath}**

Use your Write tool to create the file. Do NOT output the content as text - write it to the file.

## Document Structure

The tech spec MUST start with this exact frontmatter:

---
type: tech-spec
status: draft
created: ${today}
parent: ${prdFilename}
---

Then include these sections. **Skip any section that genuinely doesn't apply** — an empty section adds noise, not value:

1. # [Feature Name] Technical Specification
2. ## Overview - What this spec delivers and its relationship to the PRD
3. ## Technical Approach - The chosen approach with rationale. Reference actual code you explored. If there was a meaningful alternative, briefly note why you didn't choose it — but don't manufacture alternatives for simple decisions.
4. ## Database Changes - Only if the feature touches the database
5. ## API Changes - Only if the feature adds or modifies endpoints
6. ## Code Structure - Files to create/modify with specific descriptions of changes (reference actual project paths from your exploration)
7. ## Edge Cases - Only cases that are realistic given the feature scope
8. ## Error Handling - Only error scenarios that could actually occur
9. ## Testing Strategy - Test cases that validate the user stories, following the project's existing test patterns
10. ## Security Considerations - Only if the feature handles user input, auth, or sensitive data
11. ## Performance Considerations - Only if the feature involves bulk operations, real-time processing, or known bottlenecks
12. ## Open Questions - Genuine unknowns that need resolution before implementation, or omit if none

## PRD Content

${prdContent}

## User Stories

${storiesJson}

## Instructions

1. **FIRST: Explore the codebase** to understand existing patterns and structure
2. Analyze the PRD and user stories in context of what you discovered
3. Choose the simplest approach that satisfies the requirements — three lines of straightforward code is better than a premature abstraction
4. Reference actual file paths and patterns from the codebase — no invented structure
5. **Write the complete tech spec to ${outputPath} using the Write tool**`;
}

/**
 * Generate a tech spec from PRD and user stories
 */
export async function generateTechSpec(
  options: TechSpecGenerateOptions
): Promise<TechSpecGenerateResult> {
  const { prdPath, projectRoot, onProgress = () => {} } = options;

  onProgress('Validating inputs...');

  // Validate inputs (FR0)
  const validation = await validateInputs(prdPath, projectRoot);
  if (!validation.valid) {
    return {
      success: false,
      error: 'Input validation failed',
      validationErrors: validation.errors,
    };
  }

  const { prdContent, userStories } = validation;
  if (!prdContent || !userStories) {
    return {
      success: false,
      error: 'Missing PRD content or user stories after validation',
    };
  }

  // Prepare output paths first (needed for prompt)
  const prdBasename = basename(prdPath, '.prd.md');
  const prdFilename = basename(prdPath);
  const outputName = options.outputName || `${prdBasename}.tech.md`;
  const specsDir = join(projectRoot, 'specs');
  const outputPath = join(specsDir, outputName);

  onProgress(`Generating tech spec from PRD with ${userStories.length} user stories...`);

  // Build prompt - tells engine to write directly to outputPath
  const prompt = buildGenerationPrompt(prdContent, userStories, outputPath, prdFilename);

  // Ensure specs directory exists
  try {
    await fs.mkdir(specsDir, { recursive: true });
  } catch {}

  // Write prompt to temp file for engine
  const specId = extractSpecId(prdPath);
  const logsDir = getSpecLogsDir(projectRoot, specId);

  // Ensure logs directory exists
  await fs.mkdir(logsDir, { recursive: true });

  const promptPath = join(logsDir, `tech_spec_gen_${Date.now()}.md`);
  await fs.writeFile(promptPath, prompt, 'utf-8');

  try {
    // Select engine
    const sel = await selectEngine({
      engineName: options.engineName,
      model: options.model,
      purpose: 'specGenerator',
    });

    onProgress(`Using engine: ${sel.engineName}, model: ${sel.model || 'default'}`);

    // Run generation - engine will write directly to outputPath
    await sel.engine.runStream({
      promptPath,
      cwd: projectRoot,
      logDir: logsDir,
      iteration: 0,
      model: sel.model,
      callbacks: options.streamCallbacks,
    });

    // Verify the file was created
    try {
      await fs.access(outputPath);
      onProgress(`Tech spec generated: ${outputPath}`);
      return {
        success: true,
        outputPath,
      };
    } catch {
      return {
        success: false,
        error: `Engine completed but tech spec file was not created at ${outputPath}`,
      };
    }
  } catch (err) {
    return {
      success: false,
      error: `Generation failed: ${(err as Error).message}`,
    };
  }
}
