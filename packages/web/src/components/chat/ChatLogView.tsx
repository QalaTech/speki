import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import type { ParsedEntry } from '../../utils/parseJsonl';
import {
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  CommandLineIcon,
  MagnifyingGlassIcon,
  FolderIcon,
  CpuChipIcon,
  ClipboardDocumentCheckIcon,
  WrenchScrewdriverIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  EllipsisHorizontalCircleIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import { cn } from '../../lib/utils';

interface ChatLogViewProps {
  entries: ParsedEntry[];
  isRunning?: boolean;
}

function normalizeToolName(toolName?: string): string {
  return (toolName || '').trim().toLowerCase();
}

function getToolIconComponent(toolName?: string): ComponentType<SVGProps<SVGSVGElement>> {
  const normalized = normalizeToolName(toolName);
  switch (normalized) {
    case 'read':
    case 'read_file':
      return DocumentTextIcon;
    case 'write':
    case 'edit':
    case 'write_file':
    case 'edit_file':
      return PencilSquareIcon;
    case 'bash':
    case 'run_shell_command':
    case 'shell':
      return CommandLineIcon;
    case 'grep':
    case 'search':
      return MagnifyingGlassIcon;
    case 'glob':
    case 'list_files':
      return FolderIcon;
    case 'task':
    case 'agent':
      return CpuChipIcon;
    case 'todowrite':
      return ClipboardDocumentCheckIcon;
    default:
      return WrenchScrewdriverIcon;
  }
}

function truncateMiddle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const half = Math.floor((maxLen - 3) / 2);
  return str.slice(0, half) + '...' + str.slice(-half);
}

function formatToolContent(toolName: string, content: string): { title: string; detail: string } {
  const normalized = normalizeToolName(toolName);
  switch (normalized) {
    case 'read_file':
    case 'write_file':
    case 'edit_file':
    case 'bash':
    case 'run_shell_command':
      return { title: normalized.includes('shell') || normalized === 'bash' ? 'Bash' : toolName, detail: content };
    case 'grep':
      return { title: 'Search', detail: content };
    case 'glob':
      return { title: 'Find Files', detail: content };
    case 'task':
    case 'agent':
      return { title: 'Agent', detail: content };
    default:
      return { title: toolName, detail: content };
  }
}

function toSingleLine(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

interface ResultMetaChip {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'warning';
}

interface ClampedMonoPreviewProps {
  content: string;
  className?: string;
  textClassName?: string;
}

interface ResultVisualState {
  label: string;
  statusText: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  containerClassName: string;
  iconClassName: string;
  labelClassName: string;
  chipClassName: string;
  previewTextClassName: string;
}

function getResultMetaChips(toolName: string | undefined, toolDetail: string, resultContent: string): ResultMetaChip[] {
  const chips: ResultMetaChip[] = [];
  const normalized = normalizeToolName(toolName);
  const singleLineResult = toSingleLine(resultContent);

  const exitCodeMatch = resultContent.match(/\bexit(?:\s+code)?\s*[:=]?\s*(-?\d+)\b/i);
  if (exitCodeMatch) {
    const isZero = exitCodeMatch[1] === '0';
    chips.push({
      label: 'Exit',
      value: exitCodeMatch[1],
      tone: isZero ? 'success' : 'warning',
    });
  }

  const filesChangedMatch = resultContent.match(/\b(\d+)\s+files?\s+changed\b/i);
  if (filesChangedMatch) {
    chips.push({ label: 'Files', value: filesChangedMatch[1] });
  }

  if (normalized.includes('write') || normalized.includes('edit') || normalized.includes('read')) {
    chips.push({ label: 'Path', value: truncateMiddle(toolDetail, 28) });
  }

  if (singleLineResult.length > 0) {
    chips.push({
      label: normalized.includes('bash') || normalized.includes('shell') ? 'Stdout' : 'Output',
      value: truncateMiddle(singleLineResult, 34),
    });
  }

  return chips.slice(0, 3);
}

function ClampedMonoPreview({
  content,
  className,
  textClassName,
}: ClampedMonoPreviewProps) {
  return (
    <div className={cn('relative overflow-hidden rounded-md border p-2.5', className)}>
      <div
        className={cn(
          'font-mono text-[11px] leading-5 break-all whitespace-pre-wrap pr-6 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden',
          textClassName
        )}
      >
        {content}
      </div>
    </div>
  );
}

function getResultVisualState(state: 'success' | 'error' | 'pending'): ResultVisualState {
  if (state === 'error') {
    return {
      label: 'Result',
      statusText: 'Failed',
      Icon: ExclamationTriangleIcon,
      containerClassName: 'bg-error/10 text-error border-error/35',
      iconClassName: 'text-error',
      labelClassName: 'text-error/90',
      chipClassName: 'border-error/45 bg-error/20 text-error',
      previewTextClassName: 'text-error/90',
    };
  }

  if (state === 'success') {
    return {
      label: 'Result',
      statusText: 'Success',
      Icon: CheckCircleIcon,
      containerClassName: 'bg-success/10 text-foreground border-success/35',
      iconClassName: 'text-success',
      labelClassName: 'text-success/90',
      chipClassName: 'border-success/40 bg-success/20 text-success',
      previewTextClassName: 'text-muted-foreground/90',
    };
  }

  return {
    label: 'Result',
    statusText: 'Pending',
    Icon: EllipsisHorizontalCircleIcon,
    containerClassName: 'bg-muted/45 text-foreground border-border/35',
    iconClassName: 'text-muted-foreground/85',
    labelClassName: 'text-muted-foreground/85',
    chipClassName: 'border-border/40 bg-muted/70 text-muted-foreground',
    previewTextClassName: 'text-muted-foreground/85',
  };
}

// Shared style constants for chat bubbles
const avatarBase = "w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 shadow-sm";
const bubbleBase = "py-2.5 px-3.5 rounded-2xl text-[13px] leading-relaxed shadow-sm break-words";
const rowAnimation = { animation: 'chatFadeIn 0.2s ease-out' };

export function ChatLogView({ entries, isRunning }: ChatLogViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wasNearBottomRef = useRef(true);
  const previousEntryCountRef = useRef(entries.length);
  const [hasUnseenEntries, setHasUnseenEntries] = useState(false);
  const [unseenEntriesCount, setUnseenEntriesCount] = useState(0);
  const { groupedToolResultIndexes, suppressedStandaloneResultIndexes } = useMemo(() => {
    const toolIndexesById = new Map<string, number[]>();
    entries.forEach((entry, idx) => {
      if (entry.type !== 'tool' || !entry.toolId) return;
      const indexes = toolIndexesById.get(entry.toolId) || [];
      indexes.push(idx);
      toolIndexesById.set(entry.toolId, indexes);
    });

    const matches = new Map<number, number>();
    const usedResultIndexes = new Set<number>();

    for (let idx = 0; idx < entries.length; idx += 1) {
      const entry = entries[idx];
      if ((entry.type !== 'tool_result' && entry.type !== 'error') || !entry.toolId) continue;
      const candidateTools = toolIndexesById.get(entry.toolId);
      if (!candidateTools?.length) continue;

      for (let toolPos = candidateTools.length - 1; toolPos >= 0; toolPos -= 1) {
        const toolIdx = candidateTools[toolPos];
        if (toolIdx >= idx || matches.has(toolIdx)) continue;
        matches.set(toolIdx, idx);
        usedResultIndexes.add(idx);
        break;
      }
    }

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (entry.type !== 'tool' || matches.has(i)) continue;

      for (let j = i + 1; j < entries.length; j += 1) {
        const candidate = entries[j];
        if (candidate.type === 'tool' && !entry.toolId) break;
        if (usedResultIndexes.has(j)) continue;
        if ((candidate.type === 'tool_result' || candidate.type === 'error') && (!entry.toolId || entry.toolId === candidate.toolId)) {
          matches.set(i, j);
          usedResultIndexes.add(j);
          break;
        }
      }
    }

    const suppressed = new Set<number>();
    entries.forEach((entry, idx) => {
      if ((entry.type !== 'tool_result' && entry.type !== 'error') || usedResultIndexes.has(idx) || !entry.toolId) {
        return;
      }

      if (!toolIndexesById.has(entry.toolId)) return;

      const normalized = toSingleLine(entry.content).toLowerCase();
      if (
        normalized === '' ||
        normalized === 'result received' ||
        normalized === 'output result received'
      ) {
        suppressed.add(idx);
      }
    });

    return {
      groupedToolResultIndexes: matches,
      suppressedStandaloneResultIndexes: suppressed,
    };
  }, [entries]);
  const groupedResultIndexes = useMemo(
    () => new Set(groupedToolResultIndexes.values()),
    [groupedToolResultIndexes]
  );

  const isNearBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;
    const threshold = 100;
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
    wasNearBottomRef.current = true;
    setHasUnseenEntries(false);
    setUnseenEntriesCount(0);
  }, []);

  const handleScroll = useCallback(() => {
    const nearBottom = isNearBottom();
    wasNearBottomRef.current = nearBottom;
    if (nearBottom && hasUnseenEntries) {
      setHasUnseenEntries(false);
      setUnseenEntriesCount(0);
    }
  }, [hasUnseenEntries, isNearBottom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previousCount = previousEntryCountRef.current;
    const entryDelta = entries.length - previousCount;
    const scheduleStateUpdate = (updater: () => void) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(updater);
      } else {
        updater();
      }
    };

    if (entries.length < previousCount) {
      scheduleStateUpdate(() => {
        setHasUnseenEntries(false);
        setUnseenEntriesCount(0);
      });
    }

    if (wasNearBottomRef.current) {
      container.scrollTop = container.scrollHeight;
      scheduleStateUpdate(() => {
        setHasUnseenEntries(false);
        setUnseenEntriesCount(0);
      });
    } else if (entryDelta > 0) {
      scheduleStateUpdate(() => {
        setHasUnseenEntries(true);
        setUnseenEntriesCount((prev) => prev + entryDelta);
      });
    }

    previousEntryCountRef.current = entries.length;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 gap-2">
        <ChatBubbleLeftRightIcon className="w-8 h-8 opacity-50" />
        <p className="m-0 text-sm">Waiting for activity...</p>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div
        className="flex flex-col overflow-y-auto h-full chat-scrollbar gap-3.5 p-5 bg-background"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {entries.map((entry, idx) => {
          if (groupedResultIndexes.has(idx)) {
            return null;
          }
          if (suppressedStandaloneResultIndexes.has(idx)) {
            return null;
          }

          if (entry.type === 'tool' && groupedToolResultIndexes.has(idx)) {
            const { title, detail } = formatToolContent(entry.toolName || 'Tool', entry.content);
            const ToolIcon = getToolIconComponent(entry.toolName);
            const resultIdx = groupedToolResultIndexes.get(idx);
            const resultEntry = typeof resultIdx === 'number' ? entries[resultIdx] : undefined;
            const isResultError = resultEntry?.type === 'error';
            const isResultSuccess = resultEntry?.type === 'tool_result' && resultEntry.status === 'success';
            const resultVisual = getResultVisualState(isResultError ? 'error' : isResultSuccess ? 'success' : 'pending');
            const resultChips = resultEntry
              ? getResultMetaChips(entry.toolName, detail, resultEntry.content)
              : [];

            return (
              <div
                key={idx}
                className="flex items-start gap-2 max-w-[95%] self-end flex-row-reverse"
                style={rowAnimation}
              >
                <div className="flex flex-col gap-1 min-w-[240px] max-w-full">
                  <div className="py-2.5 px-3.5 rounded-2xl rounded-br-lg bg-card text-foreground border border-secondary/25 shadow-[0_8px_24px_-20px_rgba(0,0,0,0.7)]">
                    <div className="flex items-center gap-1.5 mb-1 pb-1 border-b border-border/10">
                      <ToolIcon className="w-3.5 h-3.5 text-secondary-foreground/85 shrink-0" />
                      <span className="font-semibold text-[11px] tracking-wide text-secondary-foreground/95">{title}</span>
                      <span className="ml-auto text-[10px] font-medium tracking-wide text-muted-foreground/75">Tool call</span>
                    </div>
                    <ClampedMonoPreview
                      content={detail}
                      className="bg-muted/35 border-border/30"
                      textClassName="text-muted-foreground"
                    />
                  </div>

                  {resultEntry && (
                    <div className="pl-3 pr-1">
                      <div className={cn(
                        'py-2 px-3 rounded-xl border',
                        resultVisual.containerClassName
                      )}>
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase">
                            <resultVisual.Icon className={cn('w-3.5 h-3.5 shrink-0', resultVisual.iconClassName)} />
                            <span className={resultVisual.labelClassName}>{resultVisual.label}</span>
                            <span className={cn(
                              'ml-auto rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]',
                              resultVisual.chipClassName
                            )}>
                              {resultVisual.statusText}
                            </span>
                          </div>
                          {resultEntry.content && (
                            <ClampedMonoPreview
                              content={resultEntry.content}
                              className="mt-1.5 bg-black/10 border-white/5"
                              textClassName={cn('text-[10px]', resultVisual.previewTextClassName)}
                            />
                          )}
                          {resultChips.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {resultChips.map((chip, chipIdx) => (
                                <span
                                  key={`${idx}-meta-${chipIdx}`}
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border',
                                    chip.tone === 'success'
                                      ? 'bg-success/15 text-success border-success/25'
                                      : chip.tone === 'warning'
                                        ? 'bg-warning/15 text-warning border-warning/25'
                                        : 'bg-muted/45 text-muted-foreground border-border/25'
                                  )}
                                >
                                  <span className="font-medium">{chip.label}</span>
                                  <span className="opacity-90">{chip.value}</span>
                                </span>
                              ))}
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </div>
                <div className={cn(avatarBase, 'bg-secondary/20 border border-secondary/35 text-secondary-foreground')}>
                  <BoltIcon className="w-4 h-4" />
                </div>
              </div>
            );
          }

          const isLeft = entry.type === 'text' || entry.type === 'result';
          const isError = entry.type === 'error';

          if (isLeft) {
            return (
              <div
                key={idx}
                className="flex items-start gap-2 max-w-[95%] self-start"
                style={rowAnimation}
              >
                <div className={cn(
                  bubbleBase,
                  'bg-card text-foreground border border-border/40 rounded-bl-lg shadow-[0_8px_24px_-20px_rgba(0,0,0,0.7)]'
                )}>
                  <div className="mb-1 text-[10px] tracking-[0.09em] text-muted-foreground/80 font-semibold uppercase">
                    Speki
                  </div>
                  <div className="whitespace-pre-wrap text-[13px] leading-[1.6]">{entry.content}</div>
                </div>
              </div>
            );
          }

          if (entry.type === 'tool') {
            const { title, detail } = formatToolContent(entry.toolName || 'Tool', entry.content);
            const ToolIcon = getToolIconComponent(entry.toolName);

            return (
              <div
                key={idx}
                className="flex items-start gap-2 max-w-[95%] self-end flex-row-reverse"
                style={rowAnimation}
              >
                <div className={cn(
                  bubbleBase,
                  'rounded-br min-w-[120px]',
                  'bg-card text-foreground border border-secondary/25 shadow-[0_8px_24px_-20px_rgba(0,0,0,0.7)]'
                )}>
                  <div className="flex items-center gap-1.5 mb-1 pb-1 border-b border-border/10">
                    <ToolIcon className="w-3.5 h-3.5 text-secondary-foreground/80 shrink-0" />
                    <span className={cn(
                      'font-semibold text-[11px] tracking-wide',
                      'text-secondary-foreground/90'
                    )}>
                      {title}
                    </span>
                    <span className="ml-auto text-[10px] font-medium tracking-wide text-muted-foreground/75">Tool call</span>
                  </div>
                  <ClampedMonoPreview
                    content={detail}
                    className="bg-muted/35 border-border/30"
                    textClassName="text-muted-foreground"
                  />
                </div>
                <div className={cn(
                  avatarBase,
                  'bg-secondary/20 border border-secondary/35 text-secondary-foreground'
                )}>
                  <BoltIcon className="w-4 h-4" />
                </div>
              </div>
            );
          }

          if (entry.type === 'tool_result') {
            const isSuccess = entry.status === 'success';
            const resultVisual = getResultVisualState(isSuccess ? 'success' : 'pending');

            return (
              <div
                key={idx}
                className="flex items-start gap-2 max-w-[95%] self-end flex-row-reverse"
                style={rowAnimation}
              >
                <div className={cn(
                  bubbleBase,
                  'rounded-br text-xs',
                  'bg-card text-muted-foreground border border-border/35 shadow-[0_8px_24px_-20px_rgba(0,0,0,0.7)]',
                  isSuccess ? 'border-success/35' : 'border-border/20'
                )}>
                  <div className={cn(
                    'flex items-center gap-1.5 mb-1',
                    'text-[10px] font-semibold tracking-[0.08em] uppercase'
                  )}>
                    <resultVisual.Icon className={cn('w-3.5 h-3.5 shrink-0', resultVisual.iconClassName)} />
                    <span className={resultVisual.labelClassName}>{resultVisual.label}</span>
                    <span className={cn(
                      'ml-auto rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]',
                      resultVisual.chipClassName
                    )}>
                      {resultVisual.statusText}
                    </span>
                  </div>
                  {entry.content && (
                    <ClampedMonoPreview
                      content={entry.content}
                      className="bg-muted/35 border-border/25"
                      textClassName={cn('text-[10px]', resultVisual.previewTextClassName)}
                    />
                  )}
                </div>
                <div className={cn(
                  avatarBase,
                  'bg-secondary/20 border border-secondary/35 text-secondary-foreground'
                )}>
                  <BoltIcon className="w-4 h-4" />
                </div>
              </div>
            );
          }

          if (isError) {
            return (
              <div
                key={idx}
                className="flex items-start gap-2 max-w-[90%] self-center"
                style={rowAnimation}
              >
                <div className={cn(
                  bubbleBase,
                  'bg-error/20 text-error border border-error/30 flex items-center gap-2 py-2 px-3.5',
                  'shadow-[0_8px_24px_-20px_rgba(239,68,68,0.8)]'
                )}>
                  <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                  <span className="text-xs">{entry.content}</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={idx}
              className="flex items-start gap-2 max-w-[95%] self-start"
              style={rowAnimation}
            >
              <div className={bubbleBase}>{entry.content}</div>
            </div>
          );
        })}

        {isRunning && (
          <div
            className="flex items-start gap-2 max-w-[95%] self-start"
            style={rowAnimation}
          >
            <div className={cn(
              bubbleBase,
              'rounded-bl py-3 px-4',
              'bg-card border border-border/35'
            )}>
              <div className="text-[13px] leading-[1.6]">
                <span className="animate-text-shimmer font-medium">
                  Thinking...
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
      {hasUnseenEntries && (
        <div className="absolute bottom-4 right-4">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-primary/35 bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-md hover:border-primary/50 hover:text-primary transition-colors"
            onClick={() => scrollToBottom('smooth')}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {unseenEntriesCount} new {unseenEntriesCount === 1 ? 'event' : 'events'} · Jump to live
          </button>
        </div>
      )}
    </div>
  );
}
