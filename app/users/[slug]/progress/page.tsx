import { redirect } from "next/navigation";
import { getAuthenticatedTraktClient, isCurrentUser } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { ProgressClient } from "./progress-client";

interface Props {
	params: Promise<{ slug: string }>;
	searchParams: Promise<{
		sort?: string;
		filter?: string;
		q?: string;
		page?: string;
	}>;
}

type UpNextItem = {
	show?: {
		title?: string;
		year?: number;
		rating?: number;
		network?: string;
		status?: string;
		genres?: string[];
		ids?: { slug?: string; tmdb?: number; trakt?: number };
	};
	progress?: {
		aired?: number;
		completed?: number;
		last_watched_at?: string;
		next_episode?: {
			season?: number;
			number?: number;
			title?: string;
			ids?: { trakt?: number };
		};
	};
};

export type ProgressShowItem = {
	title: string;
	year?: number;
	rating?: number;
	network?: string;
	status?: string;
	genres: string[];
	slug: string;
	traktId?: number;
	posterUrl: string | null;
	backdropUrl: string | null;
	aired: number;
	completed: number;
	lastWatchedAt: string | null;
	nextEpisode: {
		season: number;
		number: number;
		title?: string;
		traktId?: number;
	} | null;
};

const ITEMS_PER_PAGE = 50;

export default async function ProgressPage({ params, searchParams }: Props) {
	const { slug } = await params;

	// Progress is only available for the current user
	const ownProfile = await isCurrentUser(slug);
	if (!ownProfile) {
		redirect(`/users/${slug}`);
	}

	const sp = await searchParams;
	const activeSort = sp.sort ?? "recent";
	const activeFilter = sp.filter ?? "all";
	const activeSearch = sp.q ?? "";
	const currentPage = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

	let client;
	try {
		client = await getAuthenticatedTraktClient();
	} catch {
		return <div className="text-center text-sm text-zinc-500">Sign in to view your progress.</div>;
	}

	// Only fetch all items when sort/filter/search requires client-side processing.
	// Otherwise, use API pagination for efficiency.
	const needsAllItems = activeSort !== "recent" || activeFilter !== "all" || !!activeSearch;

	let rawItems: UpNextItem[];
	let apiTotalPages: number | null = null;
	let apiTotalItems: number | null = null;

	if (needsAllItems) {
		rawItems = [];
		let apiPage = 1;
		while (true) {
			const res = await client.sync.progress.upNext.nitro({
				query: { page: apiPage, limit: 100, intent: "continue" },
			});
			if (res.status !== 200) break;
			const page = res.body as UpNextItem[];
			rawItems.push(...page);
			if (page.length < 100) break;
			apiPage++;
		}
	} else {
		const res = await client.sync.progress.upNext.nitro({
			query: { page: currentPage, limit: ITEMS_PER_PAGE, intent: "continue" },
		});

		if (res.status !== 200) {
			return <div className="text-center text-sm text-zinc-500">Could not load progress.</div>;
		}

		rawItems = res.body as UpNextItem[];
		apiTotalPages =
			parseInt(String(res.headers.get?.("x-pagination-page-count") ?? "0"), 10) || null;
		apiTotalItems =
			parseInt(String(res.headers.get?.("x-pagination-item-count") ?? "0"), 10) || null;
	}

	// Fetch images
	const images = await Promise.all(
		rawItems.map((item) => {
			const tmdbId = item.show?.ids?.tmdb;
			return tmdbId
				? fetchTmdbImages(tmdbId, "tv")
				: Promise.resolve({ poster: null, backdrop: null });
		}),
	);

	// Build serializable items
	let items: ProgressShowItem[] = rawItems
		.filter((item) => item.progress?.next_episode)
		.map((item, i) => ({
			title: item.show?.title ?? "Unknown",
			year: item.show?.year ?? undefined,
			rating: item.show?.rating ?? undefined,
			network: item.show?.network ?? undefined,
			status: item.show?.status ?? undefined,
			genres: item.show?.genres ?? [],
			slug: item.show?.ids?.slug ?? "",
			traktId: item.show?.ids?.trakt,
			posterUrl: images[i]?.poster ?? null,
			backdropUrl: images[i]?.backdrop ?? null,
			aired: item.progress?.aired ?? 0,
			completed: item.progress?.completed ?? 0,
			lastWatchedAt: item.progress?.last_watched_at ?? null,
			nextEpisode: item.progress?.next_episode
				? {
						season: item.progress.next_episode.season!,
						number: item.progress.next_episode.number!,
						title: item.progress.next_episode.title,
						traktId: item.progress.next_episode.ids?.trakt,
					}
				: null,
		}));

	// Client-side filters (only applied when we fetched all)
	if (activeSearch) {
		const q = activeSearch.toLowerCase();
		items = items.filter((item) => item.title.toLowerCase().includes(q));
	}
	if (activeFilter === "returning") {
		items = items.filter((item) => item.status === "returning series");
	} else if (activeFilter === "ended") {
		items = items.filter((item) => item.status === "ended" || item.status === "canceled");
	} else if (activeFilter === "almost-done") {
		items = items.filter((item) => item.aired > 0 && item.completed / item.aired >= 0.8);
	} else if (activeFilter === "just-started") {
		items = items.filter((item) => item.aired > 0 && item.completed / item.aired <= 0.2);
	}

	// Client-side sorts
	if (activeSort === "title") {
		items.sort((a, b) => a.title.localeCompare(b.title));
	} else if (activeSort === "rating") {
		items.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
	} else if (activeSort === "progress") {
		items.sort((a, b) => {
			const pa = a.aired > 0 ? a.completed / a.aired : 0;
			const pb = b.aired > 0 ? b.completed / b.aired : 0;
			return pb - pa;
		});
	} else if (activeSort === "remaining") {
		items.sort((a, b) => a.aired - a.completed - (b.aired - b.completed));
	}

	// Pagination
	let paginatedItems: ProgressShowItem[];
	let totalPages: number;
	let totalItems: number;

	if (needsAllItems) {
		totalItems = items.length;
		totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
		const safePage = Math.min(currentPage, totalPages);
		paginatedItems = items.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);
	} else {
		paginatedItems = items;
		totalPages =
			apiTotalPages ?? (rawItems.length < ITEMS_PER_PAGE ? currentPage : currentPage + 1);
		totalItems = apiTotalItems ?? items.length;
	}

	return (
		<ProgressClient
			slug={slug}
			items={paginatedItems}
			activeSort={activeSort}
			activeFilter={activeFilter}
			activeSearch={activeSearch}
			currentPage={currentPage}
			totalPages={totalPages}
			totalItems={totalItems}
		/>
	);
}
