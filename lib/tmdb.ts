import { cache } from "react";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

/** 7 days — images almost never change */
const IMAGE_CACHE_TTL = 604800;

export function posterUrl(path: string | null | undefined, size = "w500") {
	if (!path) return null;
	return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function backdropUrl(path: string | null | undefined, size = "w1280") {
	if (!path) return null;
	return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

interface TmdbMediaResult {
	poster_path: string | null;
	backdrop_path: string | null;
}

/**
 * Fetch poster + backdrop for a movie or TV show.
 * Wrapped with React cache() so duplicate calls with the same
 * (tmdbId, type) within a single server request are deduped.
 */
export const fetchTmdbImages = cache(
	async (
		tmdbId: number,
		type: "movie" | "tv",
	): Promise<{ poster: string | null; backdrop: string | null }> => {
		const res = await fetch(
			`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${process.env.TMDB_API_KEY}`,
			{ next: { revalidate: IMAGE_CACHE_TTL } },
		);

		if (!res.ok) {
			return { poster: null, backdrop: null };
		}

		const data: TmdbMediaResult = await res.json();
		return {
			poster: posterUrl(data.poster_path),
			backdrop: backdropUrl(data.backdrop_path),
		};
	},
);

/**
 * Fetch episode still image.
 * React cache() dedupes within a single server request.
 */
export const fetchTmdbEpisodeImages = cache(
	async (tvId: number, season: number, episode: number): Promise<{ still: string | null }> => {
		const res = await fetch(
			`https://api.themoviedb.org/3/tv/${tvId}/season/${season}/episode/${episode}?api_key=${process.env.TMDB_API_KEY}`,
			{ next: { revalidate: IMAGE_CACHE_TTL } },
		);

		if (!res.ok) {
			return { still: null };
		}

		const data = await res.json<{ still_path?: string }>();
		return {
			still: data.still_path ? `${TMDB_IMAGE_BASE}/w780${data.still_path}` : null,
		};
	},
);

/**
 * Fetch a person's profile photo.
 * React cache() dedupes — if the same person appears in cast on
 * multiple components within one request, only one API call is made.
 */
export const fetchTmdbPersonImage = cache(async (tmdbId: number): Promise<string | null> => {
	try {
		const res = await fetch(
			`https://api.themoviedb.org/3/person/${tmdbId}?api_key=${process.env.TMDB_API_KEY}`,
			{ next: { revalidate: IMAGE_CACHE_TTL } },
		);
		if (!res.ok) return null;
		const data = await res.json<{ profile_path?: string }>();
		return data.profile_path ? `${TMDB_IMAGE_BASE}/w185${data.profile_path}` : null;
	} catch {
		return null;
	}
});
