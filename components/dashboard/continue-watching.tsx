import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { formatRuntime } from "@/lib/format";
import { MediaCard, type MediaCardProps } from "./media-card";
import { CardGrid } from "./card-grid";

export async function ContinueWatching() {
	const client = await getAuthenticatedTraktClient();

	// Fetch user slug for progress page link
	const profileRes = await client.users.profile({ params: { id: "me" } }).catch(() => null);
	const userSlug =
		profileRes?.status === 200 ? (profileRes.body as { username?: string })?.username : null;

	// Fetch up-next shows, in-progress movies, and user ratings in parallel
	const [showsRes, moviesRes, epRatingsRes, movieRatingsRes] = await Promise.all([
		client.sync.progress.upNext.nitro({
			query: { page: 1, limit: 30, intent: "continue" },
		}),
		client.sync.progress.movies({
			query: { page: 1, limit: 10, extended: "full" },
		}),
		// Fetch episode ratings (not show ratings) for up-next cards
		client.users.ratings.episodes({ params: { id: "me" } }).catch(() => null),
		client.users.ratings.movies({ params: { id: "me" } }).catch(() => null),
	]);

	const shows = showsRes.status === 200 ? showsRes.body : [];
	const movies = moviesRes.status === 200 ? moviesRes.body : [];

	// Build user rating lookup maps keyed by trakt episode/movie ID
	type RatedEpisode = { episode?: { ids?: { trakt?: number } }; rating?: number };
	type RatedMovie = { movie?: { ids?: { trakt?: number } }; rating?: number };
	const epRatingMap = new Map<number, number>();
	const movieRatingMap = new Map<number, number>();

	if (epRatingsRes?.status === 200) {
		for (const r of epRatingsRes.body as RatedEpisode[]) {
			if (r.episode?.ids?.trakt && r.rating) epRatingMap.set(r.episode.ids.trakt, r.rating);
		}
	}
	if (movieRatingsRes?.status === 200) {
		for (const r of movieRatingsRes.body as RatedMovie[]) {
			if (r.movie?.ids?.trakt && r.rating) movieRatingMap.set(r.movie.ids.trakt, r.rating);
		}
	}

	type ShowItem = (typeof shows)[number];
	type MovieItem = (typeof movies)[number];

	const [showImages, movieImages] = await Promise.all([
		Promise.all(
			(shows as ShowItem[]).map((item) => {
				const tmdbId = item.show?.ids?.tmdb;
				return tmdbId
					? fetchTmdbImages(tmdbId, "tv")
					: Promise.resolve({ poster: null, backdrop: null });
			}),
		),
		Promise.all(
			(movies as MovieItem[]).map((item) => {
				const tmdbId = item.movie?.ids?.tmdb;
				return tmdbId
					? fetchTmdbImages(tmdbId, "movie")
					: Promise.resolve({ poster: null, backdrop: null });
			}),
		),
	]);

	const items: (MediaCardProps & { lastWatchedAt: number })[] = [];

	(shows as ShowItem[]).forEach((item, i) => {
		const show = item.show;
		const nextEp = item.progress?.next_episode;
		if (!nextEp) return;

		const epLabel = `S${String(nextEp.season).padStart(2, "0")}E${String(nextEp.number).padStart(2, "0")}`;

		// Look up user rating by the next episode's trakt ID
		const nextEpTraktId = nextEp.ids?.trakt;
		const userEpRating = nextEpTraktId ? epRatingMap.get(nextEpTraktId) : undefined;

		items.push({
			title: show?.title ?? "Unknown",
			subtitle: nextEp.title ? `${epLabel} · ${nextEp.title}` : epLabel,
			href: `/shows/${show?.ids?.slug}/seasons/${nextEp.season}/episodes/${nextEp.number}`,
			backdropUrl: showImages[i]?.backdrop ?? showImages[i]?.poster ?? null,
			rating: show?.rating ?? undefined,
			userRating: userEpRating,
			mediaType: "shows",
			ids: show?.ids ?? {},
			progress: item.progress
				? { aired: item.progress.aired ?? 0, completed: item.progress.completed ?? 0 }
				: undefined,
			lastWatchedAt: item.progress?.last_watched_at
				? new Date(item.progress.last_watched_at).getTime()
				: 0,
		});
	});

	(movies as MovieItem[]).forEach((item, i) => {
		const movie = item.movie;
		const progress = (item as Record<string, unknown>).progress as number | undefined;
		const runtime = movie?.runtime ?? 90;
		if (progress != null && !isNaN(progress)) {
			const minutesElapsed = (progress / 100) * runtime;
			if (minutesElapsed < 5) return;
		}

		items.push({
			title: movie?.title ?? "Unknown",
			subtitle:
				[movie?.year && String(movie.year), movie?.runtime && formatRuntime(movie.runtime)]
					.filter(Boolean)
					.join(" · ") || undefined,
			href: `/movies/${movie?.ids?.slug}`,
			backdropUrl: movieImages[i]?.backdrop ?? movieImages[i]?.poster ?? null,
			rating: movie?.rating ?? undefined,
			userRating: movie?.ids?.trakt ? movieRatingMap.get(movie.ids.trakt) : undefined,
			mediaType: "movies",
			ids: movie?.ids ?? {},
			lastWatchedAt: item.paused_at ? new Date(item.paused_at).getTime() : 0,
		});
	});

	items.sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);

	if (items.length === 0) {
		return (
			<div className="rounded-xl border border-border bg-card/30 p-8 text-center text-sm text-muted">
				No items in progress. Start watching something!
			</div>
		);
	}

	return (
		<CardGrid
			title="Continue Watching"
			defaultRows={3}
			titleHref={userSlug ? `/users/${userSlug}/progress` : undefined}
		>
			{items.map((item) => (
				<MediaCard key={`${item.mediaType}-${String(item.ids.trakt ?? item.ids.slug)}`} {...item} />
			))}
		</CardGrid>
	);
}
