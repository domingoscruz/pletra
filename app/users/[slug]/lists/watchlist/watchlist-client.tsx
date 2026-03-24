"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "@/components/ui/link";
import { ViewToggle } from "@/components/ui/view-toggle";
import { Select } from "@/components/ui/select";
import { MediaCard } from "@/components/dashboard/media-card";
import { useSettings } from "@/lib/settings";
import { useNavigate } from "@/lib/use-navigate";

type WatchlistEntry = {
	id: number;
	listedAt: string;
	type: string;
	title: string;
	year?: number;
	rating?: number;
	runtime?: number;
	href: string;
	posterUrl: string | null;
	backdropUrl: string | null;
	mediaType: "movies" | "shows";
	ids: Record<string, unknown>;
	genres: string[];
};

interface WatchlistClientProps {
	items: WatchlistEntry[];
	slug: string;
	currentType: string;
	currentPage: number;
	totalPages: number;
	activeSort: string;
	activeGenre: string;
	activeRuntime: string;
	activeSearch: string;
	allGenres: string[];
}

const typeFilters = [
	{ value: "all", label: "All" },
	{ value: "movies", label: "Movies" },
	{ value: "shows", label: "Shows" },
];

const sortOptions = [
	{ value: "added", label: "Date Added" },
	{ value: "title", label: "Title A–Z" },
	{ value: "released", label: "Release Date" },
	{ value: "percentage", label: "Rating" },
	{ value: "rank", label: "Rank" },
];

const runtimeFilters = [
	{ value: "", label: "Any Runtime" },
	{ value: "0-60", label: "Under 1h" },
	{ value: "60-90", label: "1–1.5h" },
	{ value: "60-120", label: "1–2h" },
	{ value: "120-180", label: "2–3h" },
	{ value: "180-999", label: "3h+" },
];

export function WatchlistClient({
	items,
	slug,
	currentType,
	currentPage,
	totalPages,
	activeSort,
	activeGenre,
	activeRuntime,
	activeSearch,
	allGenres,
}: WatchlistClientProps) {
	const { navigate: nav, isPending } = useNavigate();
	const { settings } = useSettings();
	const [view, setView] = useState<"list" | "grid">(settings.defaultView);
	const [searchInput, setSearchInput] = useState(activeSearch);
	const searchTimerRef = useState<ReturnType<typeof setTimeout> | null>(null);

	const navigate = useCallback(
		(overrides: {
			type?: string;
			page?: number;
			sort?: string;
			genre?: string;
			runtime?: string;
			q?: string;
		}) => {
			const p = new URLSearchParams();
			const t = overrides.type ?? currentType;
			const pg = overrides.page ?? 1;
			const s = overrides.sort ?? activeSort;
			const g = overrides.genre ?? activeGenre;
			const r = overrides.runtime ?? activeRuntime;
			const q = overrides.q ?? activeSearch;

			if (t !== "all") p.set("type", t);
			if (pg > 1) p.set("page", String(pg));
			if (s !== "added") p.set("sort", s);
			if (g) p.set("genre", g);
			if (r) p.set("runtime", r);
			if (q) p.set("q", q);

			const qs = p.toString();
			nav(`/users/${slug}/lists/watchlist${qs ? `?${qs}` : ""}`);
		},
		[nav, slug, currentType, activeSort, activeGenre, activeRuntime, activeSearch],
	);

	function handleSearchChange(value: string) {
		setSearchInput(value);
		if (searchTimerRef[0]) clearTimeout(searchTimerRef[0]);
		searchTimerRef[0] = setTimeout(() => {
			navigate({ q: value, page: 1 });
		}, 400);
	}

	return (
		<div className={`space-y-4 ${isPending ? "opacity-60 transition-opacity" : ""}`}>
			{/* Controls row 1 */}
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex gap-1 rounded-lg bg-white/[0.03] p-1 ring-1 ring-white/5">
					{typeFilters.map((f) => (
						<button
							key={f.value}
							onClick={() => navigate({ type: f.value, page: 1, genre: "", runtime: "", q: "" })}
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

			{/* Controls row 2: genre + runtime */}
			<div className="flex flex-wrap items-center gap-3">
				{allGenres.length > 0 && (
					<Select
						value={activeGenre}
						onChange={(v) => navigate({ genre: v, page: 1 })}
						options={[
							{ value: "", label: "All Genres" },
							...allGenres.map((g) => ({ value: g, label: g })),
						]}
					/>
				)}

				<Select
					value={activeRuntime}
					onChange={(v) => navigate({ runtime: v, page: 1 })}
					options={runtimeFilters}
				/>
			</div>

			{/* Grid view */}
			{view === "grid" ? (
				items.length === 0 ? (
					<EmptyState />
				) : (
					<div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
						{items.map((item, i) => (
							<MediaCard
								key={`${item.id}-${i}`}
								title={item.title}
								subtitle={item.year ? String(item.year) : undefined}
								href={item.href}
								backdropUrl={item.backdropUrl}
								posterUrl={item.posterUrl}
								rating={item.rating}
								mediaType={item.mediaType}
								ids={item.ids}
								variant="poster"
							/>
						))}
					</div>
				)
			) : items.length === 0 ? (
				<EmptyState />
			) : (
				<div className="space-y-1">
					{items.map((item, i) => (
						<Link
							key={`${item.id}-${i}`}
							href={item.href}
							className="group flex items-center gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
						>
							<div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-zinc-800">
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
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">
									{item.title}
								</p>
								<div className="flex items-center gap-2 text-[11px] text-zinc-500">
									{item.year && <span>{item.year}</span>}
									<span
										className={`rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${item.type === "movie" ? "bg-blue-500/10 text-blue-400" : "bg-purple-500/10 text-purple-400"}`}
									>
										{item.type === "movie" ? "Film" : "TV"}
									</span>
								</div>
							</div>
							{item.rating != null && (
								<div
									className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${Math.round(item.rating * 10) >= 70 ? "bg-green-500/10 text-green-400" : Math.round(item.rating * 10) >= 50 ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}`}
								>
									{Math.round(item.rating * 10)}%
								</div>
							)}
							<span className="hidden shrink-0 text-[11px] text-zinc-600 sm:inline">
								Added{" "}
								{new Date(item.listedAt).toLocaleDateString("en-US", {
									month: "short",
									day: "numeric",
								})}
							</span>
						</Link>
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
			<p className="text-sm text-zinc-500">Watchlist is empty</p>
		</div>
	);
}
