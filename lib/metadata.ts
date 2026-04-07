import { cache } from "react";
import { requestWithPolicy } from "@/lib/api/http";
import { createTraktClient } from "@/lib/trakt";
import { fetchTmdbImages } from "@/lib/tmdb";
import type { MovieSummary, ShowSummary, EpisodeSummary } from "@/lib/types";

/**
 * Cached data fetchers for use in both generateMetadata and page components.
 * React's cache() deduplicates calls with the same arguments within a single
 * server request, so the Trakt API is only called once per slug.
 */

export const getMovieData = cache(async (slug: string) => {
  const client = createTraktClient();
  const res = await client.movies.summary({
    params: { id: slug },
    query: { extended: "full" },
  });
  if (res.status !== 200) return null;
  const movie = res.body as unknown as MovieSummary;
  const images = movie.ids?.tmdb
    ? await fetchTmdbImages(movie.ids.tmdb, "movie")
    : { poster: null, backdrop: null };
  return { movie, images };
});

export const getShowData = cache(async (slug: string) => {
  const client = createTraktClient();
  const res = await client.shows.summary({
    params: { id: slug },
    query: { extended: "full" },
  });
  if (res.status !== 200) return null;
  const show = res.body as unknown as ShowSummary;
  const images = show.ids?.tmdb
    ? await fetchTmdbImages(show.ids.tmdb, "tv")
    : { poster: null, backdrop: null };
  return { show, images };
});

type PersonSummary = {
  name: string;
  biography?: string;
  ids?: { tmdb?: number; slug?: string };
};

export const getPersonData = cache(async (slug: string) => {
  const client = createTraktClient();
  const res = await client.people.summary({
    params: { id: slug },
    query: { extended: "full" },
  });
  if (res.status !== 200) return null;
  const person = res.body as unknown as PersonSummary;
  let image: string | null = null;
  if (person.ids?.tmdb) {
    try {
      const r = await requestWithPolicy(
        `https://api.themoviedb.org/3/person/${person.ids.tmdb}?api_key=${process.env.TMDB_API_KEY}`,
        { next: { revalidate: 604800 } },
        { timeoutMs: 10000, maxRetries: 2 },
      );
      if (r.ok) {
        const data = await r.json<{ profile_path?: string }>();
        image = data.profile_path ? `https://image.tmdb.org/t/p/w500${data.profile_path}` : null;
      }
    } catch {
      // ignore
    }
  }
  return { person, image };
});

export const getEpisodeData = cache(async (showSlug: string, season: number, episode: number) => {
  const client = createTraktClient();
  const res = await client.shows.episode.summary({
    params: { id: showSlug, season, episode },
    query: { extended: "full" },
  });
  if (res.status !== 200) return null;
  return res.body as unknown as EpisodeSummary;
});
