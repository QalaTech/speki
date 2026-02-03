import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";
import { cn } from "../lib/utils";
import {
  ArrowPathIcon,
  BugAntIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  DocumentTextIcon,
  FolderIcon,
  FolderOpenIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SparklesIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid } from "@heroicons/react/24/solid";

type ArtifactType = "prd" | "bug" | "tech";
type ReviewState = "idle" | "running" | "done";
type PlanState = "idle" | "generating" | "ready";
type ChatRole = "assistant" | "user" | "system";

type ReviewSeverity = "critical" | "warning" | "info";

interface ArtifactSection {
  title: string;
  lines: string[];
}

interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  summary: string;
  status: "draft" | "in-review" | "active" | "completed";
  updated: string;
  sections: ArtifactSection[];
  children?: Artifact[];
}

interface ProjectWorkspace {
  id: string;
  name: string;
  updated: string;
  artifacts: Artifact[];
}

interface ReviewSuggestion {
  id: string;
  severity: ReviewSeverity;
  section: string;
  title: string;
  detail: string;
  suggestedFix: string;
}

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  kind?: "context" | "message";
}

interface PlanItem {
  id: string;
  title: string;
  summary: string;
  criteria: string[];
  estimate: string;
  status: "draft" | "in-review" | "approved";
}

const WORKSPACE_DATA: ProjectWorkspace[] = [
  {
    id: "speki",
    name: "speki",
    updated: "2h ago",
    artifacts: [
      {
        id: "prd-ai-cart",
        type: "prd",
        title: "AI Cart Recommendations",
        summary: "Lift AOV with contextual cross-sells while preserving checkout flow.",
        status: "in-review",
        updated: "Jan 29",
        sections: [
          {
            title: "Goal",
            lines: [
              "Increase AOV by 8-12% using complementary item recommendations.",
              "Keep primary checkout path unobstructed and fast.",
            ],
          },
          {
            title: "Key Scenarios",
            lines: [
              "Cold start uses category best sellers under $15.",
              "Threshold bridge prioritizes items that close free shipping gaps.",
              "Live inventory filter hides items below 10 units.",
            ],
          },
          {
            title: "Metrics",
            lines: [
              "Primary: lift in cart add-to-order rate.",
              "Secondary: cart conversion + no impact on latency.",
            ],
          },
        ],
        children: [
          {
            id: "tech-rec-ranker",
            type: "tech",
            title: "Realtime Ranker Service",
            summary: "Low-latency ranking API with configurable rules.",
            status: "draft",
            updated: "Jan 30",
            sections: [
              {
                title: "Scope",
                lines: [
                  "Ranker API with 150ms p95 budget.",
                  "Fallback tier for category bestseller feed.",
                ],
              },
            ],
          },
          {
            id: "tech-client-integration",
            type: "tech",
            title: "Client Integration Plan",
            summary: "Cart UI slot, experimentation hooks, and telemetry.",
            status: "draft",
            updated: "Jan 30",
            sections: [
              {
                title: "Checklist",
                lines: [
                  "Inline cart widget with soft-dismiss control.",
                  "Event stream for impressions and add-to-cart.",
                ],
              },
            ],
          },
        ],
      },
      {
        id: "bug-discount-misfire",
        type: "bug",
        title: "Checkout Discount Misfire",
        summary: "Promo triggers incorrectly on mixed-category carts.",
        status: "active",
        updated: "Jan 27",
        sections: [
          {
            title: "Symptoms",
            lines: [
              "Discount applies to excluded SKUs when bundles exist.",
              "Regression observed after pricing rule update.",
            ],
          },
          {
            title: "Impact",
            lines: [
              "Revenue leakage estimated at 2.4% for affected carts.",
              "Support ticket volume increased 3x.",
            ],
          },
        ],
        children: [
          {
            id: "tech-discount-fix",
            type: "tech",
            title: "Pricing Rule Patch Plan",
            summary: "Isolate exclusion checks and add integration tests.",
            status: "active",
            updated: "Jan 28",
            sections: [
              {
                title: "Fixes",
                lines: [
                  "Move exclusions before bundle merge.",
                  "Add cart-mix regression suite.",
                ],
              },
            ],
          },
        ],
      },
      {
        id: "tech-telemetry-refresh",
        type: "tech",
        title: "Telemetry Pipeline Refresh",
        summary: "Standardize analytics for spec execution telemetry.",
        status: "draft",
        updated: "Jan 24",
        sections: [
          {
            title: "Deliverables",
            lines: [
              "Event schema alignment across web + worker.",
              "Unified dashboard for PRD/tech spec coverage.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "galactic",
    name: "galactic-interstellar",
    updated: "2d ago",
    artifacts: [
      {
        id: "prd-mobile-performance",
        type: "prd",
        title: "Mobile Drawer Performance",
        summary: "Reduce jank and improve animation smoothness on iOS.",
        status: "draft",
        updated: "Jan 20",
        sections: [
          {
            title: "Goal",
            lines: [
              "Maintain 60fps on drawer open/close.",
              "Cut bundle size by 12% on mobile.",
            ],
          },
        ],
      },
    ],
  },
];

const TYPE_CONFIG: Record<
  ArtifactType,
  { label: string; icon: typeof DocumentTextIcon; badgeVariant: "info" | "error" | "secondary" }
> = {
  prd: { label: "PRD", icon: DocumentTextIcon, badgeVariant: "info" },
  bug: { label: "Bug", icon: BugAntIcon, badgeVariant: "error" },
  tech: { label: "Tech Spec", icon: WrenchScrewdriverIcon, badgeVariant: "secondary" },
};

const STATUS_DOT: Record<Artifact["status"], string> = {
  draft: "bg-muted-foreground/40",
  "in-review": "bg-warning",
  active: "bg-info",
  completed: "bg-success",
};

const REVIEW_SUGGESTIONS: ReviewSuggestion[] = [
  {
    id: "review-1",
    severity: "critical",
    section: "Goal",
    title: "Goal statement is broad",
    detail: "The goal could be tightened to include a measurable baseline and target for AOV lift.",
    suggestedFix: "Add a baseline AOV figure and target lift (ex: +8-12%) within the first 30 days.",
  },
  {
    id: "review-2",
    severity: "warning",
    section: "Key Scenarios",
    title: "Threshold bridge logic needs guardrails",
    detail: "The logic mentions closing shipping gaps but doesn't define the item price window.",
    suggestedFix: "Prioritize items priced within $5-$10 of the incentive threshold with margin score above average.",
  },
  {
    id: "review-3",
    severity: "info",
    section: "Metrics",
    title: "Add monitoring for latency impact",
    detail: "Recommend a p95 latency guardrail so recommendations don't slow checkout.",
    suggestedFix: "Add a 150ms p95 API budget and alert when exceeded.",
  },
];

const REVIEW_BADGE: Record<ReviewSeverity, { label: string; variant: "error" | "warning" | "info" }> = {
  critical: { label: "Critical", variant: "error" },
  warning: { label: "Warning", variant: "warning" },
  info: { label: "Info", variant: "info" },
};

const USER_STORIES: PlanItem[] = [
  {
    id: "US-1",
    title: "Cross-sell shelf on cart",
    summary: "As a shopper, I want relevant add-ons in my cart so I can discover complements quickly.",
    criteria: [
      "Shelf renders for carts with at least 1 item.",
      "Recommendations exclude items already in cart.",
      "Shelf does not shift primary checkout CTA.",
    ],
    estimate: "M",
    status: "draft",
  },
  {
    id: "US-2",
    title: "Threshold bridge selection",
    summary: "As a shopper, I want recommendations that help me reach free shipping without overspending.",
    criteria: [
      "If gap <= $10, prioritize items priced within that band.",
      "Prefer items with margin score above category average.",
    ],
    estimate: "S",
    status: "draft",
  },
  {
    id: "US-3",
    title: "Cold start defaults",
    summary: "As a new shopper, I want popular picks when we lack history.",
    criteria: [
      "Use category best sellers under $15.",
      "Refresh feed daily from catalog service.",
    ],
    estimate: "S",
    status: "draft",
  },
];

const TASKS: PlanItem[] = [
  {
    id: "T-1",
    title: "Add exclusion logic to pricing rule",
    summary: "Ensure excluded SKUs are filtered before bundle merge.",
    criteria: [
      "Unit tests cover mixed-category carts.",
      "Regression spec added for exclusion edge cases.",
    ],
    estimate: "S",
    status: "draft",
  },
  {
    id: "T-2",
    title: "Instrumentation + alerting",
    summary: "Track discount misfires and alert on anomaly threshold.",
    criteria: [
      "Event emitted for excluded SKUs in promo path.",
      "Alert triggers if misfire rate > 1%/day.",
    ],
    estimate: "M",
    status: "draft",
  },
];

function buildBaseChatMessages(artifactTitle: string): ChatMessage[] {
  return [
    {
      id: "context",
      role: "system",
      content: `This chat is scoped to ${artifactTitle}. Suggestions can be applied directly to the markdown pane.`,
      kind: "context",
    },
    {
      id: "assistant-intro",
      role: "assistant",
      content: "I can review this spec, propose edits, or generate follow-up tech specs.",
    },
    {
      id: "user-example",
      role: "user",
      content: "Can you review the cold-start strategy and suggest improvements?",
    },
  ];
}

interface SpecWorkspaceConceptProps {
  projectPath: string;
}

export function SpecWorkspaceConcept({ projectPath }: SpecWorkspaceConceptProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(WORKSPACE_DATA[0]?.id ?? "");
  const [selectedArtifactId, setSelectedArtifactId] = useState(WORKSPACE_DATA[0]?.artifacts[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [reviewState, setReviewState] = useState<ReviewState>("idle");
  const [reviewItems, setReviewItems] = useState<ReviewSuggestion[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState({ prd: false, bug: false, tech: false });
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [isReviewPanelOpen, setIsReviewPanelOpen] = useState(false);
  const [docView, setDocView] = useState<"spec" | "plan">("spec");
  const [planState, setPlanState] = useState<PlanState>("idle");
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);

  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewAnchorRef = useRef<HTMLDivElement>(null);
  const planTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedProject = useMemo(
    () => WORKSPACE_DATA.find((project) => project.id === selectedProjectId) ?? WORKSPACE_DATA[0],
    [selectedProjectId]
  );

  useEffect(() => {
    if (!selectedProject?.artifacts?.length) return;
    const defaultArtifact =
      selectedProject.artifacts.find((artifact) => artifact.type === "prd") ?? selectedProject.artifacts[0];
    setSelectedArtifactId(defaultArtifact.id);
    setCollapsedProjects((prev) => ({ ...prev, [selectedProject.id]: false }));
  }, [selectedProject?.id]);

  const selectedArtifact = useMemo(() => {
    const artifacts = selectedProject?.artifacts ?? [];
    const directMatch = artifacts.find((artifact) => artifact.id === selectedArtifactId);
    if (directMatch) return directMatch;
    for (const artifact of artifacts) {
      const childMatch = artifact.children?.find((child) => child.id === selectedArtifactId);
      if (childMatch) return childMatch;
    }
    return artifacts[0];
  }, [selectedProject, selectedArtifactId]);

  useEffect(() => {
    if (!selectedArtifact) return;
    setChatMessages(buildBaseChatMessages(selectedArtifact.title));
    setReviewState("idle");
    setReviewItems([]);
    setDocView("spec");
    setPlanState("idle");
    setPlanItems([]);
    if (reviewTimerRef.current) {
      clearTimeout(reviewTimerRef.current);
      reviewTimerRef.current = null;
    }
    if (planTimerRef.current) {
      clearTimeout(planTimerRef.current);
      planTimerRef.current = null;
    }
  }, [selectedArtifact?.id]);

  useEffect(() => {
    return () => {
      if (reviewTimerRef.current) {
        clearTimeout(reviewTimerRef.current);
      }
      if (planTimerRef.current) {
        clearTimeout(planTimerRef.current);
      }
    };
  }, []);

  const searchValue = search.trim().toLowerCase();

  const matchesSearch = (artifact: Artifact) => {
    if (!searchValue) return true;
    return (
      artifact.title.toLowerCase().includes(searchValue) ||
      artifact.summary.toLowerCase().includes(searchValue)
    );
  };

  const handleAskSpeki = () => {
    if (reviewState === "running") return;
    setReviewState("running");
    setReviewItems([]);
    setIsReviewPanelOpen(true);

    if (reviewTimerRef.current) {
      clearTimeout(reviewTimerRef.current);
    }

    reviewTimerRef.current = setTimeout(() => {
      setReviewItems(REVIEW_SUGGESTIONS);
      setReviewState("done");
      setChatMessages((prev) => [
        ...prev,
        {
          id: `review-${Date.now()}`,
          role: "assistant",
          content: `Review complete. I found ${REVIEW_SUGGESTIONS.length} opportunities to tighten the spec.`,
        },
      ]);
      requestAnimationFrame(() => {
        reviewAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }, 800);
  };

  const handlePlanGenerate = () => {
    setDocView("plan");
    if (planState === "ready") return;
    setPlanState("generating");
    setPlanItems([]);
    if (planTimerRef.current) {
      clearTimeout(planTimerRef.current);
    }
    planTimerRef.current = setTimeout(() => {
      const items = selectedArtifact?.type === "prd" ? USER_STORIES : TASKS;
      setPlanItems(items);
      setPlanState("ready");
    }, 700);
  };

  const toggleGroup = (group: "prd" | "bug" | "tech") => {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const toggleProject = (projectId: string) => {
    setCollapsedProjects((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const renderTreeItem = (artifact: Artifact, projectId: string, isChild = false, dimmed = false) => {
    const Icon = TYPE_CONFIG[artifact.type].icon;
    const isSelected = artifact.id === selectedArtifact?.id && projectId === selectedProject?.id;
    return (
      <button
        key={artifact.id}
        onClick={() => {
          setSelectedProjectId(projectId);
          setSelectedArtifactId(artifact.id);
        }}
        className={cn(
          "group w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all duration-200",
          isSelected ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-card/50",
          isChild && "ml-4",
          dimmed && "opacity-70"
        )}
      >
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md border",
            isSelected ? "border-primary/40 bg-primary/10" : "border-border/40 bg-muted/40"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-foreground/90">{artifact.title}</span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[artifact.status])} />
            {artifact.updated}
          </span>
        </div>
      </button>
    );
  };

  const renderGroup = (label: string, items: Artifact[], groupKey: "prd" | "bug" | "tech", projectId: string) => {
    const visibleItems = items.filter(
      (artifact) => matchesSearch(artifact) || (artifact.children ?? []).some(matchesSearch)
    );

    if (visibleItems.length === 0) return null;

    const isCollapsed = collapsedGroups[groupKey];

    return (
      <div className="space-y-2">
        <button
          onClick={() => toggleGroup(groupKey)}
          className="flex w-full items-center justify-between rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            <ChevronDownIcon className={cn("h-3.5 w-3.5 transition-transform", isCollapsed && "-rotate-90")} />
            {isCollapsed ? (
              <FolderIcon className="h-3.5 w-3.5" />
            ) : (
              <FolderOpenIcon className="h-3.5 w-3.5" />
            )}
            {label}
          </span>
          <Badge variant="ghost" size="xs">
            {visibleItems.length}
          </Badge>
        </button>
        {!isCollapsed && (
          <div className="space-y-2 pl-4">
            {visibleItems.map((artifact) => {
              const visibleChildren = (artifact.children ?? []).filter(matchesSearch);
              const hasVisibleChildren = visibleChildren.length > 0;
              const dimmed = !matchesSearch(artifact) && hasVisibleChildren;

              return (
                <div key={artifact.id} className="space-y-2">
                  {renderTreeItem(artifact, projectId, false, dimmed)}
                  {hasVisibleChildren && (
                    <div className="ml-3 border-l border-border/40 pl-2 space-y-2">
                      {visibleChildren.map((child) => renderTreeItem(child, projectId, true))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderReviewBody = () => {
    if (reviewState === "idle") {
      return (
        <div className="rounded-xl border border-border/40 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          Run a review to generate suggestions you can apply or discuss.
        </div>
      );
    }

    if (reviewState === "running") {
      return (
        <div className="space-y-2">
          <div className="h-3 w-4/5 rounded-full bg-muted/50 animate-pulse" />
          <div className="h-3 w-full rounded-full bg-muted/50 animate-pulse" />
          <div className="h-3 w-2/3 rounded-full bg-muted/50 animate-pulse" />
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {reviewItems.map((item) => (
          <div key={item.id} className="rounded-xl border border-border/40 bg-background/40 px-3 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={REVIEW_BADGE[item.severity].variant} size="xs">
                  {REVIEW_BADGE[item.severity].label}
                </Badge>
                <span className="text-[11px] text-muted-foreground">{item.section}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">{item.title}</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{item.detail}</p>
            <p className="text-xs text-muted-foreground">Suggested fix: {item.suggestedFix}</p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm">
                Apply change
              </Button>
              <Button variant="ghost" size="sm">
                Discuss
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const planCtaLabel = selectedArtifact?.type === "prd" ? "Create User Stories" : "Create Tasks";
  const planCtaSubtitle =
    selectedArtifact?.type === "prd"
      ? "Break down this PRD into actionable user stories."
      : "Decompose this spec into implementation tasks.";
  const planTitle = selectedArtifact?.type === "prd" ? "User Stories" : "Tasks";
  const planEmptyTitle = selectedArtifact?.type === "prd" ? "No stories yet" : "No tasks yet";
  const planEmptySubtitle =
    selectedArtifact?.type === "prd"
      ? "Generate user stories so you can review and refine before creating tech specs."
      : "Generate tasks so you can review and refine before execution.";

  const reviewButtonLabel = reviewState === "running" ? "Reviewing" : reviewState === "done" ? "Rerun Review" : "Ask Speki";

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_45%)]" />
      <div className="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />

      <div className="relative flex h-full w-full">
        {/* Unified Sidebar */}
        <aside className="w-72 shrink-0 border-r border-border/40 bg-card/70 backdrop-blur-xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-4 border-b border-border/40">
            <div>
              <h2 className="m-0 text-sm font-semibold text-foreground">Threads</h2>
              <p className="m-0 text-[11px] text-muted-foreground">Projects + workspace tree</p>
            </div>
            <Button variant="outline" size="sm" className="h-8 w-8 rounded-lg p-0">
              <PlusIcon className="h-4 w-4" />
            </Button>
          </div>

          <div className="px-4 pt-3 pb-2 border-b border-border/40">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search specs..."
                inputSize="sm"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
            {WORKSPACE_DATA.map((project) => {
              const prdItems = project.artifacts.filter((artifact) => artifact.type === "prd");
              const bugItems = project.artifacts.filter((artifact) => artifact.type === "bug");
              const techItems = project.artifacts.filter((artifact) => artifact.type === "tech");
              const isCollapsed = collapsedProjects[project.id] ?? project.id !== selectedProject?.id;
              const isSelected = project.id === selectedProject?.id;

              return (
                <div key={project.id} className="space-y-3">
                  <button
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      toggleProject(project.id);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2 py-1.5 transition-all duration-200",
                      isSelected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDownIcon className={cn("h-4 w-4 transition-transform", isCollapsed && "-rotate-90")} />
                      {isCollapsed ? (
                        <FolderIcon className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <FolderOpenIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-semibold text-foreground/90">{project.name}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{project.updated}</span>
                  </button>

                  {!isCollapsed && (
                    <div className="ml-4 space-y-4">
                      {renderGroup("PRDs", prdItems, "prd", project.id)}
                      {renderGroup("Bugs", bugItems, "bug", project.id)}
                      {renderGroup("Tech Specs", techItems, "tech", project.id)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-border/40 px-4 py-3 text-[11px] text-muted-foreground">
            Connected to: <span className="text-foreground/80">{projectPath}</span>
          </div>
        </aside>

        {/* Workspace */}
        <section className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-card/60 backdrop-blur-xl">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{selectedProject?.name}</span>
                <ChevronRightIcon className="h-4 w-4" />
                <span className="text-muted-foreground">PRDs & Specs</span>
              </div>
              <h1 className="m-0 mt-1 text-xl font-semibold text-foreground">
                {selectedArtifact?.title ?? "Select an artifact"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" isLoading={reviewState === "running"} onClick={handleAskSpeki}>
                <SparklesIcon className="h-4 w-4" />
                {reviewButtonLabel}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReviewPanelOpen((prev) => !prev)}
              >
                <ChatBubbleLeftRightIcon className="h-4 w-4" />
                {isReviewPanelOpen ? "Hide Review" : "Review Notes"}
              </Button>
            </div>
          </header>

          <div
            className={cn(
              "flex-1 grid gap-4 p-5 min-h-0",
              isReviewPanelOpen ? "grid-cols-[1.1fr_0.75fr_0.45fr]" : "grid-cols-[1.15fr_0.85fr]"
            )}
          >
            {/* Document Pane */}
            <div className="flex flex-col min-h-0 rounded-2xl border border-border/50 bg-card/70 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
                <div className="flex items-center gap-3">
                  {selectedArtifact?.type ? (
                    <Badge variant={TYPE_CONFIG[selectedArtifact.type].badgeVariant} size="sm">
                      {TYPE_CONFIG[selectedArtifact.type].label}
                    </Badge>
                  ) : null}
                  <div className="flex items-center gap-2 rounded-full bg-muted/50 p-1 ring-1 ring-border/50">
                    <span className="pl-1 pr-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      View
                    </span>
                    <button
                      onClick={() => setDocView("spec")}
                      className={cn(
                        "px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors",
                        docView === "spec" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Spec
                    </button>
                    <button
                      onClick={() => {
                        setDocView("plan");
                        if (planState === "idle") {
                          handlePlanGenerate();
                        }
                      }}
                      className={cn(
                        "px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors",
                        docView === "plan" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {selectedArtifact?.type === "prd" ? "Stories" : "Tasks"}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="ghost" size="sm">
                    {selectedArtifact?.status.replace("-", " ") ?? "draft"}
                  </Badge>
                  <Button variant="ghost" size="sm">
                    Edit
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                {docView === "spec" ? (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-border/40 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                      Parent-child view keeps PRDs + Bugs at the top, with Tech Specs nested underneath. Chat stays attached to the
                      selected artifact so you can review and edit without leaving context.
                    </div>
                    {selectedArtifact?.sections.map((section) => (
                      <div key={section.title} className="space-y-2">
                        <h3 className="m-0 text-sm font-semibold text-foreground">{section.title}</h3>
                        <ul className="m-0 space-y-1 text-sm text-muted-foreground">
                          {section.lines.map((line) => (
                            <li key={line} className="leading-relaxed">
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Plan</p>
                        <p className="m-0 text-sm font-semibold text-foreground">{planTitle}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="ghost" size="sm">
                          {planItems.length}
                        </Badge>
                        <Button variant="outline" size="sm" onClick={handlePlanGenerate}>
                          {planState === "ready" ? "Regenerate" : planCtaLabel}
                        </Button>
                        <Button variant="secondary" size="sm">
                          <PlusIcon className="h-4 w-4" />
                          Add
                        </Button>
                      </div>
                    </div>

                    {planState === "idle" && (
                      <div className="rounded-xl border border-border/40 bg-muted/30 px-6 py-8 text-center text-muted-foreground min-h-[220px] flex flex-col items-center justify-center gap-3">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
                          <SparklesIcon className="h-5 w-5 text-primary" />
                        </span>
                        <div>
                          <p className="m-0 text-sm font-semibold text-foreground">{planEmptyTitle}</p>
                          <p className="m-0 mt-1 text-xs text-muted-foreground">{planEmptySubtitle}</p>
                        </div>
                        <Button variant="secondary" size="sm" onClick={handlePlanGenerate}>
                          {planCtaLabel}
                        </Button>
                      </div>
                    )}

                    {planState === "generating" && (
                      <div className="rounded-xl border border-border/40 bg-muted/30 px-4 py-4 space-y-3">
                        <div className="h-3 w-4/5 rounded-full bg-muted/50 animate-pulse" />
                        <div className="h-3 w-full rounded-full bg-muted/50 animate-pulse" />
                        <div className="h-3 w-2/3 rounded-full bg-muted/50 animate-pulse" />
                      </div>
                    )}

                    {planState === "ready" && (
                      <div className="space-y-3">
                        {planItems.map((item) => (
                          <div key={item.id} className="rounded-xl border border-border/40 bg-background/40 px-4 py-3 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <Badge variant="ghost" size="xs">
                                  {item.id}
                                </Badge>
                                <span className="truncate text-sm font-semibold text-foreground">{item.title}</span>
                              </div>
                              <Badge variant="ghost" size="xs">
                                {item.estimate}
                              </Badge>
                            </div>
                            <p className="m-0 text-xs text-muted-foreground">{item.summary}</p>
                            <ul className="m-0 space-y-1 text-xs text-muted-foreground">
                              {item.criteria.map((criterion) => (
                                <li key={criterion}>• {criterion}</li>
                              ))}
                            </ul>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="sm">
                                Edit
                              </Button>
                              <Button variant="secondary" size="sm">
                                Approve
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {docView === "spec" && (
                <div className="px-5 pb-4">
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 border border-primary/20">
                        <SparklesIcon className="h-4 w-4 text-primary" />
                      </span>
                      <div>
                        <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-primary/80">Next step</p>
                        <p className="m-0 text-sm font-semibold text-foreground">{planCtaLabel}</p>
                        <p className="m-0 text-[11px] text-muted-foreground">{planCtaSubtitle}</p>
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={handlePlanGenerate}>
                      {planCtaLabel}
                    </Button>
                  </div>
                </div>
              )}
              <div className="border-t border-border/40 px-5 py-4 flex items-center justify-between bg-card/90">
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <ClockIcon className="h-4 w-4" />
                  Last updated {selectedArtifact?.updated ?? "—"}
                </div>
                <Button variant="primary" size="sm">
                  Generate Tech Spec
                </Button>
              </div>
            </div>

            {/* Chat Pane */}
            <div className="flex flex-col min-h-0 rounded-2xl border border-border/50 bg-card/70 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                    <ChatBubbleLeftRightIconSolid className="h-4 w-4 text-primary" />
                  </span>
                  <div>
                    <p className="m-0 text-sm font-semibold text-foreground">Spec Chat</p>
                    <p className="m-0 text-[11px] text-muted-foreground">Feedback, review, and iteration</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  New session
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {chatMessages.map((message) => {
                  if (message.kind === "context") {
                    return (
                      <div
                        key={message.id}
                        className="rounded-xl border border-border/40 bg-muted/30 px-4 py-3 text-xs text-muted-foreground"
                      >
                        {message.content}
                      </div>
                    );
                  }

                  const isUser = message.role === "user";

                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                        isUser
                          ? "ml-auto rounded-br-md bg-primary/20 text-foreground"
                          : "rounded-bl-md bg-muted/60 text-foreground"
                      )}
                    >
                      {message.content}
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-border/40 px-5 py-4">
                <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                  <ChatBubbleLeftRightIcon className="h-4 w-4 text-muted-foreground" />
                  <input
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    placeholder="Ask for feedback, edits, or a new tech spec..."
                  />
                  <Button variant="primary" size="sm">
                    Send
                  </Button>
                </div>
              </div>
            </div>

            {isReviewPanelOpen && (
              <div className="flex flex-col min-h-0 rounded-2xl border border-border/50 bg-card/70 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
                <div className="flex items-center justify-between px-4 py-4 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                      {reviewState === "running" ? (
                        <ArrowPathIcon className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <SparklesIcon className="h-4 w-4 text-primary" />
                      )}
                    </span>
                    <div>
                      <p className="m-0 text-sm font-semibold text-foreground">Review Notes</p>
                      <p className="m-0 text-[11px] text-muted-foreground">
                        {reviewState === "running" ? "Reviewing the selected artifact" : "Suggestions and fixes"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={reviewState === "running" ? "ghost" : "info"} size="xs">
                    {reviewState === "running" ? "Running" : `${reviewItems.length} suggestions`}
                  </Badge>
                </div>
                <div ref={reviewAnchorRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {renderReviewBody()}
                </div>
              </div>
            )}
          </div>

          {/* Relationship Bar */}
          <div className="border-t border-border/40 bg-card/60 px-6 py-3 text-xs text-muted-foreground flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpenIcon className="h-4 w-4" />
              Unified sidebar mirrors Codex: Project → PRDs/Bugs/Tech Specs → child specs.
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <SparklesIcon className="h-4 w-4" />
              Review suggestions can live inline or in a dedicated side panel.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
