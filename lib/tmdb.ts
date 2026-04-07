import { cache } from "react";
import { requestWithPolicy } from "@/lib/api/http";

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

export function stillUrl(path: string | null | undefined, size = "w780") {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

interface TmdbMediaResult {
  poster_path: string | null;
  backdrop_path: string | null;
  still_path?: string | null; // Added for episodes
}

/**
 * Fetch poster + backdrop for a movie, TV show, season, OR specific episode still.
 */
export const fetchTmdbImages = cache(
  async (
    tmdbId: number,
    type: "movie" | "tv",
    season?: number,
    episode?: number, // Added episode parameter
  ): Promise<{ poster: string | null; backdrop: string | null; still: string | null }> => {
    let url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${process.env.TMDB_API_KEY}`;

    // 1. Episode Endpoint (Highest Priority for Recently Watched)
    if (type === "tv" && season !== undefined && episode !== undefined) {
      url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}/episode/${episode}?api_key=${process.env.TMDB_API_KEY}`;
    }
    // 2. Season Endpoint
    else if (type === "tv" && season !== undefined) {
      url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${process.env.TMDB_API_KEY}`;
    }

    const res = await requestWithPolicy(
      url,
      { next: { revalidate: IMAGE_CACHE_TTL } },
      { timeoutMs: 10000, maxRetries: 2 },
    );

    if (!res.ok) {
      return { poster: null, backdrop: null, still: null };
    }

    const data: TmdbMediaResult = await res.json();

    return {
      poster: posterUrl(data.poster_path),
      backdrop: backdropUrl(data.backdrop_path),
      // still_path is what TMDB uses for episode screenshots
      still: stillUrl(data.still_path),
    };
  },
);

/**
 * Legacy support for specific episode still fetch if needed
 */
export const fetchTmdbEpisodeImages = cache(
  async (tvId: number, season: number, episode: number): Promise<{ still: string | null }> => {
    const res = await fetchTmdbImages(tvId, "tv", season, episode);
    return { still: res.still };
  },
);

export const fetchTmdbPersonImage = cache(async (tmdbId: number): Promise<string | null> => {
  try {
    const res = await requestWithPolicy(
      `https://api.themoviedb.org/3/person/${tmdbId}?api_key=${process.env.TMDB_API_KEY}`,
      { next: { revalidate: IMAGE_CACHE_TTL } },
      { timeoutMs: 10000, maxRetries: 2 },
    );
    if (!res.ok) return null;
    const data = await res.json<{ profile_path?: string }>();
    return data.profile_path ? `${TMDB_IMAGE_BASE}/w185${data.profile_path}` : null;
  } catch {
    return null;
  }
});
