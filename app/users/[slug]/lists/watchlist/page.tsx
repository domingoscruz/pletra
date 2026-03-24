import Link from "@/components/ui/link";
import { createTraktClient } from "@/lib/trakt";
import { fetchTmdbImages } from "@/lib/tmdb";
import { WatchlistClient } from "./watchlist-client";

interface Props {
	params: Promise<{ slug: string }>;
	searchParams: Promise<{
		type?: string;
		page?: string;
		sort?: string;
		genre?: string;
		runtime?: string;
		q?: string;
	}>;
}

type WatchlistItem = {
	rank?: number;
	id?: number;
	listed_at?: string;
	notes?: string | null;
	type?: string;
	movie?: {
		title?: string;
		year?: number;
		runtime?: number;
		rating?: number;
		genres?: string[];
		ids?: { slug?: string; tmdb?: number; trakt?: number };
	};
	show?: {
		title?: string;
		year?: number;
		rating?: number;
		genres?: string[];
		runtime?: number;
		ids?: { slug?: string; tmdb?: number; trakt?: number };
	};
};

export default async function WatchlistPage({ params, searchParams }: Props) {
	const { slug } = await params;
	const sp = await searchParams;
	const type = (sp.type as "all" | "movies" | "shows") || "all";
	const page = parseInt(sp.page ?? "1", 10);
	const sortBy = sp.sort ?? "added";
	const genreFilter = sp.genre ?? "";
	const runtimeFilter = sp.runtime ?? "";
	const searchQuery = sp.q ?? "";
	const limit = 42;
	const client = createTraktClient();

	let items: WatchlistItem[] = [];
	let totalPages = 1;

	// Build query with filters
	const buildQuery = (extra?: Record<string, unknown>) => {
		const q: Record<string, unknown> = { page, limit, extended: "full", ...extra };
		if (genreFilter) q.genres = genreFilter;
		if (runtimeFilter) q.runtimes = runtimeFilter;
		return q;
	};

	if (type === "movies" || type === "all") {
		const res = await client.users.watchlist.movies({
			params: { id: slug, sort: sortBy },
			query: buildQuery() as Parameters<typeof client.users.watchlist.movies>[0]["query"],
		});
		if (res.status === 200) {
			items = (res.body as WatchlistItem[]).map((i) => ({ ...i, type: "movie" }));
			totalPages = parseInt(
				String(
					(res as { headers?: { get?: (k: string) => string } }).headers?.get?.(
						"x-pagination-page-count",
					) ?? "1",
				),
				10,
			);
		}
	}

	if (type === "shows" || type === "all") {
		const showRes = await client.users.watchlist.shows({
			params: { id: slug, sort: sortBy },
			query: buildQuery() as Parameters<typeof client.users.watchlist.shows>[0]["query"],
		});
		if (showRes.status === 200) {
			const shows = (showRes.body as WatchlistItem[]).map((i) => ({ ...i, type: "show" }));
			if (type === "all") {
				items = [...items, ...shows].sort(
					(a, b) => new Date(b.listed_at ?? 0).getTime() - new Date(a.listed_at ?? 0).getTime(),
				);
				const showTotalPages = parseInt(
					String(
						(showRes as { headers?: { get?: (k: string) => string } }).headers?.get?.(
							"x-pagination-page-count",
						) ?? "1",
					),
					10,
				);
				totalPages = Math.max(totalPages, showTotalPages);
			} else {
				items = shows;
				totalPages = parseInt(
					String(
						(showRes as { headers?: { get?: (k: string) => string } }).headers?.get?.(
							"x-pagination-page-count",
						) ?? "1",
					),
					10,
				);
			}
		}
	}

	// Server-side search filter
	if (searchQuery) {
		const q = searchQuery.toLowerCase();
		items = items.filter((i) => {
			const title = (i.movie?.title ?? i.show?.title ?? "").toLowerCase();
			return title.includes(q);
		});
	}

	// Collect genres for dropdown
	const genreSet = new Set<string>();
	for (const item of items) {
		for (const g of item.movie?.genres ?? item.show?.genres ?? []) {
			genreSet.add(g);
		}
	}
	const allGenres = [...genreSet].sort();

	// Fetch images
	const images = await Promise.all(
		items.map((item) => {
			const tmdbId = item.movie?.ids?.tmdb ?? item.show?.ids?.tmdb;
			const tmdbType = item.movie ? "movie" : "tv";
			return tmdbId
				? fetchTmdbImages(tmdbId, tmdbType as "movie" | "tv")
				: Promise.resolve({ poster: null, backdrop: null });
		}),
	);

	const serialized = items.map((item, i) => ({
		id: item.id ?? item.rank ?? i,
		listedAt: item.listed_at ?? "",
		type: item.type ?? (item.movie ? "movie" : "show"),
		title: item.movie?.title ?? item.show?.title ?? "Unknown",
		year: item.movie?.year ?? item.show?.year,
		rating: item.movie?.rating ?? item.show?.rating,
		runtime: item.movie?.runtime ?? item.show?.runtime,
		href: item.movie ? `/movies/${item.movie.ids?.slug}` : `/shows/${item.show?.ids?.slug}`,
		posterUrl: images[i]?.poster ?? null,
		backdropUrl: images[i]?.backdrop ?? null,
		mediaType: item.movie ? ("movies" as const) : ("shows" as const),
		ids: item.movie?.ids ?? item.show?.ids ?? {},
		genres: item.movie?.genres ?? item.show?.genres ?? [],
	}));

	return (
		<div className="space-y-6">
			<div>
				<Link
					href={`/users/${slug}/lists`}
					className="mb-3 inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
				>
					<svg
						className="h-3.5 w-3.5"
						fill="none"
						stroke="currentColor"
						strokeWidth={1.5}
						viewBox="0 0 24 24"
					>
						<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
					</svg>
					All Lists
				</Link>
				<h2 className="text-xl font-bold text-zinc-100">Watchlist</h2>
			</div>

			<WatchlistClient
				items={serialized}
				slug={slug}
				currentType={type}
				currentPage={page}
				totalPages={totalPages}
				activeSort={sortBy}
				activeGenre={genreFilter}
				activeRuntime={runtimeFilter}
				activeSearch={searchQuery}
				allGenres={allGenres}
			/>
		</div>
	);
}
