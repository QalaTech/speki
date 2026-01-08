/**
 * PRD Decomposition Runner
 *
 * Takes a PRD markdown file and breaks it into small,
 * Ralph-compatible task files using Claude.
 */
import { Project } from '../project.js';
import type { PRDData, DecomposeState } from '../../types/index.js';
export interface DecomposeOptions {
    /** Path to the PRD markdown file */
    prdFile: string;
    /** Branch name for the feature */
    branchName?: string;
    /** Language type (dotnet, python, nodejs, go) */
    language?: string;
    /** Output filename (defaults to prd file basename + .json) */
    outputName?: string;
    /** Start fresh from US-001 (ignore existing numbering) */
    freshStart?: boolean;
    /** Force re-decomposition even if draft exists */
    forceRedecompose?: boolean;
    /** Enable peer review */
    enablePeerReview?: boolean;
    /** Max peer review attempts */
    maxReviewAttempts?: number;
    /** Callback for progress updates */
    onProgress?: (state: DecomposeState) => void;
}
export interface DecomposeResult {
    /** Whether decomposition succeeded */
    success: boolean;
    /** Generated PRD data */
    prd?: PRDData;
    /** Path to the output file */
    outputPath?: string;
    /** Number of stories generated */
    storyCount: number;
    /** Peer review verdict */
    verdict?: 'PASS' | 'FAIL' | 'UNKNOWN' | 'SKIPPED';
    /** Error message if failed */
    error?: string;
}
/**
 * Run PRD decomposition
 */
export declare function runDecompose(project: Project, options: DecomposeOptions): Promise<DecomposeResult>;
//# sourceMappingURL=runner.d.ts.map