import React, { useMemo } from 'react';
import './TextEffect.css';

type PresetType = 'blur' | 'shake' | 'scale' | 'fade' | 'slide' | 'bounce' | 'wave';

interface TextEffectProps {
  children: string;
  /** Animate per word, character, or line */
  per?: 'word' | 'char' | 'line';
  /** HTML element to render as */
  as?: keyof React.JSX.IntrinsicElements;
  /** Animation preset */
  preset?: PresetType;
  /** Base delay before animation starts (seconds) */
  delay?: number;
  /** Whether to trigger the animation */
  trigger?: boolean;
  /** Additional class name */
  className?: string;
  /** Class name for each segment wrapper */
  segmentWrapperClassName?: string;
  /** Callback when animation completes */
  onAnimationComplete?: () => void;
}

const defaultStaggerTimes: Record<'char' | 'word' | 'line', number> = {
  char: 0.03,
  word: 0.08,
  line: 0.15,
};

export function TextEffect({
  children,
  per = 'word',
  as: Tag = 'span',
  preset = 'fade',
  delay = 0,
  trigger = true,
  className = '',
  segmentWrapperClassName = '',
  onAnimationComplete,
}: TextEffectProps): React.ReactElement | null {
  // Split text into segments
  const segments = useMemo(() => {
    if (per === 'line') {
      return children.split('\n');
    } else if (per === 'word') {
      return children.split(/(\s+)/);
    } else {
      return children.split('');
    }
  }, [children, per]);

  const stagger = defaultStaggerTimes[per];

  // Handle animation complete
  const handleLastAnimationEnd = () => {
    onAnimationComplete?.();
  };

  if (!trigger) {
    return null;
  }

  return (
    <Tag className={`text-effect text-effect--${preset} ${className}`}>
      {segments.map((segment, index) => {
        const animationDelay = delay + index * stagger;
        const isLast = index === segments.length - 1;
        const isWhitespace = /^\s+$/.test(segment);

        // Preserve whitespace
        if (isWhitespace) {
          return (
            <span key={`space-${index}`} className="text-effect-space">
              {segment}
            </span>
          );
        }

        if (per === 'char') {
          return (
            <span
              key={`char-${index}`}
              className={`text-effect-segment text-effect-segment--${preset} ${segmentWrapperClassName}`}
              style={{ animationDelay: `${animationDelay}s` }}
              onAnimationEnd={isLast ? handleLastAnimationEnd : undefined}
            >
              {segment}
            </span>
          );
        }

        if (per === 'word') {
          return (
            <span
              key={`word-${index}`}
              className={`text-effect-segment text-effect-segment--${preset} ${segmentWrapperClassName}`}
              style={{ animationDelay: `${animationDelay}s` }}
              onAnimationEnd={isLast ? handleLastAnimationEnd : undefined}
            >
              {segment}
            </span>
          );
        }

        // per === 'line'
        return (
          <span
            key={`line-${index}`}
            className={`text-effect-segment text-effect-segment--line text-effect-segment--${preset} ${segmentWrapperClassName}`}
            style={{ animationDelay: `${animationDelay}s` }}
            onAnimationEnd={isLast ? handleLastAnimationEnd : undefined}
          >
            {segment}
          </span>
        );
      })}
    </Tag>
  );
}

export default TextEffect;
