import Image from "next/image";
import Link from "@/components/ui/link";
import { requestWithPolicy } from "@/lib/api/http";
import { createTraktClient } from "@/lib/trakt";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import type { ShowSummary } from "@/lib/types";
import { Backdrop } from "@/components/media/backdrop";
import { RatingDisplay } from "@/components/media/rating-display";
import { formatRuntime } from "@/lib/format";

interface Props {
  params: Promise<{ slug: string; season: string }>;
}

export default async function SeasonPage({ params }: Props) {
  const { slug, season: seasonStr } = await params;
  const seasonNumber = parseInt(seasonStr, 10);
  let showRes: { status: number; body?: unknown } = { status: 500 };
  let episodesRes: { status: number; body?: unknown } = { status: 500 };
  let seasonsRes: { status: number; body?: unknown } = { status: 500 };

  try {
    const client = createTraktClient();
    [showRes, episodesRes, seasonsRes] = await Promise.all([
      client.shows.summary({
        params: { id: slug },
        query: { extended: "full" },
      }),
      client.shows.season.episodes({
        // @ts-expect-error - ts-rest index signature mismatch
        params: { id: slug, season: seasonNumber },
        query: { extended: "full" },
      }),
      client.shows.seasons({ params: { id: slug }, query: { extended: "full" } }),
    ]);
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[Season Page] Failed to load season data:", error);
    }
  }

  if (showRes.status !== 200) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted">
        Show not found.
      </div>
    );
  }

  const show = showRes.body as unknown as ShowSummary;
  const images = show.ids?.tmdb
    ? await fetchTmdbImages(show.ids.tmdb, "tv").catch(() => ({ poster: null, backdrop: null }))
    : { poster: null, backdrop: null };

  type Episode = {
    season?: number;
    number?: number;
    title?: string;
    overview?: string;
    first_aired?: string;
    runtime?: number;
    rating?: number;
    votes?: number;
    ids?: { trakt?: number; tmdb?: number };
  };

  const episodes = episodesRes.status === 200 ? (episodesRes.body as Episode[]) : [];

  // Get season numbers for prev/next navigation
  type SeasonInfo = { number?: number };
  const allSeasons =
    seasonsRes.status === 200
      ? (seasonsRes.body as SeasonInfo[]).filter((s) => (s.number ?? 0) > 0).map((s) => s.number!)
      : [];
  const currentIdx = allSeasons.indexOf(seasonNumber);
  const prevSeason = currentIdx > 0 ? allSeasons[currentIdx - 1] : null;
  const nextSeason = currentIdx < allSeasons.length - 1 ? allSeasons[currentIdx + 1] : null;

  // Fetch episode stills from TMDB
  const episodeStills = await Promise.all(
    episodes.map(async (ep) => {
      if (!show.ids?.tmdb || !ep.number) return null;
      try {
        const r = await requestWithPolicy(
          `https://api.themoviedb.org/3/tv/${show.ids.tmdb}/season/${seasonNumber}/episode/${ep.number}?api_key=${process.env.TMDB_API_KEY}`,
          { next: { revalidate: 604800 } },
          { timeoutMs: 10000, maxRetries: 2 },
        );
        if (!r.ok) return null;
        const data = await r.json<{ still_path?: string }>();
        return data.still_path ? `https://image.tmdb.org/t/p/w400${data.still_path}` : null;
      } catch {
        return null;
      }
    }),
  );

  // Fetch watched status from show progress (single efficient API call for the whole show)
  const watchedEpisodes = new Set<number>(); // trakt episode ids that are watched

  try {
    const authClient = await getAuthenticatedTraktClient();
    const progressRes = await authClient.shows.progress.watched({ params: { id: slug } });

    if (progressRes.status === 200) {
      type ProgressData = {
        seasons?: Array<{
          number?: number;
          episodes?: Array<{ number?: number; completed?: boolean }>;
        }>;
      };
      const progress = progressRes.body as ProgressData;
      const seasonData = progress.seasons?.find((s) => s.number === seasonNumber);
      if (seasonData?.episodes) {
        for (const ep of seasonData.episodes) {
          if (ep.completed && ep.number != null) {
            const match = episodes.find((e) => e.number === ep.number);
            if (match?.ids?.trakt) {
              watchedEpisodes.add(match.ids.trakt);
            }
          }
        }
      }
    }
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[Season Page] Failed to load user progress:", error);
    }
    // Not authenticated — no user data
  }

  return (
    <>
      <Backdrop src={images.backdrop} alt={show.title} />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pt-6 pb-20">
        {/* Top row: breadcrumb + prev/next */}
        <div className="mb-6 flex items-center justify-between">
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/" className="text-zinc-400 transition-colors hover:text-white">
              Home
            </Link>
            <span className="text-zinc-700">/</span>
            <Link
              href={`/shows/${slug}`}
              className="text-zinc-400 transition-colors hover:text-white"
            >
              {show.title}
            </Link>
            <span className="text-zinc-700">/</span>
            <span className="font-medium text-zinc-200">Season {seasonNumber}</span>
          </nav>

          <div className="flex items-center gap-2">
            {prevSeason != null && (
              <Link
                href={`/shows/${slug}/seasons/${prevSeason}`}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 19.5L8.25 12l7.5-7.5"
                  />
                </svg>
                S{prevSeason}
              </Link>
            )}
            {nextSeason != null && (
              <Link
                href={`/shows/${slug}/seasons/${nextSeason}`}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                S{nextSeason}
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </Link>
            )}
          </div>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Season {seasonNumber}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {episodes.length} episode{episodes.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="space-y-3">
          {episodes.map((ep, i) => {
            const airDate = ep.first_aired ? new Date(ep.first_aired).toLocaleDateString() : null;
            const epTraktId = ep.ids?.trakt;
            const isWatched = epTraktId ? watchedEpisodes.has(epTraktId) : false;

            return (
              <Link
                key={ep.ids?.trakt ?? ep.number}
                href={`/shows/${slug}/seasons/${seasonNumber}/episodes/${ep.number}`}
                className="group flex gap-4 rounded-xl bg-white/5 p-3 ring-1 ring-white/5 transition-all hover:bg-white/[0.07] hover:ring-white/10"
              >
                <div className="relative aspect-video w-40 flex-shrink-0 overflow-hidden rounded-md bg-zinc-800">
                  {episodeStills[i] ? (
                    <Image
                      src={episodeStills[i]!}
                      alt={ep.title ?? ""}
                      fill
                      className="object-cover"
                      sizes="160px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-lg text-muted">
                      {ep.number}
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">
                          <span className="text-muted">E{ep.number}</span> {ep.title ?? "TBA"}
                        </p>
                        {isWatched && (
                          <span className="flex shrink-0 items-center gap-1 rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium leading-none text-green-400">
                            <svg
                              className="h-2.5 w-2.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2.5}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4.5 12.75l6 6 9-13.5"
                              />
                            </svg>
                            Watched
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {airDate && <p className="text-xs text-muted">{airDate}</p>}
                        {ep.runtime && (
                          <>
                            <span className="text-xs text-zinc-700">·</span>
                            <p className="text-xs text-muted">{formatRuntime(ep.runtime)}</p>
                          </>
                        )}
                      </div>
                    </div>
                    <RatingDisplay rating={ep.rating} votes={ep.votes} size="sm" />
                  </div>
                  {ep.overview && (
                    <p className="line-clamp-2 text-xs leading-relaxed text-zinc-400">
                      {ep.overview}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
