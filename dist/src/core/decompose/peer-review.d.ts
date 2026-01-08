/**
 * Decomposition Peer Review
 *
 * Uses Codex to compare the source PRD with the decomposed tasks JSON.
 * Returns PASS/FAIL verdict without modifying the tasks.
 */
import type { Project } from '../project.js';
import type { PRDData } from '../../types/index.js';
export interface ReviewFeedback {
    verdict: 'PASS' | 'FAIL' | 'UNKNOWN';
    missingRequirements?: Array<{
        requirement: string;
        prdSection?: string;
    }>;
    contradictions?: Array<{
        taskId: string;
        issue: string;
        prdSection?: string;
    }>;
    dependencyErrors?: Array<{
        taskId: string;
        issue: string;
        dependsOn?: string;
    }>;
    duplicates?: Array<{
        taskIds: string[];
        reason: string;
    }>;
    suggestions?: Array<{
        taskId?: string;
        action: string;
    }>;
    issues?: string[];
    reviewLog?: string;
}
export interface PeerReviewOptions {
    /** Path to the PRD markdown file */
    prdFile: string;
    /** Generated tasks PRD data */
    tasks: PRDData;
    /** Project instance for paths */
    project: Project;
    /** Review attempt number (for log naming) */
    attempt?: number;
}
export interface PeerReviewResult {
    /** Whether the review completed successfully */
    success: boolean;
    /** The review feedback */
    feedback: ReviewFeedback;
    /** Path to the review log file */
    logPath: string;
    /** Error message if failed */
    error?: string;
}
/**
 * Run peer review using Codex
 */
export declare function runPeerReview(options: PeerReviewOptions): Promise<PeerReviewResult>;
//# sourceMappingURL=peer-review.d.ts.map