import type { GodSpecIndicators, SplitProposal } from '../../../../src/types/index.js';

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
  return (
    <div className="flex flex-col p-4 bg-warning/20 border border-warning border-l-4 rounded-lg gap-3" data-testid="god-spec-warning">
      <div className="flex items-center gap-2.5">
        <span className="text-2xl text-warning-content" aria-hidden="true">
          &#x26A0;
        </span>
        <h3 className="m-0 text-lg font-semibold text-warning">God Spec Detected</h3>
      </div>

      <div className="flex flex-col gap-3 text-base-content">
        <p className="m-0 text-sm leading-relaxed">
          This specification covers too many concerns and should be split into smaller, focused specs.
        </p>

        {indicators.estimatedStories > 0 && (
          <p className="m-0 text-sm" data-testid="estimated-stories">
            Estimated stories: <strong className="font-bold">{indicators.estimatedStories}</strong>
          </p>
        )}

        {indicators.indicators.length > 0 && (
          <div className="m-0" data-testid="detected-issues">
            <p className="m-0 mb-2 text-sm font-semibold">Detected issues:</p>
            <ul className="m-0 pl-5 text-sm leading-relaxed">
              {indicators.indicators.map((issue, idx) => (
                <li key={idx} className="my-1">{issue}</li>
              ))}
            </ul>
          </div>
        )}

        {splitProposal !== undefined && splitProposal.proposedSpecs.length > 0 && (
          <div className="mt-1 pt-3 border-t border-warning/30" data-testid="proposed-split">
            <p className="m-0 mb-2.5 text-sm font-semibold">Proposed split:</p>
            <ul className="m-0 p-0 list-none">
              {splitProposal.proposedSpecs.map((spec, idx) => (
                <li key={idx} className="flex flex-col py-2.5 px-3 mb-2 last:mb-0 bg-base-100/50 rounded-md gap-1" data-testid="split-spec">
                  <span className="font-semibold text-sm text-warning font-mono">{spec.filename}</span>
                  <span className="text-[13px] text-base-content/60">
                    ~{spec.estimatedStories} {spec.estimatedStories === 1 ? 'story' : 'stories'}
                  </span>
                  {spec.description && (
                    <span className="text-[13px] text-base-content/70 italic">{spec.description}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex gap-2.5 flex-wrap mt-1 pt-3 border-t border-warning/30" data-testid="warning-actions">
        {splitProposal !== undefined && splitProposal.proposedSpecs.length > 0 && (
          <>
            <button
              type="button"
              className="btn btn-success"
              onClick={() => onAcceptSplit?.(splitProposal)}
              data-testid="accept-split-button"
            >
              Accept Split
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-outline"
              onClick={() => onModify?.(splitProposal)}
              data-testid="modify-button"
            >
              Modify
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn-warning btn-outline"
          onClick={() => onSkip?.()}
          data-testid="skip-button"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
