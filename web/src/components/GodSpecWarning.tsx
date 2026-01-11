import type { GodSpecIndicators, SplitProposal } from '../../../src/types/index.js';
import './GodSpecWarning.css';

export interface GodSpecWarningProps {
  /** God spec detection indicators */
  indicators: GodSpecIndicators;
  /** Proposed split (if available) */
  splitProposal?: SplitProposal;
  /** Called when user accepts the split proposal */
  onAcceptSplit?: (proposal: SplitProposal) => void;
  /** Called when user wants to modify the proposal */
  onModify?: (proposal: SplitProposal) => void;
  /** Called when user skips/dismisses the warning */
  onSkip?: () => void;
}

export function GodSpecWarning({
  indicators,
  splitProposal,
  onAcceptSplit,
  onModify,
  onSkip,
}: GodSpecWarningProps): React.ReactElement {
  const hasProposal = (splitProposal?.proposedSpecs.length ?? 0) > 0;

  return (
    <div className="god-spec-warning-container" data-testid="god-spec-warning">
      <div className="god-spec-warning-header">
        <span className="warning-icon" aria-hidden="true">
          &#x26A0;
        </span>
        <h3 className="warning-title">God Spec Detected</h3>
      </div>

      <div className="god-spec-warning-body">
        <p className="warning-explanation">
          This specification covers too many concerns and should be split into smaller, focused specs.
        </p>

        {indicators.estimatedStories > 0 && (
          <p className="warning-estimate" data-testid="estimated-stories">
            Estimated stories: <strong>{indicators.estimatedStories}</strong>
          </p>
        )}

        {indicators.indicators.length > 0 && (
          <div className="warning-issues" data-testid="detected-issues">
            <p className="issues-header">Detected issues:</p>
            <ul className="issues-list">
              {indicators.indicators.map((issue, idx) => (
                <li key={idx}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        {hasProposal && (
          <div className="proposed-split" data-testid="proposed-split">
            <p className="split-header">Proposed split:</p>
            <ul className="split-list">
              {splitProposal.proposedSpecs.map((spec, idx) => (
                <li key={idx} className="split-item" data-testid="split-spec">
                  <span className="split-filename">{spec.filename}</span>
                  <span className="split-stories">
                    ~{spec.estimatedStories} {spec.estimatedStories === 1 ? 'story' : 'stories'}
                  </span>
                  {spec.description && (
                    <span className="split-description">{spec.description}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="god-spec-warning-actions" data-testid="warning-actions">
        {hasProposal && (
          <>
            <button
              type="button"
              className="action-button accept-split-button"
              onClick={() => onAcceptSplit?.(splitProposal)}
              data-testid="accept-split-button"
            >
              Accept Split
            </button>
            <button
              type="button"
              className="action-button modify-button"
              onClick={() => onModify?.(splitProposal)}
              data-testid="modify-button"
            >
              Modify
            </button>
          </>
        )}
        <button
          type="button"
          className="action-button skip-button"
          onClick={() => onSkip?.()}
          data-testid="skip-button"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
