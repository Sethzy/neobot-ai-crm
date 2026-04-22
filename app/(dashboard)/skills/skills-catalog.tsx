/**
 * Client-side skills catalog with search filtering across installed and
 * recommended sections. Renders the competitor-matching compact row layout.
 * Manages the skill detail dialog state.
 *
 * @module app/(dashboard)/skills/skills-catalog
 */
"use client";

import { Search } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

import { fetchSkillMarkdown } from "./actions";
import { PredefinedCard, type SkillCardData } from "./predefined-card";
import { SkillDetailDialog } from "./skill-detail-dialog";
import { getSkillCategory } from "./skill-presentation";

interface SkillsCatalogProps {
  installedCards: SkillCardData[];
  recommendedCards: SkillCardData[];
}

export function SkillsCatalog({
  installedCards,
  recommendedCards,
}: SkillsCatalogProps) {
  const [query, setQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<SkillCardData | null>(null);
  const [selectedMarkdown, setSelectedMarkdown] = useState<string>("");

  /**
   * Cache of slug → resolved string or in-flight Promise.
   * Hover prefetch populates this so clicks resolve instantly.
   */
  const cache = useRef<Record<string, string | Promise<string>>>({});

  const lowerQuery = query.toLowerCase().trim();

  const filteredInstalled = lowerQuery
    ? installedCards.filter(
        (card) =>
          card.skill.name.toLowerCase().includes(lowerQuery) ||
          card.skill.description.toLowerCase().includes(lowerQuery) ||
          card.skill.slug.toLowerCase().includes(lowerQuery),
      )
    : installedCards;

  const filteredRecommended = lowerQuery
    ? recommendedCards.filter(
        (card) =>
          card.skill.name.toLowerCase().includes(lowerQuery) ||
          card.skill.description.toLowerCase().includes(lowerQuery) ||
          card.skill.slug.toLowerCase().includes(lowerQuery),
      )
    : recommendedCards;

  /**
   * Starts a background fetch for a skill's markdown and caches the result.
   * Deduplicates concurrent calls for the same slug.
   */
  const prefetch = useCallback((slug: string) => {
    if (cache.current[slug] !== undefined) return;
    const promise = fetchSkillMarkdown(slug).then((md) => md ?? "");
    cache.current[slug] = promise;
    promise.then((md) => {
      cache.current[slug] = md;
    });
  }, []);

  /**
   * Opens the detail dialog. Fetches markdown first so the dialog always
   * opens with full content — no intermediary skeleton state.
   */
  const handleCardSelect = useCallback(async (card: SkillCardData) => {
    const cached = cache.current[card.skill.slug];
    let md: string;
    if (typeof cached === "string") {
      md = cached;
    } else if (cached instanceof Promise) {
      md = await cached;
    } else {
      prefetch(card.skill.slug);
      md = await (cache.current[card.skill.slug] as Promise<string>);
    }
    setSelectedMarkdown(md);
    setSelectedCard(card);
  }, [prefetch]);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSelectedCard(null);
      setSelectedMarkdown("");
    }
  }, []);

  return (
    <>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
        <Input
          className="h-9 pl-9"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search installed and recommended skills..."
          type="search"
          value={query}
        />
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="type-section-title">Installed</h2>
          <p className="type-control-muted text-muted-foreground">
            Skills currently available in this agent
          </p>
        </div>
        {filteredInstalled.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {filteredInstalled.map((card) => (
              <PredefinedCard
                key={`installed-${card.skill.slug}`}
                isInstalled={card.isInstalled}
                onHover={() => prefetch(card.skill.slug)}
                onSelect={() => handleCardSelect(card)}
                skill={card.skill}
              />
            ))}
          </div>
        ) : (
          <p className="type-control-muted text-muted-foreground">
            {lowerQuery
              ? "No installed skills match your search."
              : "No installed skills yet. Install one from the recommended list to activate it."}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="type-section-title">
            Recommended
          </h2>
          <p className="type-control-muted text-muted-foreground">
            Discover additional skills you can import instantly
          </p>
        </div>
        {filteredRecommended.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {filteredRecommended.map((card) => (
              <PredefinedCard
                key={`recommended-${card.skill.slug}`}
                isInstalled={card.isInstalled}
                onHover={() => prefetch(card.skill.slug)}
                onSelect={() => handleCardSelect(card)}
                skill={card.skill}
              />
            ))}
          </div>
        ) : (
          <p className="type-control-muted text-muted-foreground">
            {lowerQuery
              ? "No recommended skills match your search."
              : "No additional skills available right now."}
          </p>
        )}
      </section>

      {/* Single dialog instance, re-keyed when selection changes */}
      {selectedCard ? (
        <SkillDetailDialog
          key={selectedCard.skill.slug}
          category={getSkillCategory(selectedCard.skill.slug)}
          isInstalled={selectedCard.isInstalled}
          markdown={selectedMarkdown}
          onOpenChange={handleDialogOpenChange}
          open
          skill={selectedCard.skill}
        />
      ) : null}
    </>
  );
}
