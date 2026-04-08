import { NextRequest, NextResponse } from "next/server";
import { withLocalCache } from "@/lib/local-cache";
import { getAuthenticatedTraktClient } from "@/lib/trakt-server";

const BREAKDOWN_TTL_MS = 10 * 60_000;

type ProgressEpisodeBreakdown = {
  season: number;
  number: number;
  title: string;
  traktId?: number;
  watched: boolean;
  plays: number;
  lastWatchedAt: string | null;
  runtime: number;
  firstAired: string | null;
};

type ProgressSeasonBreakdown = {
  season: number;
  year?: number;
  aired: number;
  completed: number;
  plays: number;
  runtimeWatched: number;
  runtimeLeft: number;
  episodes: ProgressEpisodeBreakdown[];
};

async function getCachedBreakdown(userSlug: string, showSlug: string) {
  return withLocalCache(
    `progress-breakdown:${userSlug}:${showSlug}`,
    BREAKDOWN_TTL_MS,
    async () => {
      const client = await getAuthenticatedTraktClient();
      if (!client) {
        throw new Error("Unauthorized");
      }

      const currentTime = new Date();
      const [progressRes, summaryRes, seasonsRes] = await Promise.all([
        client.shows.progress
          .watched({
            params: { id: showSlug },
            query: { hidden: "false", specials: "false", count_specials: "false" } as any,
          })
          .catch(() => null),
        client.shows
          .summary({
            params: { id: showSlug },
            query: { extended: "full" } as any,
          })
          .catch(() => null),
        (client.shows as any)
          .seasons({
            params: { id: showSlug },
            query: { extended: "episodes,full" } as any,
          })
          .catch(() => null),
      ]);

      const progress = progressRes?.status === 200 ? (progressRes.body as any) : null;
      const summary = summaryRes?.status === 200 ? (summaryRes.body as any) : null;
      const allSeasons = seasonsRes?.status === 200 ? (seasonsRes.body as any[]) : [];
      const runtime = summary?.runtime ?? 0;
      const progressSeasonMap = new Map<number, any>(
        (progress?.seasons ?? []).map((season: any) => [season.number, season]),
      );

      const seasons: ProgressSeasonBreakdown[] = allSeasons
        .filter((season: any) => season.number > 0)
        .sort((a: any, b: any) => a.number - b.number)
        .map((season: any) => {
          const seasonProgress = progressSeasonMap.get(season.number);
          const progressEpisodeMap = new Map<number, any>(
            (seasonProgress?.episodes ?? []).map((episode: any) => [episode.number, episode]),
          );

          const episodes: ProgressEpisodeBreakdown[] = (season.episodes ?? [])
            .filter((episode: any) => episode.number > 0)
            .filter((episode: any) => {
              if (!episode.first_aired) return false;

              const firstAired = new Date(episode.first_aired);
              return Number.isNaN(firstAired.getTime()) || firstAired <= currentTime;
            })
            .sort((a: any, b: any) => a.number - b.number)
            .map((episode: any) => {
              const episodeProgress = progressEpisodeMap.get(episode.number);
              const episodeRuntime = episode.runtime ?? runtime;
              const plays = episodeProgress?.plays ?? (episodeProgress?.completed ? 1 : 0);

              return {
                season: season.number,
                number: episode.number,
                title: episode.title ?? "",
                traktId: episode.ids?.trakt,
                watched: plays > 0 || Boolean(episodeProgress?.completed),
                plays,
                lastWatchedAt: episodeProgress?.last_watched_at ?? null,
                runtime: episodeRuntime,
                firstAired: episode.first_aired ?? null,
              };
            });

          const completedEpisodes = episodes.filter((episode) => episode.watched);
          const remainingEpisodes = episodes.filter((episode) => !episode.watched);

          return {
            season: season.number,
            year: season.year,
            aired: episodes.length,
            completed: completedEpisodes.length,
            plays: episodes.reduce((total, episode) => total + episode.plays, 0),
            runtimeWatched: completedEpisodes.reduce(
              (total, episode) => total + episode.runtime * Math.max(episode.plays, 1),
              0,
            ),
            runtimeLeft: remainingEpisodes.reduce((total, episode) => total + episode.runtime, 0),
            episodes,
          };
        });

      return { seasons };
    },
  );
}

export async function GET(request: NextRequest) {
  const userSlug = request.nextUrl.searchParams.get("slug");
  const showSlug = request.nextUrl.searchParams.get("show");

  if (!userSlug || !showSlug) {
    return NextResponse.json({ error: "Missing slug or show" }, { status: 400 });
  }

  try {
    const data = await getCachedBreakdown(userSlug, showSlug);
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load progress breakdown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
