"use server";

import { fetchTmdbImages } from "@/lib/tmdb";

export async function getTmdbImageAction(
  tmdbId: number,
  mediaType: "tv" | "movie",
  season?: number,
  episode?: number,
) {
  try {
    return await fetchTmdbImages(tmdbId, mediaType, season, episode);
  } catch (error) {
    console.error("Failed to fetch TMDB image in Server Action:", error);
    return null;
  }
}
