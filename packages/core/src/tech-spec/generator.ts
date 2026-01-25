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

    // Check frontmatter
    if (!prdContent.includes('type: prd')) {
      errors.push({ field: 'prd.frontmatter', error: 'PRD must have frontmatter with type: prd' });
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

You are a senior technical architect. Your task is to create a technical specification from a PRD.

## CRITICAL: Deep Planning Phase

Before writing the tech spec, you MUST thoroughly explore and plan:

1. **Explore the codebase** - Use Glob and Read tools to understand:
   - Project structure and existing patterns
   - Related code that this feature will interact with
   - Existing APIs, database schemas, and conventions
   - Testing patterns used in the project

2. **Analyze dependencies** - Identify:
   - Which existing modules/files will be affected
   - What new files need to be created
   - Integration points with existing code

3. **Consider alternatives** - Think through:
   - Multiple implementation approaches
   - Trade-offs between approaches
   - Why the chosen approach is best

4. **Validate against user stories** - Ensure the technical approach addresses all user stories

## Output: Write Tech Spec to File

**After planning, write the tech spec directly to: ${outputPath}**

Use your Write tool to create the file. Do NOT output the content as text - write it to the file.

## Required Document Structure

The tech spec MUST start with this exact frontmatter:

---
type: tech-spec
status: draft
created: ${today}
parent: ${prdFilename}
---

Then include these sections:
1. # [Feature Name] Technical Specification
2. ## Overview - relationship to PRD
3. ## Technical Approach - architecture decisions with rationale (reference explored code)
4. ## Database Changes - schema changes OR "**N/A** - [justification]"
5. ## API Changes - endpoints OR "**N/A** - [justification]"
6. ## Code Structure - files to create/modify (based on codebase exploration)
7. ## Edge Cases - table of cases and expected behavior
8. ## Error Handling - table with HTTP status codes and recovery
9. ## Testing Strategy - unit and integration test cases (following project patterns)
10. ## Security Considerations
11. ## Performance Considerations
12. ## Open Questions - or "None identified"

## PRD Content

${prdContent}

## User Stories

${storiesJson}

## Instructions

1. **FIRST: Explore the codebase** to understand existing patterns and structure
2. Analyze the PRD and user stories in context of what you discovered
3. Make concrete technical decisions (no placeholders) based on actual codebase patterns
4. Include ALL sections - use N/A with justification if not applicable
5. Be specific about files, endpoints, and test cases - reference actual project paths
6. **Write the complete tech spec to ${outputPath} using the Write tool**`;
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
