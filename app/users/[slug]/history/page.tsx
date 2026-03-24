import { createTraktClient } from "@/lib/trakt";
import { fetchTmdbImages } from "@/lib/tmdb";
import { HistoryClient } from "./history-client";

interface Props {
	params: Promise<{ slug: string }>;
	searchParams: Promise<{
		type?: string;
		page?: string;
		sort?: string;
		q?: string;
	}>;
}

type HistoryItem = {
	id?: number;
	watched_at?: string;
	action?: string;
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
		ids?: { slug?: string; tmdb?: number; trakt?: number };
	};
	episode?: {
		season?: number;
		number?: number;
		title?: string;
		rating?: number;
		ids?: { trakt?: number };
	};
};

export default async function HistoryPage({ params, searchParams }: Props) {
	const { slug } = await params;
	const sp = await searchParams;
	const type = (sp.type as "all" | "movies" | "shows") || "all";
	const page = parseInt(sp.page ?? "1", 10);
	const sortBy = sp.sort ?? "newest";
	const searchQuery = sp.q ?? "";
	const limit = 42;
	const client = createTraktClient();

	let items: HistoryItem[] = [];
	let totalPages = 1;
	let totalItems = 0;

	if (type === "movies") {
		const res = await client.users.history.movies({
			params: { id: slug },
			query: { page, limit, extended: "full" },
		});
		if (res.status === 200) {
			items = res.body as HistoryItem[];
			totalPages = parseInt(String(res.headers.get?.("x-pagination-page-count") ?? "1"), 10);
			totalItems = parseInt(String(res.headers.get?.("x-pagination-item-count") ?? "0"), 10);
		}
	} else if (type === "shows") {
		const res = await client.users.history.shows({
			params: { id: slug },
			query: { page, limit, extended: "full" },
		});
		if (res.status === 200) {
			items = res.body as HistoryItem[];
			totalPages = parseInt(String(res.headers.get?.("x-pagination-page-count") ?? "1"), 10);
			totalItems = parseInt(String(res.headers.get?.("x-pagination-item-count") ?? "0"), 10);
		}
	} else {
		const [movieRes, showRes] = await Promise.all([
			client.users.history.movies({
				params: { id: slug },
				query: { page, limit: Math.ceil(limit / 2), extended: "full" },
			}),
			client.users.history.shows({
				params: { id: slug },
				query: { page, limit: Math.ceil(limit / 2), extended: "full" },
			}),
		]);

		const movies = movieRes.status === 200 ? (movieRes.body as HistoryItem[]) : [];
		const shows = showRes.status === 200 ? (showRes.body as HistoryItem[]) : [];

		items = [...movies, ...shows].sort(
			(a, b) => new Date(b.watched_at ?? 0).getTime() - new Date(a.watched_at ?? 0).getTime(),
		);

		const movieTotal = parseInt(
			String(
				(movieRes as { headers?: { get?: (k: string) => string } }).headers?.get?.(
					"x-pagination-page-count",
				) ?? "1",
			),
			10,
		);
		const showTotal = parseInt(
			String(
				(showRes as { headers?: { get?: (k: string) => string } }).headers?.get?.(
					"x-pagination-page-count",
				) ?? "1",
			),
			10,
		);
		totalPages = Math.max(movieTotal, showTotal);
		totalItems = items.length;
	}

	// Build a map of user ratings
	type RatedItem = {
		rating?: number;
		movie?: { ids?: { trakt?: number } };
		show?: { ids?: { trakt?: number } };
		episode?: { ids?: { trakt?: number } };
	};
	const userRatingsMap = new Map<number, number>();
	try {
		const [movieRatings, episodeRatings] = await Promise.all([
			client.users.ratings.movies({ params: { id: slug } }),
			client.users.ratings.episodes({ params: { id: slug } }),
		]);
		if (movieRatings.status === 200) {
			for (const r of movieRatings.body as RatedItem[]) {
				const id = r.movie?.ids?.trakt;
				if (id && r.rating) userRatingsMap.set(id, r.rating);
			}
		}
		if (episodeRatings.status === 200) {
			for (const r of episodeRatings.body as RatedItem[]) {
				const id = r.episode?.ids?.trakt;
				if (id && r.rating) userRatingsMap.set(id, r.rating);
			}
		}
	} catch {
		// Not available
	}

	// Server-side search
	if (searchQuery) {
		const q = searchQuery.toLowerCase();
		items = items.filter((i) => {
			const title = (i.movie?.title ?? i.show?.title ?? "").toLowerCase();
			const epTitle = i.episode?.title?.toLowerCase() ?? "";
			return title.includes(q) || epTitle.includes(q);
		});
	}

	// Server-side sort
	items.sort((a, b) => {
		switch (sortBy) {
			case "oldest":
				return new Date(a.watched_at ?? 0).getTime() - new Date(b.watched_at ?? 0).getTime();
			case "title": {
				const aT = a.movie?.title ?? a.show?.title ?? "";
				const bT = b.movie?.title ?? b.show?.title ?? "";
				return aT.localeCompare(bT);
			}
			case "rating":
				return (
					(b.movie?.rating ?? b.episode?.rating ?? 0) - (a.movie?.rating ?? a.episode?.rating ?? 0)
				);
			default:
				return new Date(b.watched_at ?? 0).getTime() - new Date(a.watched_at ?? 0).getTime();
		}
	});

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

	const serializedItems = items.map((item, i) => ({
		id: item.id ?? i,
		watched_at: item.watched_at ?? "",
		type: item.movie ? ("movie" as const) : ("show" as const),
		title: item.movie?.title ?? item.show?.title ?? "Unknown",
		year: item.movie?.year ?? item.show?.year,
		runtime: item.movie?.runtime,
		rating: item.movie?.rating ?? item.episode?.rating,
		userRating: userRatingsMap.get((item.movie?.ids?.trakt ?? item.episode?.ids?.trakt) as number),
		href: item.movie
			? `/movies/${item.movie.ids?.slug}`
			: item.episode
				? `/shows/${item.show?.ids?.slug}/seasons/${item.episode.season}/episodes/${item.episode.number}`
				: `/shows/${item.show?.ids?.slug}`,
		subtitle: item.movie
			? undefined
			: item.episode
				? `S${item.episode.season}E${item.episode.number} · ${item.episode.title ?? ""}`
				: undefined,
		posterUrl: images[i]?.poster ?? null,
		backdropUrl: images[i]?.backdrop ?? null,
		mediaType: item.movie ? ("movies" as const) : ("episodes" as const),
		ids: item.movie?.ids ?? item.episode?.ids ?? item.show?.ids ?? {},
	}));

	return (
		<HistoryClient
			items={serializedItems}
			slug={slug}
			currentType={type}
			currentPage={page}
			totalPages={totalPages}
			totalItems={totalItems}
			activeSort={sortBy}
			activeSearch={searchQuery}
		/>
	);
}
