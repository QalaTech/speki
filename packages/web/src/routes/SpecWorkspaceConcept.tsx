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
  DocumentTextIcon,
  FolderIcon,
  FolderOpenIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SparklesIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
  CheckCircleIcon,
  PlayIcon,
  ClockIcon,
  CommandLineIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";

type ArtifactType = "prd" | "bug" | "tech";
type ReviewState = "idle" | "running" | "done";
type ChatRole = "assistant" | "user" | "system";

type ReviewSeverity = "critical" | "warning" | "info";
type PlanState = "idle" | "generating" | "ready";

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

interface SpecWorkspaceConceptProps {
  projectPath: string;
}

export function SpecWorkspaceConcept({ projectPath }: SpecWorkspaceConceptProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(WORKSPACE_DATA[0]?.id ?? "");
  const [selectedArtifactId, setSelectedArtifactId] = useState(WORKSPACE_DATA[0]?.artifacts[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [reviewState, setReviewState] = useState<ReviewState>("idle");
  const [reviewItems, setReviewItems] = useState<ReviewSuggestion[]>([]);
  
  const [collapsedGroups, setCollapsedGroups] = useState({ prd: false, bug: false, tech: false });
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  
  // Right Panel State
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(true);
  const [contextTab, setContextTab] = useState<"plan" | "chat">("plan");
  
  const [planState, setPlanState] = useState<PlanState>("idle");
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);

  // Simulation State for Inline Diffs
  const [activeDiffId, setActiveDiffId] = useState<string | null>(null);

  // Chat State
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const reviewTimerRef = useRef<number | null>(null);
  const planTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Reset when artifact changes
  useEffect(() => {
    if (!selectedArtifact) return;
    setReviewState("idle");
    setReviewItems([]);
    setPlanState("idle");
    setPlanItems([]);
    setActiveDiffId(null);
    setContextTab("plan");
    
    // Auto-generate items for demo if changing artifacts
    const items = selectedArtifact?.type === "prd" ? USER_STORIES : TASKS;
    setPlanItems(items); 
    setPlanState("ready");
    
    // Reset Chat
    setChatMessages([
        {
          id: 'intro',
          role: 'assistant',
          content: `Checking ${selectedArtifact.title}. How can I help?`
        }
    ]);

  }, [selectedArtifact?.id]);
  
  // Scroll chat to bottom
  useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, contextTab]);


  const toggleGroup = (group: "prd" | "bug" | "tech") => {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const toggleProject = (projectId: string) => {
    setCollapsedProjects((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const handleAskSpeki = () => {
    // Switch to Chat tab
    setContextTab("chat");
    setIsContextPanelOpen(true);
    
    // Add "Reviewing" message
    setChatMessages(prev => [
        ...prev, 
        { id: `u-${Date.now()}`, role: 'user', content: "Review this spec for me." },
        { id: `a-${Date.now()}`, role: 'assistant', content: "Running a review scan..." }
    ]);
    
    if (reviewState === "running") return;
    setReviewState("running");
    setReviewItems([]);
    
    if (reviewTimerRef.current) window.clearTimeout(reviewTimerRef.current);

    reviewTimerRef.current = window.setTimeout(() => {
      setReviewItems(REVIEW_SUGGESTIONS);
      setReviewState("done");
      setChatMessages(prev => [
          ...prev, 
          { id: `a-${Date.now()}`, role: 'assistant', content: `Review complete. I found ${REVIEW_SUGGESTIONS.length} suggestions inside the doc.` }
      ]);
    }, 1500);
  };

  const handleSendMessage = () => {
      if (!chatInput.trim()) return;
      const msg = chatInput;
      setChatInput("");
      setChatMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: msg }]);
      
      setTimeout(() => {
          setChatMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: "I'm just a demo concept right now, but I'd totally help you with that!" }]);
      }, 600);
  };

  const handlePlanGenerate = () => {
    if (planState === "ready") return;
    setPlanState("generating");
    setPlanItems([]);
    if (planTimerRef.current) window.clearTimeout(planTimerRef.current);
    
    planTimerRef.current = setTimeout(() => {
      const items = selectedArtifact?.type === "prd" ? USER_STORIES : TASKS;
      setPlanItems(items);
      setPlanState("ready");
    }, 800);
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
          "group w-full flex items-center gap-2 rounded-md px-2 py-1 text-left transition-all duration-200",
          isSelected ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
          isChild && "ml-4",
          dimmed && "opacity-70"
        )}
      >
        <span className="flex h-4 w-4 items-center justify-center">
          <Icon className="h-4 w-4" />
        </span>
        <span className="truncate text-[13px] font-medium">{artifact.title}</span>
      </button>
    );
  };

  const searchValue = search.trim().toLowerCase();
  const matchesSearch = (artifact: Artifact) => {
    if (!searchValue) return true;
    return (
      artifact.title.toLowerCase().includes(searchValue) ||
      artifact.summary.toLowerCase().includes(searchValue)
    );
  };

  const renderGroup = (label: string, items: Artifact[], groupKey: "prd" | "bug" | "tech", projectId: string) => {
    const visibleItems = items.filter(
      (artifact) => matchesSearch(artifact) || (artifact.children ?? []).some(matchesSearch)
    );
    if (visibleItems.length === 0) return null;
    const isCollapsed = collapsedGroups[groupKey];

    return (
      <div className="space-y-1">
        <button
          onClick={() => toggleGroup(groupKey)}
          className="flex w-full items-center gap-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDownIcon className={cn("h-3 w-3 transition-transform", isCollapsed && "-rotate-90")} />
          {label}
        </button>
        {!isCollapsed && (
          <div className="space-y-0.5 pl-2">
            {visibleItems.map((artifact) => {
              const visibleChildren = (artifact.children ?? []).filter(matchesSearch);
              const hasVisibleChildren = visibleChildren.length > 0;
              const dimmed = !matchesSearch(artifact) && hasVisibleChildren;
              return (
                <div key={artifact.id} className="space-y-0.5">
                  {renderTreeItem(artifact, projectId, false, dimmed)}
                  {hasVisibleChildren && (
                    <div className="ml-3 border-l border-border/40 pl-2 space-y-0.5">
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

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground font-sans">
      {/* LEFT SIDEBAR: Navigation */}
      <aside className="w-64 shrink-0 border-r border-border bg-card/50 flex flex-col">
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-6 w-6 rounded-md bg-primary/20 flex items-center justify-center">
              <CommandLineIcon className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Speki Workspace</span>
          </div>
          <Input 
            placeholder="Filter..." 
            className="h-8 text-xs bg-background/50 border-transparent focus:border-primary/20 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {WORKSPACE_DATA.map((project) => {
            const prdItems = project.artifacts.filter((artifact) => artifact.type === "prd");
            const bugItems = project.artifacts.filter((artifact) => artifact.type === "bug");
            const techItems = project.artifacts.filter((artifact) => artifact.type === "tech");
            return (
              <div key={project.id} className="space-y-2">
                 <div className="px-2 text-xs font-bold text-muted-foreground uppercase">{project.name}</div>
                 {renderGroup("PRDs", prdItems, "prd", project.id)}
                 {renderGroup("Bugs", bugItems, "bug", project.id)}
                 {renderGroup("Tech Specs", techItems, "tech", project.id)}
              </div>
            )
          })}
        </div>
      </aside>

      {/* CENTER: Editor Area */}
      <main className="flex-1 min-w-0 flex flex-col bg-background relative z-10 transition-all duration-300">
        {/* Header */}
        <header className="h-14 shrink-0 border-b border-border flex items-center justify-between px-6 bg-background/80 backdrop-blur-sm sticky top-0 z-20">
          <div className="flex items-center gap-3">
             <div className="p-1.5 rounded-md bg-muted text-muted-foreground">
                <DocumentTextIcon className="h-4 w-4" />
             </div>
             <div>
                <h1 className="text-sm font-semibold m-0">{selectedArtifact?.title}</h1>
                <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                   <span>{selectedArtifact?.status}</span>
                   <span className="w-1 h-1 rounded-full bg-border" />
                   <span>Edited {selectedArtifact?.updated}</span>
                </div>
             </div>
          </div>

          <div className="flex items-center gap-2">
            <Button 
                variant="ghost" 
                size="sm" 
                className={cn("h-8 gap-2", reviewState === "done" && "text-primary bg-primary/10")}
                onClick={handleAskSpeki}
                isLoading={reviewState === "running"}
            >
               <SparklesIcon className="h-4 w-4" />
               {reviewState === "idle" ? "Review Spec" : reviewState === "running" ? "Reviewing..." : "Review Complete"}
            </Button>
            
            <div className="h-4 w-px bg-border mx-2" />
            
            <Button 
                variant="secondary" 
                size="sm" 
                className="h-8 gap-2"
                onClick={() => setIsContextPanelOpen(!isContextPanelOpen)}
            >
               {isContextPanelOpen ? (
                 <ChevronRightIcon className="h-4 w-4" />
               ) : (
                 <ChevronDownIcon className="h-4 w-4 -rotate-90" />
               )}
               {isContextPanelOpen ? "Close Panel" : "Show Panel"}
            </Button>
          </div>
        </header>

        {/* Content / Editor Mock */}
        <div className="flex-1 overflow-y-auto p-8 max-w-3xl mx-auto w-full">
           <div className="prose prose-sm prose-invert max-w-none space-y-8 pb-20">
              
              {/* Doc Sections */}
              {selectedArtifact?.sections.map((section, idx) => {
                 // Check for relevant review suggestion for this section (Simulation)
                 const suggestions = reviewItems.filter(r => r.section === section.title);
                 
                 return (
                   <div key={idx} className="group relative">
                      <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                        {section.title}
                        {suggestions.length > 0 && (
                          <span 
                             className="cursor-pointer inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-warning/20 text-warning text-[10px] font-bold ring-1 ring-warning/30 hover:bg-warning/30 transition-colors"
                             onClick={() => setActiveDiffId(suggestions[0].id === activeDiffId ? null : suggestions[0].id)}
                          >
                             {suggestions.length} suggestion{suggestions.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </h2>

                      <div className="pl-4 border-l-2 border-border/50 space-y-2">
                         {section.lines.map((line, lIdx) => (
                           <p key={lIdx} className="text-foreground/80 leading-relaxed">{line}</p>
                         ))}
                      </div>

                      {/* INLINE DIFF COMPONENT (Simulated) */}
                      {suggestions.map(suggestion => (
                         <div 
                            key={suggestion.id}
                            className={cn(
                              "mt-4 overflow-hidden transition-all duration-300 ease-in-out border rounded-lg",
                              activeDiffId === suggestion.id ? "max-h-96 opacity-100 border-warning/30 bg-warning/5" : "max-h-0 opacity-0 border-transparent"
                            )}
                         >
                            <div className="p-3 bg-card">
                               <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="warning" size="xs">Suggestion</Badge>
                                  <span className="text-xs font-medium text-muted-foreground">Speki Bot</span>
                               </div>
                               
                               <div className="space-y-2 text-sm">
                                  <div className="p-2 bg-background/50 rounded text-muted-foreground line-through decoration-error/50 decoration-2">
                                     {section.lines[0]} {/* Simulating deletion of first line roughly */}
                                  </div>
                                  <div className="p-2 bg-success/10 rounded text-success-foreground border border-success/20">
                                     {suggestion.suggestedFix}
                                  </div>
                               </div>

                               <div className="mt-3 flex items-center gap-2 justify-end">
                                  <Button size="sm" variant="ghost" className="h-7 text-xs">Dismiss</Button>
                                  <Button size="sm" variant="primary" className="h-7 text-xs">Accept Change</Button>
                               </div>
                            </div>
                         </div>
                      ))}
                   </div>
                 )
              })}

              <div className="pt-8 opacity-50 text-xs text-center text-muted-foreground">
                 --- End of Document ---
              </div>
           </div>
        </div>
      </main>

      {/* RIGHT PANEL: Stories/Plan Context */}
      <aside 
        className={cn(
          "shrink-0 bg-card border-l border-border transition-all duration-300 ease-in-out flex flex-col",
          isContextPanelOpen ? "w-[380px] opacity-100 translate-x-0" : "w-0 opacity-0 translate-x-10"
        )}
      >
         {/* TABS HEADER */}
         <div className="h-14 shrink-0 flex items-center px-4 border-b border-border gap-6">
            <button
               onClick={() => setContextTab("plan")}
               className={cn(
                  "h-full relative flex items-center gap-2 text-xs font-medium transition-colors border-b-2",
                  contextTab === "plan" ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"
               )}
            >
               <SparklesIcon className="h-4 w-4" />
               Generated Plan
            </button>
            <button
               onClick={() => setContextTab("chat")}
               className={cn(
                  "h-full relative flex items-center gap-2 text-xs font-medium transition-colors border-b-2",
                  contextTab === "chat" ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"
               )}
            >
               <ChatBubbleLeftRightIcon className="h-4 w-4" />
               Assistant
            </button>
         </div>

         {/* PANEL CONTENT */}
         <div className="flex-1 overflow-hidden relative">
            
            {/* PLAN TAB */}
            <div className={cn(
                "absolute inset-0 overflow-y-auto p-4 space-y-4 transition-opacity duration-200",
                contextTab === "plan" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
            )}>
                {planState === "idle" && (
                   <div className="text-center py-10 text-muted-foreground text-sm">
                       <Button size="sm" variant="secondary" onClick={handlePlanGenerate} className="h-8 gap-2">
                           Start Planning
                       </Button>
                   </div>
                )}

                {planState === "generating" && (
                    <div className="space-y-4 animate-pulse">
                       {[1,2,3].map(i => (
                         <div key={i} className="h-24 rounded-lg bg-muted/50 border border-border/50" />
                       ))}
                    </div>
                )}

                {planState === "ready" && planItems.length === 0 && (
                   <div className="text-center py-10 text-muted-foreground text-sm">
                      <SparklesIcon className="h-8 w-8 mx-auto mb-3 opacity-20" />
                      <p>No plan items yet.</p>
                      <Button variant="link" onClick={handlePlanGenerate}>Generate Initial Plan</Button>
                   </div>
                )}

                {planState === "ready" && planItems.map(item => (
                    <div key={item.id} className="group p-3 rounded-lg border border-border bg-background hover:bg-muted/30 transition-all cursor-pointer">
                       <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-4 h-4 rounded-full flex items-center justify-center border",
                                  item.status === 'approved' ? "bg-success border-success text-success-foreground" :
                                  "border-muted-foreground/40 text-transparent"
                              )}>
                              {item.status === 'approved' && <CheckCircleIcon className="w-3 h-3" />}
                            </div>
                            <span className="font-medium text-sm text-foreground/90">{item.title}</span>
                          </div>
                          <Badge variant="outline" size="xs" className="text-[10px] h-5">{item.estimate}</Badge>
                       </div>
                       
                       <p className="text-xs text-muted-foreground pl-6 mb-3 line-clamp-2 leading-relaxed">
                          {item.summary}
                       </p>

                       {/* Tasks / Criteria Preview */}
                       <div className="pl-6 space-y-1">
                          {item.criteria.slice(0, 2).map((c, i) => (
                             <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                                <span className="w-1 h-1 rounded-full bg-border" />
                                <span className="truncate">{c}</span>
                             </div>
                          ))}
                          {item.criteria.length > 2 && (
                             <span className="text-[10px] text-muted-foreground/60 pl-2.5">+{item.criteria.length - 2} more criteria</span>
                          )}
                       </div>
                    </div>
                ))}
            </div>

            {/* CHAT TAB */}
            <div className={cn(
                "absolute inset-0 flex flex-col transition-opacity duration-200",
                contextTab === "chat" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
            )}>
               <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatMessages.map(msg => (
                      <div key={msg.id} className={cn("flex gap-3 text-sm", msg.role === 'user' ? "flex-row-reverse" : "")}>
                          <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                              msg.role === 'assistant' ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                          )}>
                              {msg.role === 'assistant' ? <SparklesIcon className="w-4 h-4"/> : <div className="text-xs font-bold">You</div>}
                          </div>
                          <div className={cn(
                              "p-3 rounded-2xl max-w-[85%] leading-relaxed",
                              msg.role === 'user' ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted/50 text-foreground rounded-tl-sm"
                          )}>
                              {msg.content}
                          </div>
                      </div>
                  ))}
                  <div ref={messagesEndRef} />
               </div>

               <div className="p-3 border-t border-border bg-background">
                  <div className="relative">
                      <Input 
                        placeholder="Type a message..." 
                        className="pr-10" 
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                      />
                      <button 
                         onClick={handleSendMessage}
                         className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-primary hover:bg-primary/10 rounded-md transition-colors"
                      >
                         <PaperAirplaneIcon className="w-4 h-4" />
                      </button>
                  </div>
               </div>
            </div>
         
         </div>
      </aside>
    </div>
  );
}
