"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ApiRequestError } from "@/lib/api/http";

type SearchType = "movie,show" | "movie" | "show" | "person";

const TYPE_OPTIONS: { value: SearchType; label: string }[] = [
  { value: "movie,show", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "show", label: "Shows" },
  { value: "person", label: "People" },
];

interface SearchResult {
  type: string;
  title: string;
  year?: number;
  slug: string;
  overview?: string;
  rating?: number;
  posterUrl: string | null;
}

interface SearchResponse {
  results?: SearchResult[];
  error?: string;
}

export function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("movie,show");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // Open on Cmd+P or custom event
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    const handleCustomOpen = () => setOpen(true);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("open-search-palette", handleCustomOpen);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-search-palette", handleCustomOpen);
    };
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setError(null);
      setSelectedIndex(0);
    }
  }, [open]);

  // Search on query/type change
  const doSearch = useCallback(async (q: string, type: SearchType) => {
    if (q.length < 2) {
      abortRef.current?.abort();
      setResults([]);
      setError(null);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?query=${encodeURIComponent(q)}&type=${type}`, {
        signal: controller.signal,
      });
      const data = (await res.json()) as SearchResult[] | SearchResponse;

      if (!res.ok) {
        const message =
          !Array.isArray(data) && data.error ? data.error : "Search is temporarily unavailable.";
        throw new ApiRequestError(message, res.status);
      }

      const results = Array.isArray(data) ? data : (data.results ?? []);
      setResults(results);
      setSelectedIndex(0);
    } catch (error) {
      if (controller.signal.aborted) return;
      setResults([]);
      setError(
        error instanceof ApiRequestError ? error.message : "Search is temporarily unavailable.",
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query, searchType);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [query, searchType, doSearch]);

  const navigateToResult = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      const prefix =
        result.type === "show" ? "shows" : result.type === "person" ? "people" : "movies";
      router.push(`/${prefix}/${result.slug}`);
    },
    [router],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        navigateToResult(results[selectedIndex]);
      }
    },
    [results, selectedIndex, navigateToResult],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div
        className="animate-fade-in relative w-full max-w-xl overflow-hidden rounded-2xl bg-zinc-900 shadow-2xl ring-1 ring-white/10"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <svg
            className="h-5 w-5 shrink-0 text-zinc-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies, shows, people..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
          )}
          <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">ESC</kbd>
        </div>

        {/* Type filter tabs */}
        <div className="flex gap-1 border-b border-zinc-800 px-4 py-2">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSearchType(opt.value)}
              className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                searchType === opt.value
                  ? "bg-white/10 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 && query.length >= 2 && !loading && (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">
              {error ?? "No results found"}
            </div>
          )}

          {results.length === 0 && query.length < 2 && (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">
              Start typing to search...
            </div>
          )}

          {results.map((result, i) => {
            const ratingPct = result.rating != null ? Math.round(result.rating * 10) : null;
            return (
              <button
                key={`${result.type}-${result.slug}`}
                onClick={() => navigateToResult(result)}
                className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === selectedIndex ? "bg-white/5" : "hover:bg-white/[0.03]"
                }`}
              >
                {/* Mini poster */}
                <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md bg-zinc-800">
                  {result.posterUrl ? (
                    <Image
                      src={result.posterUrl}
                      alt={result.title}
                      fill
                      className="object-cover"
                      sizes="44px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-600">
                      {result.type === "show" ? "TV" : result.type === "person" ? "P" : "M"}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{result.title}</span>
                    {result.year && (
                      <span className="shrink-0 text-xs text-zinc-500">{result.year}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-400">
                      {result.type}
                    </span>
                    {ratingPct != null && ratingPct > 0 && (
                      <span
                        className={`text-[11px] font-semibold ${
                          ratingPct >= 70
                            ? "text-green-400"
                            : ratingPct >= 50
                              ? "text-yellow-400"
                              : "text-red-400"
                        }`}
                      >
                        {ratingPct}%
                      </span>
                    )}
                  </div>
                  {result.overview && (
                    <p className="mt-0.5 truncate text-[11px] leading-tight text-zinc-500">
                      {result.overview}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
