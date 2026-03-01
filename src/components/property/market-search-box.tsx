/** Client-side search box with live typeahead suggestions for market pages. */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

type Suggestion = {
  label: string;
  sublabel?: string;
  href: string;
};

interface MarketSearchBoxProps {
  /** Form action URL for fallback submit (e.g. "/market/agents"). */
  action: string;
  /** Suggest API type param (e.g. "agents", "properties"). */
  type: string;
  /** Input placeholder text. */
  placeholder: string;
  /** Pre-filled search value from URL. */
  defaultValue?: string;
}

const DEBOUNCE_MS = 250;

export function MarketSearchBox({
  action,
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
      try {
        const res = await fetch(
          `/api/market/suggest?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`
        );
        const json = await res.json();
        const items: Suggestion[] = json.suggestions ?? [];
        setSuggestions(items);
        setIsOpen(items.length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
        setIsOpen(false);
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
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case "Enter":
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          e.preventDefault();
          navigateToSuggestion(suggestions[activeIndex]);
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
    inputRef.current?.focus();
  };

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
    <form action={action} method="get" className="mt-6">
      <div className="relative mx-auto max-w-lg">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
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
          className="h-12 w-full rounded-full border border-zinc-200 bg-white pl-11 pr-10 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-300 focus:shadow-md"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-zinc-400 transition hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Typeahead dropdown */}
        {isOpen && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg"
          >
            <ul role="listbox" className="py-1.5">
              {suggestions.map((suggestion, i) => (
                <li
                  key={`${suggestion.label}-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => navigateToSuggestion(suggestion)}
                  className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition ${
                    i === activeIndex
                      ? "bg-zinc-50"
                      : ""
                  }`}
                >
                  <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-900">
                      {suggestion.label}
                    </p>
                    {suggestion.sublabel && (
                      <p className="truncate text-xs text-zinc-400">
                        {suggestion.sublabel}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </form>
  );
}
