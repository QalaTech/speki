import type { SpecType } from './types';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
} from '../ui/Drawer';
import { DocumentTextIcon, CpuChipIcon, BugAntIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Button } from '../ui/Button';

interface NewSpecDrawerProps {
  isOpen: boolean;
  name: string;
  type: SpecType;
  isCreating: boolean;
  onNameChange: (name: string) => void;
  onTypeChange: (type: SpecType) => void;
  onCreate: () => void;
  onClose: () => void;
}

const specTypes: Array<{
  type: SpecType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  emoji: string;
}> = [
  {
    type: 'prd',
    label: 'PRD',
    description: 'Product requirements - What & Why',
    icon: DocumentTextIcon,
    emoji: '📋',
  },
  {
    type: 'tech-spec',
    label: 'Tech Spec',
    description: 'Technical design - How',
    icon: CpuChipIcon,
    emoji: '🔧',
  },
  {
    type: 'bug',
    label: 'Bug Report',
    description: 'Issue documentation',
    icon: BugAntIcon,
    emoji: '🐛',
  },
];

export function NewSpecDrawer({
  isOpen,
  name,
  type,
  isCreating,
  onNameChange,
  onTypeChange,
  onCreate,
  onClose,
}: NewSpecDrawerProps) {
  const sanitizedName = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'name';
  const extension = type === 'prd' ? 'prd' : type === 'tech-spec' ? 'tech' : 'bug';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && name.trim() && !isCreating) {
      onCreate();
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()} direction="right">
      <DrawerContent side="right" className="w-full sm:max-w-xl h-full border-none bg-background pb-8 overflow-hidden font-poppins">
        <DrawerHeader className="relative px-8 pt-8 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle className="text-2xl font-bold tracking-tight text-foreground">
                New Spec
              </DrawerTitle>
              <DrawerDescription className="text-muted-foreground mt-1">
                Design the future of your app
              </DrawerDescription>
            </div>
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full bg-muted/40 border-none hover:bg-muted/60"
              onClick={onClose}
            >
              <XMarkIcon className="w-5 h-5" />
            </Button>
          </div>
        </DrawerHeader>

        <DrawerBody className="space-y-8 px-8 py-4">
          {/* Type Selector */}
          <div className="space-y-4">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1">
              Spec Type
            </h4>
            <div className="grid grid-cols-1 gap-2">
              {specTypes.map((spec) => {
                const isSelected = type === spec.type;
                const Icon = spec.icon;
                
                return (
                  <button
                    key={spec.type}
                    type="button"
                    className={`
                      relative flex items-center gap-4 p-4 rounded-2xl
                      transition-all duration-300 group active:scale-[0.98]
                      ${isSelected
                        ? 'bg-muted/80 ring-1 ring-border shadow-sm'
                        : 'hover:bg-muted/40'
                      }
                    `}
                    onClick={() => onTypeChange(spec.type)}
                  >
                    {/* Icon */}
                    <div className={`
                      flex items-center justify-center w-11 h-11 rounded-xl
                      transition-all duration-300
                      ${isSelected 
                        ? 'bg-primary/20 text-primary scale-110 shadow-sm shadow-primary/10' 
                        : 'bg-muted text-muted-foreground group-hover:bg-muted/80'
                      }
                    `}>
                      <Icon className="w-5 h-5" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground tracking-tight">
                          {spec.label}
                        </span>
                        <span className="text-base">{spec.emoji}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 opacity-80">
                        {spec.description}
                      </p>
                    </div>

                    {/* Radio indicator */}
                    <div className={`
                      w-5 h-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center
                      ${isSelected 
                        ? 'border-primary bg-primary' 
                        : 'border-muted-foreground/20 group-hover:border-muted-foreground/40'
                      }
                    `}>
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name Input */}
          <div className="space-y-4">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1">
              Spec Name
            </h4>
            <div className="group relative">
              <input
                type="text"
                className="
                  w-full px-5 py-4
                  bg-muted/30 text-foreground 
                  border border-transparent rounded-[20px]
                  text-base font-medium placeholder:text-muted-foreground/40
                  focus:outline-none focus:bg-background focus:border-border focus:ring-4 focus:ring-primary/5
                  transition-all duration-300
                "
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. user-authentication"
                autoFocus
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-muted-foreground/30 font-mono text-xs uppercase tracking-tighter">
                .{extension}.md
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/50 flex items-center gap-2 px-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
              Location: specs/YYYYMMDD-{sanitizedName}.{extension}.md
            </p>
          </div>
        </DrawerBody>

        <DrawerFooter className="px-8 pt-6 pb-4">
          <Button
            variant="primary"
            size="lg"
            className="w-full h-14 text-base font-bold tracking-tight rounded-[20px]"
            onClick={onCreate}
            isLoading={isCreating}
            disabled={!name.trim() || isCreating}
          >
            Create Spec
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
