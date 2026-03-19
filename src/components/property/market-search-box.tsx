/** Client-side search box with live typeahead suggestions for market pages. */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/icons/app-icons";

type Suggestion = {
  label: string;
  sublabel?: string;
  href: string;
};

interface MarketSearchBoxProps {
  /** Suggest API type param (e.g. "agents", "properties"). */
  type: string;
  /** Input placeholder text. */
  placeholder: string;
  /** Pre-filled search value from URL. */
  defaultValue?: string;
}

const DEBOUNCE_MS = 250;

export function MarketSearchBox({
  type,
  placeholder,
  defaultValue = "",
}: MarketSearchBoxProps) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchSuggestions = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setSuggestions([]);
        setIsOpen(false);
        return;
      }

      setIsLoading(true);
      setIsOpen(true);
      try {
        const res = await fetch(
          `/api/market/suggest?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`
        );
        const json = await res.json();
        const items: Suggestion[] = json.suggestions ?? [];
        setSuggestions(items);
        setIsOpen(true);
        setHasSearched(true);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
        setIsOpen(true);
        setHasSearched(true);
      } finally {
        setIsLoading(false);
      }
    },
    [type]
  );

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), DEBOUNCE_MS);
  };

  const navigateToSuggestion = (suggestion: Suggestion) => {
    setIsOpen(false);
    setQuery(suggestion.label);
    router.push(suggestion.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        if (!isOpen || suggestions.length === 0) return;
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        if (!isOpen || suggestions.length === 0) return;
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          navigateToSuggestion(suggestions[activeIndex]);
        } else if (suggestions.length > 0) {
          navigateToSuggestion(suggestions[0]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  const handleClear = () => {
    setQuery("");
    setSuggestions([]);
    setIsOpen(false);
    setHasSearched(false);
    inputRef.current?.focus();
  };

  // Auto-fetch suggestions on mount when defaultValue is pre-filled (URL sharing)
  useEffect(() => {
    if (defaultValue.length >= 2) {
      fetchSuggestions(defaultValue);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="mt-6">
      <div className="relative mx-auto max-w-2xl">
        <AppIcon
          name="search"
          className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-10 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/30 focus:shadow-md"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition hover:text-foreground"
          >
            <AppIcon name="close" className="h-4 w-4" />
          </button>
        )}

        {/* Typeahead dropdown */}
        {isOpen && (
          <div
            ref={dropdownRef}
            className="absolute left-0 right-0 z-50 mt-1.5 max-h-80 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-popover shadow-lg"
          >
            {isLoading ? (
              <p className="px-4 py-2.5 text-sm text-muted-foreground">Searching...</p>
            ) : suggestions.length > 0 ? (
              <ul role="listbox" className="py-1">
                {suggestions.map((suggestion, i) => (
                  <li
                    key={`${suggestion.label}-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => navigateToSuggestion(suggestion)}
                    className={`flex cursor-pointer items-center justify-between gap-4 px-4 py-2 transition ${
                      i === activeIndex
                        ? "bg-muted/30"
                        : ""
                    }`}
                  >
                    <span className="truncate text-sm font-medium text-foreground">
                      {suggestion.label}
                    </span>
                    {suggestion.sublabel && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {suggestion.sublabel}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : hasSearched ? (
              <p className="px-4 py-2.5 text-sm text-muted-foreground">No results found</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
