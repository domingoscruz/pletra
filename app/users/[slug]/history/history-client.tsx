"use client";

import { useState, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "@/components/ui/link";
import { ViewToggle } from "@/components/ui/view-toggle";
import { Select } from "@/components/ui/select";
import { MediaCard } from "@/components/dashboard/media-card";
import { RatingInput } from "@/components/media/rating-input";
import { useSettings } from "@/lib/settings";
import { useNavigate } from "@/lib/use-navigate";

type HistoryEntry = {
	id: number;
	watched_at: string;
	type: "movie" | "show";
	title: string;
	year?: number;
	runtime?: number;
	rating?: number;
	userRating?: number;
	href: string;
	subtitle?: string;
	posterUrl: string | null;
	backdropUrl: string | null;
	mediaType: "movies" | "episodes";
	ids: Record<string, unknown>;
};

interface HistoryClientProps {
	items: HistoryEntry[];
	slug: string;
	currentType: string;
	currentPage: number;
	totalPages: number;
	totalItems: number;
	activeSort: string;
	activeSearch: string;
}

const typeFilters = [
	{ value: "all", label: "All" },
	{ value: "movies", label: "Movies" },
	{ value: "shows", label: "Shows" },
];

const sortOptions = [
	{ value: "newest", label: "Newest First" },
	{ value: "oldest", label: "Oldest First" },
	{ value: "title", label: "Title A–Z" },
	{ value: "rating", label: "Highest Rated" },
];

export function HistoryClient({
	items,
	slug,
	currentType,
	currentPage,
	totalPages,
	activeSort,
	activeSearch,
}: HistoryClientProps) {
	const { navigate: nav, isPending } = useNavigate();
	const { settings } = useSettings();
	const [view, setView] = useState<"list" | "grid">(settings.defaultView);
	const [searchInput, setSearchInput] = useState(activeSearch);
	const searchTimerRef = useState<ReturnType<typeof setTimeout> | null>(null);

	const navigate = useCallback(
		(overrides: { type?: string; page?: number; sort?: string; q?: string }) => {
			const p = new URLSearchParams();
			const t = overrides.type ?? currentType;
			const pg = overrides.page ?? 1;
			const s = overrides.sort ?? activeSort;
			const q = overrides.q ?? activeSearch;

			if (t !== "all") p.set("type", t);
			if (pg > 1) p.set("page", String(pg));
			if (s !== "newest") p.set("sort", s);
			if (q) p.set("q", q);

			const qs = p.toString();
			nav(`/users/${slug}/history${qs ? `?${qs}` : ""}`);
		},
		[nav, slug, currentType, activeSort, activeSearch],
	);

	function handleSearchChange(value: string) {
		setSearchInput(value);
		if (searchTimerRef[0]) clearTimeout(searchTimerRef[0]);
		searchTimerRef[0] = setTimeout(() => {
			navigate({ q: value, page: 1 });
		}, 400);
	}

	// Group items by date (list view only)
	const grouped = useMemo(() => {
		const groups: { label: string; items: typeof items }[] = [];
		let currentLabel = "";

		for (const item of items) {
			const date = new Date(item.watched_at);
			const label = date.toLocaleDateString("en-US", {
				year: "numeric",
				month: "long",
				day: "numeric",
			});
			if (label !== currentLabel) {
				currentLabel = label;
				groups.push({ label, items: [] });
			}
			groups[groups.length - 1].items.push(item);
		}
		return groups;
	}, [items]);

	function formatTimeAgo(dateStr: string) {
		const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
		if (days < 1) return "Today";
		if (days === 1) return "Yesterday";
		if (days < 7) return `${days}d ago`;
		if (days < 30) return `${Math.floor(days / 7)}w ago`;
		return undefined;
	}

	return (
		<div className={`space-y-6 ${isPending ? "opacity-60 transition-opacity" : ""}`}>
			{/* Controls */}
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex gap-1 rounded-lg bg-white/[0.03] p-1 ring-1 ring-white/5">
					{typeFilters.map((f) => (
						<button
							key={f.value}
							onClick={() => navigate({ type: f.value, page: 1, sort: "newest", q: "" })}
							className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
								currentType === f.value
									? "bg-white/10 text-white"
									: "text-zinc-500 hover:text-zinc-300"
							}`}
						>
							{f.label}
						</button>
					))}
				</div>

				<Select
					value={activeSort}
					onChange={(v) => navigate({ sort: v, page: 1 })}
					options={sortOptions}
				/>

				<div className="ml-auto flex items-center gap-3">
					<ViewToggle view={view} onChange={setView} />
					<div className="relative">
						<svg
							className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500"
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
							type="text"
							placeholder="Search..."
							value={searchInput}
							onChange={(e) => handleSearchChange(e.target.value)}
							className="w-48 rounded-lg bg-white/[0.03] py-1.5 pl-8 pr-3 text-xs text-zinc-300 ring-1 ring-white/5 placeholder:text-zinc-600 focus:outline-none focus:ring-white/20"
						/>
					</div>
				</div>
			</div>

			{/* Grid view */}
			{view === "grid" ? (
				items.length === 0 ? (
					<EmptyState />
				) : (
					<div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
						{items.map((item, i) => (
							<MediaCard
								key={`${item.id}-${item.watched_at}-${i}`}
								title={item.title}
								subtitle={item.subtitle}
								href={item.href}
								backdropUrl={item.backdropUrl}
								posterUrl={item.posterUrl}
								rating={item.rating}
								userRating={item.userRating}
								mediaType={item.mediaType}
								ids={item.ids}
								timestamp={formatTimeAgo(item.watched_at)}
								variant="poster"
							/>
						))}
					</div>
				)
			) : grouped.length === 0 ? (
				<EmptyState />
			) : (
				<div className="space-y-6">
					{grouped.map((group) => (
						<div key={group.label}>
							<h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
								{group.label}
							</h3>
							<div className="space-y-1">
								{group.items.map((item, i) => (
									<div
										key={`${item.id}-${item.watched_at}-${i}`}
										className="group flex items-center gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
									>
										<Link
											href={item.href}
											className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-zinc-800"
										>
											{item.posterUrl ? (
												<Image
													src={item.posterUrl}
													alt={item.title}
													fill
													className="object-cover"
													sizes="40px"
												/>
											) : (
												<div className="flex h-full items-center justify-center text-xs text-zinc-700">
													{item.type === "movie" ? "🎬" : "📺"}
												</div>
											)}
										</Link>

										<Link href={item.href} className="min-w-0 flex-1">
											<p className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">
												{item.title}
											</p>
											<div className="flex items-center gap-2 text-[11px] text-zinc-500">
												{item.subtitle && <span className="truncate">{item.subtitle}</span>}
												{!item.subtitle && item.year && <span>{item.year}</span>}
											</div>
										</Link>

										{item.rating != null && (
											<div
												className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${Math.round(item.rating * 10) >= 70 ? "bg-green-500/10 text-green-400" : Math.round(item.rating * 10) >= 50 ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}`}
											>
												{Math.round(item.rating * 10)}%
											</div>
										)}

										<div className="shrink-0" onClick={(e) => e.stopPropagation()}>
											<RatingInput
												mediaType={item.mediaType}
												ids={item.ids}
												currentRating={item.userRating}
											/>
										</div>

										<span className="hidden shrink-0 text-[11px] text-zinc-600 sm:inline">
											{new Date(item.watched_at).toLocaleTimeString("en-US", {
												hour: "numeric",
												minute: "2-digit",
											})}
										</span>

										<span
											className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${item.type === "movie" ? "bg-blue-500/10 text-blue-400" : "bg-purple-500/10 text-purple-400"}`}
										>
											{item.type === "movie" ? "Film" : "TV"}
										</span>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			)}

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-center gap-2 pt-4">
					<button
						onClick={() => navigate({ page: currentPage - 1 })}
						disabled={currentPage <= 1}
						className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-default disabled:opacity-30"
					>
						← Previous
					</button>
					<span className="text-xs tabular-nums text-zinc-500">
						Page {currentPage} of {totalPages}
					</span>
					<button
						onClick={() => navigate({ page: currentPage + 1 })}
						disabled={currentPage >= totalPages}
						className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-default disabled:opacity-30"
					>
						Next →
					</button>
				</div>
			)}
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex items-center justify-center rounded-xl bg-white/[0.02] py-16 ring-1 ring-white/5">
			<p className="text-sm text-zinc-500">No history found</p>
		</div>
	);
}
