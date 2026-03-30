"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "@/components/ui/link";
import { Select } from "@/components/ui/select";
import { useNavigate } from "@/lib/use-navigate";
import type { ProgressShowItem } from "./page";

interface Props {
	slug: string;
	items: ProgressShowItem[];
	activeSort: string;
	activeFilter: string;
	activeSearch: string;
	currentPage: number;
	totalPages: number;
	totalItems: number;
}

const sortOptions = [
	{ value: "recent", label: "Recently Watched" },
	{ value: "title", label: "Title A–Z" },
	{ value: "progress", label: "Most Progress" },
	{ value: "remaining", label: "Fewest Remaining" },
	{ value: "rating", label: "Highest Rated" },
];

const filterOptions = [
	{ value: "all", label: "All Shows" },
	{ value: "returning", label: "Returning" },
	{ value: "ended", label: "Ended / Canceled" },
	{ value: "almost-done", label: "Almost Done (80%+)" },
	{ value: "just-started", label: "Just Started (<20%)" },
];

export function ProgressClient({
	slug,
	items,
	activeSort,
	activeFilter,
	activeSearch,
	currentPage,
	totalPages,
	totalItems,
}: Props) {
	const { navigate, isPending } = useNavigate();
	const [searchInput, setSearchInput] = useState(activeSearch);
	const searchTimerRef = useState<ReturnType<typeof setTimeout> | null>(null);

	const buildUrl = useCallback(
		(overrides: { sort?: string; filter?: string; q?: string; page?: number }) => {
			const p = new URLSearchParams();
			const s = overrides.sort ?? activeSort;
			const f = overrides.filter ?? activeFilter;
			const q = overrides.q ?? activeSearch;
			const pg = overrides.page ?? 1;

			if (s !== "recent") p.set("sort", s);
			if (f !== "all") p.set("filter", f);
			if (q) p.set("q", q);
			if (pg > 1) p.set("page", String(pg));

			const qs = p.toString();
			return `/users/${slug}/progress${qs ? `?${qs}` : ""}`;
		},
		[slug, activeSort, activeFilter, activeSearch],
	);

	const handleSearch = useCallback(
		(value: string) => {
			setSearchInput(value);
			if (searchTimerRef[0]) clearTimeout(searchTimerRef[0]);
			const timer = setTimeout(() => {
				navigate(buildUrl({ q: value }));
			}, 300);
			searchTimerRef[1](timer);
		},
		[navigate, buildUrl, searchTimerRef],
	);

	return (
		<div>
			{/* Controls */}
			<div className="mb-6 flex flex-wrap items-center gap-3">
				<input
					type="text"
					placeholder="Search shows..."
					value={searchInput}
					onChange={(e) => handleSearch(e.target.value)}
					className="h-8 w-48 rounded-lg bg-white/[0.03] px-3 text-xs text-zinc-200 ring-1 ring-white/5 placeholder:text-zinc-600 focus:outline-none focus:ring-white/20"
				/>
				<Select
					value={activeSort}
					onChange={(v) => navigate(buildUrl({ sort: v }))}
					options={sortOptions}
				/>
				<Select
					value={activeFilter}
					onChange={(v) => navigate(buildUrl({ filter: v }))}
					options={filterOptions}
				/>
				<span className="ml-auto text-xs text-zinc-500">
					{totalItems} show{totalItems !== 1 ? "s" : ""}
				</span>
			</div>

			{/* List */}
			<div className={`space-y-2 transition-opacity ${isPending ? "opacity-60" : ""}`}>
				{items.length === 0 && (
					<div className="py-12 text-center text-sm text-zinc-600">No shows in progress.</div>
				)}
				{items.map((item) => {
					const pct = item.aired > 0 ? Math.round((item.completed / item.aired) * 100) : 0;
					const remaining = item.aired - item.completed;
					const epLabel = item.nextEpisode
						? `S${String(item.nextEpisode.season).padStart(2, "0")}E${String(item.nextEpisode.number).padStart(2, "0")}`
						: null;
					const lastWatched = item.lastWatchedAt ? formatRelativeDate(item.lastWatchedAt) : null;

					return (
						<div
							key={item.slug}
							className="group flex gap-4 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/5 transition-colors hover:bg-white/[0.06]"
						>
							{/* Poster */}
							<Link
								href={`/shows/${item.slug}`}
								className="relative aspect-[2/3] w-16 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-800"
							>
								{item.posterUrl ? (
									<Image
										src={item.posterUrl}
										alt={item.title}
										fill
										className="object-cover"
										sizes="64px"
									/>
								) : (
									<div className="flex h-full items-center justify-center text-sm text-zinc-600">
										📺
									</div>
								)}
							</Link>

							{/* Info */}
							<div className="min-w-0 flex-1">
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<Link
											href={`/shows/${item.slug}`}
											className="block truncate text-sm font-medium text-zinc-200 transition-colors hover:text-white"
										>
											{item.title}
										</Link>
										<div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
											{item.year && <span>{item.year}</span>}
											{item.network && (
												<>
													<span className="text-zinc-700">·</span>
													<span>{item.network}</span>
												</>
											)}
											{item.status && (
												<span
													className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
														item.status === "returning series"
															? "bg-green-500/10 text-green-400"
															: item.status === "ended"
																? "bg-zinc-500/10 text-zinc-500"
																: "bg-yellow-500/10 text-yellow-400"
													}`}
												>
													{item.status === "returning series"
														? "Returning"
														: item.status === "ended"
															? "Ended"
															: item.status}
												</span>
											)}
										</div>
									</div>

									{/* Rating */}
									{item.rating != null && (
										<div
											className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
												Math.round(item.rating * 10) >= 70
													? "bg-green-500/90 text-white"
													: Math.round(item.rating * 10) >= 50
														? "bg-yellow-500/90 text-black"
														: "bg-red-500/90 text-white"
											}`}
										>
											{Math.round(item.rating * 10)}%
										</div>
									)}
								</div>

								{/* Progress bar */}
								<div className="mt-2.5 flex items-center gap-3">
									<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
										<div
											className={`h-full rounded-full transition-all ${
												pct >= 100 ? "bg-green-500" : "bg-accent"
											}`}
											style={{ width: `${pct}%` }}
										/>
									</div>
									<span className="shrink-0 text-[11px] tabular-nums text-zinc-400">
										{item.completed}/{item.aired}
										<span className="text-zinc-600"> ({pct}%)</span>
									</span>
								</div>

								{/* Next episode + meta */}
								<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
									{epLabel && item.nextEpisode && (
										<Link
											href={`/shows/${item.slug}/seasons/${item.nextEpisode.season}/episodes/${item.nextEpisode.number}`}
											className="flex items-center gap-1 text-zinc-300 transition-colors hover:text-white"
										>
											<span className="font-medium text-accent">Next:</span>
											<span>
												{epLabel}
												{item.nextEpisode.title ? ` · ${item.nextEpisode.title}` : ""}
											</span>
										</Link>
									)}
									{remaining > 0 && (
										<span className="text-zinc-600">
											{remaining} episode{remaining !== 1 ? "s" : ""} remaining
										</span>
									)}
									{lastWatched && <span className="text-zinc-600">Watched {lastWatched}</span>}
								</div>
							</div>
						</div>
					);
				})}
			</div>

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="mt-6 flex items-center justify-center gap-2">
					<button
						onClick={() => navigate(buildUrl({ page: currentPage - 1 }))}
						disabled={currentPage <= 1 || isPending}
						className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-default disabled:opacity-30"
					>
						‹
					</button>
					<span className="px-2 text-xs tabular-nums text-zinc-400">
						{currentPage} / {totalPages}
					</span>
					<button
						onClick={() => navigate(buildUrl({ page: currentPage + 1 }))}
						disabled={currentPage >= totalPages || isPending}
						className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-default disabled:opacity-30"
					>
						›
					</button>
				</div>
			)}
		</div>
	);
}

function formatRelativeDate(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const days = Math.floor(diff / 86400000);

	if (days < 1) return "today";
	if (days === 1) return "yesterday";
	if (days < 7) return `${days}d ago`;
	if (days < 30) return `${Math.floor(days / 7)}w ago`;
	if (days < 365) return `${Math.floor(days / 30)}mo ago`;
	return `${Math.floor(days / 365)}y ago`;
}
