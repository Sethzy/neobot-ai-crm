/**
 * PDF highlight state management.
 * Separates highlight state from component tree to prevent re-renders.
 * @module contexts/highlight-context
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import type { HighlightArea } from "@/lib/highlight-utils";

/** Context value for components that READ highlights (PdfViewerPane) */
interface HighlightStateContextValue {
  highlights: HighlightArea[];
  registerJumpToPage: (fn: ((page: number) => void) | null) => void;
}

/** Context value for components that WRITE highlights (ExtractionCard) */
interface HighlightSetterContextValue {
  setHighlights: (highlights: HighlightArea[]) => void;
  jumpToPage: (pageIndex: number) => void;
}

const HighlightStateContext = createContext<HighlightStateContextValue | null>(null);
const HighlightSetterContext = createContext<HighlightSetterContextValue | null>(null);

/**
 * Provider for PDF highlight state.
 * Uses two separate contexts for read/write separation to prevent unnecessary re-renders.
 */
export function HighlightProvider({ children }: { children: ReactNode }) {
  const [highlights, setHighlightsState] = useState<HighlightArea[]>([]);
  const jumpToPageRef = useRef<((page: number) => void) | null>(null);

  const registerJumpToPage = useCallback((fn: ((page: number) => void) | null) => {
    jumpToPageRef.current = fn;
  }, []);

  const setHighlights = useCallback((newHighlights: HighlightArea[]) => {
    setHighlightsState(newHighlights);
    if (newHighlights.length > 0 && jumpToPageRef.current) {
      jumpToPageRef.current(newHighlights[0].pageIndex);
    }
  }, []);

  const jumpToPage = useCallback((pageIndex: number) => {
    jumpToPageRef.current?.(pageIndex);
  }, []);

  const stateValue = useMemo(
    () => ({ highlights, registerJumpToPage }),
    [highlights, registerJumpToPage]
  );

  const setterValue = useMemo(
    () => ({ setHighlights, jumpToPage }),
    [setHighlights, jumpToPage]
  );

  return (
    <HighlightStateContext.Provider value={stateValue}>
      <HighlightSetterContext.Provider value={setterValue}>
        {children}
      </HighlightSetterContext.Provider>
    </HighlightStateContext.Provider>
  );
}

/**
 * Hook to read highlight state. Subscribes to changes.
 * @throws Error if used outside HighlightProvider
 */
export function useHighlights() {
  const context = useContext(HighlightStateContext);
  if (!context) {
    throw new Error("useHighlights must be used within HighlightProvider");
  }
  return context;
}

/**
 * Hook to update highlights without subscribing to changes.
 * @throws Error if used outside HighlightProvider
 */
export function useSetHighlights() {
  const context = useContext(HighlightSetterContext);
  if (!context) {
    throw new Error("useSetHighlights must be used within HighlightProvider");
  }
  return context;
}
