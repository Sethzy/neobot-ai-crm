/**
 * Quick action cards for pre-filling common prompt templates.
 * Displayed in empty state to help users get started quickly.
 * @module components/analyst/quick-action-cards
 */
import { Link, BarChart3, AlertTriangle } from '@/components/icons/lucide-compat';
import { cn } from '@/lib/utils';

/** Quick action definition with icon and template prompt */
interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: typeof Link;
  prompt: string;
}

/** Available quick actions with their template prompts */
const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'reconcile',
    label: 'Reconcile',
    description: 'Cross-reference and match documents',
    icon: Link,
    prompt:
      'Cross-reference and match documents across types. Identify matched pairs and flag unmatched items. Output as Excel with: matched items sheet, unmatched items sheet, summary statistics.',
  },
  {
    id: 'analyze',
    label: 'Analyze',
    description: 'Identify trends, breakdowns, and outliers',
    icon: BarChart3,
    prompt:
      'Analyze patterns in this data. Identify trends over time, breakdown by category, and notable outliers. Output as Excel with summary tables and embedded charts.',
  },
  {
    id: 'issues',
    label: 'Audit',
    description: 'Find discrepancies and unusual amounts',
    icon: AlertTriangle,
    prompt:
      'Audit these documents for issues: missing information, discrepancies between documents, amounts that seem unusual. Output as Excel with flagged items, severity rating, and recommended actions.',
  },
];

interface QuickActionCardsProps {
  /** Called when user selects an action - receives the template prompt */
  onSelectAction: (prompt: string) => void;
  className?: string;
}

/**
 * Grid of quick action cards for common analyst tasks.
 * Each card pre-fills the input with a template prompt.
 */
export function QuickActionCards({ onSelectAction, className }: QuickActionCardsProps) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-3 gap-4 w-full", className)}>
      {QUICK_ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            onClick={() => onSelectAction(action.prompt)}
            className="group flex flex-col items-start p-4 h-auto text-left rounded-xl border bg-card hover:bg-secondary/40 hover:border-secondary transition-all duration-200"
          >
            <div className="mb-3 rounded-lg bg-secondary/50 p-2 text-secondary-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
              <Icon className="h-4 w-4" />
            </div>
            <span className="font-semibold text-sm mb-1">{action.label}</span>
            <span className="text-xs text-muted-foreground group-hover:text-muted-foreground/80">
              {action.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
