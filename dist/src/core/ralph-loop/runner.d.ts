/**
 * Ralph Loop Runner
 *
 * Orchestrates the iterative development process:
 * 1. Read PRD and find next incomplete story
 * 2. Run Claude with the prompt
 * 3. Check for completion
 * 4. Repeat until done or max iterations reached
 */
import { Project } from '../project.js';
import type { PRDData, UserStory } from '../../types/index.js';
export interface LoopOptions {
    /** Maximum number of iterations */
    maxIterations: number;
    /** Callback when an iteration starts */
    onIterationStart?: (iteration: number, story: UserStory | null) => void;
    /** Callback when an iteration ends */
    onIterationEnd?: (iteration: number, storyCompleted: boolean, isAllComplete: boolean) => void;
}
export interface LoopResult {
    /** Whether all stories were completed */
    allComplete: boolean;
    /** Number of iterations run */
    iterationsRun: number;
    /** Number of stories completed during this run */
    storiesCompleted: number;
    /** Final PRD state */
    finalPrd: PRDData;
}
/**
 * Run the Ralph loop
 */
export declare function runRalphLoop(project: Project, options: LoopOptions): Promise<LoopResult>;
//# sourceMappingURL=runner.d.ts.map