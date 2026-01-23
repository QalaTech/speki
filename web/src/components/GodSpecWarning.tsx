import type { GodSpecIndicators, SplitProposal } from '../../../src/types/index.js';

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
    <div className="flex flex-col p-4 bg-[#fff3cd] border border-[#ffc107] border-l-4 rounded-lg gap-3" data-testid="god-spec-warning">
      <div className="flex items-center gap-2.5">
        <span className="text-2xl text-[#856404]" aria-hidden="true">
          &#x26A0;
        </span>
        <h3 className="m-0 text-lg font-semibold text-[#856404]">God Spec Detected</h3>
      </div>

      <div className="flex flex-col gap-3 text-[#856404]">
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
          <div className="mt-1 pt-3 border-t border-[rgba(133,100,4,0.2)]" data-testid="proposed-split">
            <p className="m-0 mb-2.5 text-sm font-semibold">Proposed split:</p>
            <ul className="m-0 p-0 list-none">
              {splitProposal.proposedSpecs.map((spec, idx) => (
                <li key={idx} className="flex flex-col py-2.5 px-3 mb-2 last:mb-0 bg-white/50 rounded-md gap-1" data-testid="split-spec">
                  <span className="font-semibold text-sm text-[#5a4a00] font-mono">{spec.filename}</span>
                  <span className="text-[13px] text-[#666]">
                    ~{spec.estimatedStories} {spec.estimatedStories === 1 ? 'story' : 'stories'}
                  </span>
                  {spec.description && (
                    <span className="text-[13px] text-[#555] italic">{spec.description}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex gap-2.5 flex-wrap mt-1 pt-3 border-t border-[rgba(133,100,4,0.2)]" data-testid="warning-actions">
        {splitProposal !== undefined && splitProposal.proposedSpecs.length > 0 && (
          <>
            <button
              type="button"
              className="py-2 px-4 border rounded-md text-sm font-medium cursor-pointer transition-all duration-150 bg-green-600 border-green-600 text-white hover:bg-green-700 hover:border-green-800 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
              onClick={() => onAcceptSplit?.(splitProposal)}
              data-testid="accept-split-button"
            >
              Accept Split
            </button>
            <button
              type="button"
              className="py-2 px-4 border rounded-md text-sm font-medium cursor-pointer transition-all duration-150 bg-white border-gray-500 text-gray-700 hover:bg-gray-100 hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
              onClick={() => onModify?.(splitProposal)}
              data-testid="modify-button"
            >
              Modify
            </button>
          </>
        )}
        <button
          type="button"
          className="py-2 px-4 border rounded-md text-sm font-medium cursor-pointer transition-all duration-150 bg-white border-[#ffc107] text-[#856404] hover:bg-[#fff3cd] focus:outline-none focus:ring-2 focus:ring-blue-400/30"
          onClick={() => onSkip?.()}
          data-testid="skip-button"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
