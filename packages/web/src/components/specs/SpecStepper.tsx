import {
  PencilSquareIcon,
  SparklesIcon,
  RocketLaunchIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

export type WorkflowPhase = "write" | "plan" | "execute";

interface SpecStepperProps {
  currentPhase: WorkflowPhase;
  hasContent: boolean;
  hasPlan: boolean;
  isExecuting: boolean;
  isCompleted: boolean;
  onPhaseClick?: (phase: WorkflowPhase) => void;
}

const phases: { id: WorkflowPhase; label: string; icon: typeof PencilSquareIcon }[] = [
  { id: "write", label: "Write", icon: PencilSquareIcon },
  { id: "plan", label: "Plan", icon: SparklesIcon },
  { id: "execute", label: "Execute", icon: RocketLaunchIcon },
];

function getPhaseStatus(
  phase: WorkflowPhase,
  currentPhase: WorkflowPhase,
  hasContent: boolean,
  hasPlan: boolean,
  isExecuting: boolean,
  isCompleted: boolean,
): "completed" | "current" | "upcoming" {
  switch (phase) {
    case "write":
      if (isCompleted || isExecuting || hasPlan) return "completed";
      if (hasContent && currentPhase !== "write") return "completed";
      if (currentPhase === "write") return "current";
      return "upcoming";
    case "plan":
      if (isCompleted || isExecuting) return "completed";
      if (hasPlan && currentPhase === "execute") return "completed";
      if (currentPhase === "plan") return "current";
      return "upcoming";
    case "execute":
      if (isCompleted) return "completed";
      if (isExecuting) return "current";
      if (currentPhase === "execute") return "current";
      return "upcoming";
    default:
      return "upcoming";
  }
}

export function SpecStepper({
  currentPhase,
  hasContent,
  hasPlan,
  isExecuting,
  isCompleted,
  onPhaseClick,
}: SpecStepperProps) {
  return (
    <div className="flex items-center gap-1">
      {phases.map((phase, index) => {
        const status = getPhaseStatus(
          phase.id,
          currentPhase,
          hasContent,
          hasPlan,
          isExecuting,
          isCompleted,
        );
        const Icon = phase.icon;
        const isClickable = status === "completed" || status === "current";

        return (
          <div key={phase.id} className="flex items-center">
            {/* Step */}
            <button
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-300 ${
                status === "current"
                  ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                  : status === "completed"
                    ? "bg-success/10 text-success hover:bg-success/15 cursor-pointer"
                    : "bg-transparent text-muted-foreground/40 cursor-default"
              } ${isClickable && status !== "current" ? "active:scale-[0.96]" : ""}`}
              onClick={() => isClickable && onPhaseClick?.(phase.id)}
              disabled={!isClickable}
            >
              {status === "completed" ? (
                <CheckIcon className="h-3.5 w-3.5" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              {phase.label}
            </button>

            {/* Connector line */}
            {index < phases.length - 1 && (
              <div
                className={`w-6 h-px mx-1 transition-colors duration-300 ${
                  status === "completed" ? "bg-success/30" : "bg-border/30"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
