import { unstable_cache } from "next/cache";
import { createTraktClient } from "@/lib/trakt";
import { measureAsync } from "@/lib/perf";
import { isTraktExpectedError } from "@/lib/trakt-errors";

interface TraktEpisodeSummary {
  ids?: { trakt?: number | null };
  first_aired?: string | null;
  rating?: number | null;
}

interface TraktSeasonSummary {
  number?: number | null;
  aired_episodes?: number | null;
  episode_count?: number | null;
  total_episodes?: number | null;
  episodes?: TraktEpisodeSummary[] | null;
}

export async function getCachedShowSeasonCounts(slug: string) {
  return measureAsync(
    "trakt-cache:show-season-counts",
    () =>
      unstable_cache(
        async () => {
          try {
            const client = createTraktClient();
            const res = await client.shows.seasons({
              params: { id: slug },
              query: { extended: "full" } as any,
            });

            if (res.status !== 200 || !Array.isArray(res.body)) {
              return [] as TraktSeasonSummary[];
            }

            return (res.body as TraktSeasonSummary[]).map((season) => ({
              number: season.number ?? null,
              aired_episodes: season.aired_episodes ?? null,
              total_episodes:
                season.episode_count ??
                (Array.isArray(season.episodes) ? season.episodes.length : null),
            }));
          } catch (error) {
            if (!isTraktExpectedError(error)) {
              console.error("[Trakt Cache] Failed to fetch show season counts:", error);
            }
            return [] as TraktSeasonSummary[];
          }
        },
        [`trakt-show-season-counts:${slug}`],
        { revalidate: 60 * 60 },
      )(),
    { slug },
  );
}

export async function getCachedShowEpisodeMetadata(slug: string) {
  return measureAsync(
    "trakt-cache:show-episode-metadata",
    () =>
      unstable_cache(
        async () => {
          try {
            const client = createTraktClient();
            const res = await client.shows.seasons({
              params: { id: slug },
              query: { extended: "full,episodes" } as any,
            });

            if (res.status !== 200 || !Array.isArray(res.body)) {
              return {} as Record<
                number,
                {
                  releasedAt?: string;
                  rating?: number;
                  totalEpisodesInSeason: number;
                  isLastSeason: boolean;
                }
              >;
            }

            const seasons = (res.body as TraktSeasonSummary[]).filter(
              (season) => (season.number ?? 0) > 0,
            );
            if (seasons.length === 0) {
              return {};
            }

            const lastSeasonNumber = Math.max(...seasons.map((season) => season.number ?? 0));
            const metadata: Record<
              number,
              {
                releasedAt?: string;
                rating?: number;
                totalEpisodesInSeason: number;
                isLastSeason: boolean;
              }
            > = {};

            seasons.forEach((season) => {
              const seasonNumber = season.number ?? 0;
              const episodes = season.episodes ?? [];
              const totalEpisodesInSeason = episodes.length;
              const isLastSeason = seasonNumber === lastSeasonNumber;

              episodes.forEach((episode) => {
                const traktId = episode.ids?.trakt;
                if (!traktId) {
                  return;
                }

                metadata[traktId] = {
                  releasedAt: episode.first_aired ?? undefined,
                  rating: episode.rating ?? undefined,
                  totalEpisodesInSeason,
                  isLastSeason,
                };
              });
            });

            return metadata;
          } catch (error) {
            if (!isTraktExpectedError(error)) {
              console.error("[Trakt Cache] Failed to fetch show episode metadata:", error);
            }
            return {} as Record<
              number,
              {
                releasedAt?: string;
                rating?: number;
                totalEpisodesInSeason: number;
                isLastSeason: boolean;
              }
            >;
          }
        },
        [`trakt-show-episode-metadata:${slug}`],
        { revalidate: 60 * 60 },
      )(),
    { slug },
  );
}
