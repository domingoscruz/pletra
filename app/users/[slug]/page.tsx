import { Suspense } from "react";
import { createTraktClient } from "@/lib/trakt";
import { getCachedShowEpisodeMetadata } from "@/lib/trakt-cache";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { fetchTmdbImages } from "@/lib/tmdb";
import { MediaCard } from "@/components/dashboard/media-card";
import { CardGrid } from "@/components/dashboard/card-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { Last30DaysChart } from "./last-30-days-chart";
import { RatingsSummaryChart } from "./ratings-summary-chart";

interface Props {
  params: Promise<{ slug: string }>;
}

type FavItem = {
  movie?: {
    title?: string;
    year?: number;
    rating?: number;
    runtime?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
  show?: {
    title?: string;
    year?: number;
    rating?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
};

type HistoryItem = {
  watched_at?: string;
  movie?: {
    title?: string;
    year?: number;
    rating?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
  show?: {
    title?: string;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
    images?: Record<string, unknown>;
  };
  episode?: {
    season?: number;
    number?: number;
    title?: string;
    rating?: number;
    runtime?: number;
    first_aired?: string;
    ids?: { trakt?: number };
    images?: Record<string, unknown>;
  };
};

type EpisodeMetadata = {
  releasedAt?: string;
  rating?: number;
  totalEpisodesInSeason: number;
  isLastSeason: boolean;
};

type RatedItem = {
  rating?: number;
};

const RATING_LABELS = [
  "Weak sauce :(",
  "Terrible",
  "Bad",
  "Poor",
  "Meh",
  "Fair",
  "Good",
  "Great",
  "Superb",
  "Totally Ninja!",
];

function RecentlyWatchedTitle({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center text-zinc-100">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6l4 2" />
        </svg>
      </span>
      <span>{label}</span>
    </span>
  );
}

function extractTraktImage(
  obj:
    | {
        images?: Record<string, unknown>;
      }
    | null
    | undefined,
  types: ("screenshot" | "thumb" | "fanart" | "poster")[],
) {
  if (!obj?.images) return null;

  for (const type of types) {
    const target = obj.images[type];
    let rawUrl: string | null = null;

    if (Array.isArray(target) && target.length > 0) {
      rawUrl = typeof target[0] === "string" ? target[0] : null;
    } else if (typeof target === "string") {
      rawUrl = target;
    } else if (target && typeof target === "object") {
      const imageRecord = target as Record<string, unknown>;
      rawUrl =
        (typeof imageRecord.medium === "string" && imageRecord.medium) ||
        (typeof imageRecord.full === "string" && imageRecord.full) ||
        (typeof imageRecord.thumb === "string" && imageRecord.thumb) ||
        null;
    }

    if (rawUrl) {
      return rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    }
  }

  return null;
}

function formatExactDate(dateStr?: string) {
  if (!dateStr) return undefined;

  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatMinutesCompact(minutes: number) {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(" ");
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function getEpisodeBadge(item: HistoryItem, metadata?: EpisodeMetadata) {
  const season = item.episode?.season;
  const number = item.episode?.number;

  if (!metadata || !season || !number) {
    return undefined;
  }

  if (season === 1 && number === 1) {
    return "Series Premiere" as const;
  }

  if (number === 1) {
    return "Season Premiere" as const;
  }

  if (metadata.isLastSeason && number === metadata.totalEpisodesInSeason) {
    return "Series Finale" as const;
  }

  if (number === metadata.totalEpisodesInSeason) {
    return "Season Finale" as const;
  }

  return undefined;
}

async function UserFavorites({ slug, type }: { slug: string; type: "movies" | "shows" }) {
  try {
    const client = createTraktClient();
    const res =
      type === "movies"
        ? await client.users.favorites.movies({
            params: { id: slug, sort: "rank" },
            query: { extended: "full", limit: 12 },
          })
        : await client.users.favorites.shows({
            params: { id: slug, sort: "rank" },
            query: { extended: "full", limit: 12 },
          });

    if (res.status !== 200) return null;

    const items = (res.body as FavItem[]) ?? [];
    if (items.length === 0) return null;

    const images = await Promise.all(
      items.map((item) => {
        const tmdbId = type === "movies" ? item.movie?.ids?.tmdb : item.show?.ids?.tmdb;
        return tmdbId
          ? fetchTmdbImages(tmdbId, type === "movies" ? "movie" : "tv")
          : Promise.resolve({ poster: null, backdrop: null, still: null });
      }),
    );

    return (
      <CardGrid
        title={`Favorite ${type === "movies" ? "Movies" : "Shows"}`}
        defaultRows={1}
        rowSize={6}
      >
        {items.map((item, i) => {
          const media = type === "movies" ? item.movie : item.show;
          if (!media) return null;

          return (
            <MediaCard
              key={media.ids?.trakt}
              title={media.title ?? "Unknown"}
              subtitle={media.year ? String(media.year) : undefined}
              href={`/${type}/${media.ids?.slug}`}
              backdropUrl={images[i]?.backdrop ?? null}
              posterUrl={images[i]?.poster ?? null}
              rating={media.rating}
              mediaType={type}
              ids={media.ids ?? {}}
              variant="poster"
            />
          );
        })}
      </CardGrid>
    );
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[User Page] Favorites fetch failed:", error);
    }
    return null;
  }
}

async function UserRecentEpisodes({ slug }: { slug: string }) {
  try {
    const client = createTraktClient();
    const [historyRes, ratingsRes] = await Promise.all([
      client.users.history.shows({
        params: { id: slug },
        query: { page: 1, limit: 4, extended: "full,images" as any },
      }),
      client.users.ratings.episodes({ params: { id: slug } }).catch(() => null),
    ]);

    const recent = historyRes.status === 200 ? (historyRes.body as HistoryItem[]) : [];
    if (recent.length === 0) return null;

    const userRatingMap = new Map<number, number>();
    if (ratingsRes?.status === 200) {
      for (const rating of ratingsRes.body as Array<{
        rating?: number;
        episode?: { ids?: { trakt?: number } };
      }>) {
        if (rating.episode?.ids?.trakt && rating.rating) {
          userRatingMap.set(rating.episode.ids.trakt, rating.rating);
        }
      }
    }

    const uniqueShowSlugs = Array.from(
      new Set(recent.map((item) => item.show?.ids?.slug).filter(Boolean)),
    );

    const metadataEntries = await Promise.all(
      uniqueShowSlugs.map(async (showSlug) => [
        showSlug,
        await getCachedShowEpisodeMetadata(showSlug as string).catch(() => null),
      ]),
    );

    const episodeMetadataByShow = new Map(
      metadataEntries.filter((entry): entry is [string, Record<number, EpisodeMetadata>] =>
        Boolean(entry[0] && entry[1]),
      ),
    );

    const imageUrls = await Promise.all(
      recent.map(async (item) => {
        const tmdbId = item.show?.ids?.tmdb;

        let imageUrl: string | null = null;
        let showFallback: {
          poster: string | null;
          backdrop: string | null;
          still: string | null;
        } | null = null;

        if (tmdbId && item.episode?.season != null && item.episode?.number != null) {
          const episodeImages = await fetchTmdbImages(
            tmdbId,
            "tv",
            item.episode.season,
            item.episode.number,
          ).catch(() => null);

          imageUrl = episodeImages?.still ?? null;

          if (!imageUrl) {
            showFallback = await fetchTmdbImages(tmdbId, "tv").catch(() => null);
          }
        }

        if (!imageUrl) {
          imageUrl = extractTraktImage(item.episode, ["screenshot", "thumb"]);
        }

        if (!imageUrl) {
          imageUrl = showFallback?.backdrop ?? showFallback?.poster ?? null;
        }

        if (!imageUrl) {
          imageUrl = extractTraktImage(item.show, ["fanart", "poster"]);
        }

        return imageUrl;
      }),
    );

    return (
      <CardGrid
        title={<RecentlyWatchedTitle label="Recently Watched Episodes" />}
        defaultRows={1}
        rowSize={4}
        containerClass="mx-auto max-w-[76rem]"
        gridClass="grid w-full grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-4"
        headerAction={{ href: `/users/${slug}/history?type=shows`, label: "See More" }}
      >
        {recent.map((item, index) => {
          const show = item.show;
          const episode = item.episode;

          if (!show || !episode) return null;

          const episodeLabel = `${episode.season}x${String(episode.number ?? 0).padStart(2, "0")}`;
          const metadata = episodeMetadataByShow.get(show.ids?.slug ?? "")?.[
            episode.ids?.trakt ?? 0
          ];
          const releasedAt = metadata?.releasedAt ?? episode.first_aired;

          return (
            <MediaCard
              key={`episode-${episode.ids?.trakt ?? show.ids?.trakt}-${item.watched_at}`}
              title={show.title ?? "Unknown"}
              subtitle={`${episodeLabel} ${episode.title ?? ""}`.trim()}
              meta={formatExactDate(item.watched_at)}
              href={`/shows/${show.ids?.slug}/seasons/${episode.season}/episodes/${episode.number}`}
              showHref={`/shows/${show.ids?.slug}`}
              backdropUrl={imageUrls[index]}
              posterUrl={null}
              rating={metadata?.rating ?? episode.rating}
              userRating={userRatingMap.get(episode.ids?.trakt ?? 0)}
              mediaType="episodes"
              ids={show.ids ?? {}}
              episodeIds={episode.ids ?? {}}
              releasedAt={releasedAt}
              watchedAt={item.watched_at}
              variant="landscape"
              showInlineActions
              isWatched
              specialTag={getEpisodeBadge(item, metadata)}
            />
          );
        })}
      </CardGrid>
    );
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[User Page] Episode history fetch failed:", error);
    }
    return null;
  }
}

async function UserRecentMovies({ slug }: { slug: string }) {
  try {
    const client = createTraktClient();
    const [historyRes, ratingsRes] = await Promise.all([
      client.users.history.movies({
        params: { id: slug },
        query: { page: 1, limit: 6, extended: "full" },
      }),
      client.users.ratings.movies({ params: { id: slug } }).catch(() => null),
    ]);

    const recent = historyRes.status === 200 ? (historyRes.body as HistoryItem[]) : [];
    if (recent.length === 0) return null;

    const userRatingMap = new Map<number, number>();
    if (ratingsRes?.status === 200) {
      for (const rating of ratingsRes.body as Array<{
        rating?: number;
        movie?: { ids?: { trakt?: number } };
      }>) {
        if (rating.movie?.ids?.trakt && rating.rating) {
          userRatingMap.set(rating.movie.ids.trakt, rating.rating);
        }
      }
    }

    const images = await Promise.all(
      recent.map((item) => {
        const tmdbId = item.movie?.ids?.tmdb;
        return tmdbId
          ? fetchTmdbImages(tmdbId, "movie")
          : Promise.resolve({ poster: null, backdrop: null, still: null });
      }),
    );

    return (
      <CardGrid
        title={<RecentlyWatchedTitle label="Recently Watched Movies" />}
        defaultRows={1}
        rowSize={6}
        containerClass="mx-auto max-w-[76rem]"
        gridClass="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        headerAction={{ href: `/users/${slug}/history?type=movies`, label: "See More" }}
      >
        {recent.map((item, index) => {
          const movie = item.movie;
          if (!movie) return null;

          return (
            <MediaCard
              key={`movie-${movie.ids?.trakt}-${item.watched_at}`}
              title={movie.title ?? "Unknown"}
              subtitle={
                formatExactDate(item.watched_at) ?? (movie.year ? String(movie.year) : undefined)
              }
              href={`/movies/${movie.ids?.slug}`}
              backdropUrl={images[index]?.backdrop ?? null}
              posterUrl={images[index]?.poster ?? null}
              rating={movie.rating}
              userRating={userRatingMap.get(movie.ids?.trakt ?? 0)}
              mediaType="movies"
              ids={movie.ids ?? {}}
              variant="poster"
              showInlineActions
              watchedAt={item.watched_at}
              isWatched
            />
          );
        })}
      </CardGrid>
    );
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[User Page] Movie history fetch failed:", error);
    }
    return null;
  }
}

async function UserRatingsSummary({ slug }: { slug: string }) {
  try {
    const client = createTraktClient();
    const [movieRatingsRes, showRatingsRes, episodeRatingsRes] = await Promise.all([
      client.users.ratings.movies({ params: { id: slug } }).catch(() => null),
      client.users.ratings.shows({ params: { id: slug } }).catch(() => null),
      client.users.ratings.episodes({ params: { id: slug } }).catch(() => null),
    ]);

    const allRatings = [
      ...((movieRatingsRes?.status === 200 ? (movieRatingsRes.body as RatedItem[]) : []) ?? []),
      ...((showRatingsRes?.status === 200 ? (showRatingsRes.body as RatedItem[]) : []) ?? []),
      ...((episodeRatingsRes?.status === 200 ? (episodeRatingsRes.body as RatedItem[]) : []) ?? []),
    ].filter((item) => typeof item.rating === "number" && item.rating >= 1 && item.rating <= 10);

    if (allRatings.length === 0) return null;

    const distribution = Array.from({ length: 10 }, () => 0);
    let total = 0;

    for (const item of allRatings) {
      const rating = item.rating as number;
      distribution[rating - 1] += 1;
      total += rating;
    }

    const average = total / allRatings.length;

    return (
      <RatingsSummaryChart
        slug={slug}
        totalRatings={allRatings.length}
        average={average}
        distribution={distribution}
        labels={RATING_LABELS}
      />
    );
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[User Page] Ratings summary fetch failed:", error);
    }
    return null;
  }
}

async function UserLast30Days({ slug }: { slug: string }) {
  try {
    const client = createTraktClient();
    const [movieRes, showRes] = await Promise.all([
      client.users.history.movies({
        params: { id: slug },
        query: { page: 1, limit: 100, extended: "full" },
      }),
      client.users.history.shows({
        params: { id: slug },
        query: { page: 1, limit: 200, extended: "full" },
      }),
    ]);

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 29);

    const movieItems = (movieRes.status === 200 ? (movieRes.body as HistoryItem[]) : []).filter(
      (item) => item.watched_at && new Date(item.watched_at) >= start,
    );
    const episodeItems = (showRes.status === 200 ? (showRes.body as HistoryItem[]) : []).filter(
      (item) => item.watched_at && new Date(item.watched_at) >= start,
    );

    if (movieItems.length === 0 && episodeItems.length === 0) return null;

    const dayBuckets = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return {
        key: date.toISOString().slice(0, 10),
        label: String(date.getDate()),
        fullLabel: formatDayLabel(date),
        count: 0,
        minutes: 0,
        episodeCount: 0,
        movieCount: 0,
      };
    });
    const bucketMap = new Map(dayBuckets.map((bucket) => [bucket.key, bucket]));

    let totalMinutes = 0;

    for (const item of movieItems) {
      const key = item.watched_at?.slice(0, 10);
      if (key) {
        bucketMap.get(key)!.count += 1;
        bucketMap.get(key)!.movieCount += 1;
      }
      const runtime = item.movie?.runtime ?? 0;
      totalMinutes += runtime;
      if (key) {
        bucketMap.get(key)!.minutes += runtime;
      }
    }

    for (const item of episodeItems) {
      const key = item.watched_at?.slice(0, 10);
      if (key) {
        bucketMap.get(key)!.count += 1;
        bucketMap.get(key)!.episodeCount += 1;
      }
      const runtime = (item.episode as { runtime?: number } | undefined)?.runtime ?? 0;
      totalMinutes += runtime;
      if (key) {
        bucketMap.get(key)!.minutes += runtime;
      }
    }

    return (
      <Last30DaysChart
        slug={slug}
        totalWatchTime={formatMinutesCompact(totalMinutes)}
        episodeCount={episodeItems.length}
        movieCount={movieItems.length}
        days={dayBuckets.map((bucket) => ({
          key: bucket.key,
          label: bucket.label,
          fullLabel: bucket.fullLabel,
          value: bucket.minutes,
          watchTime: formatMinutesCompact(bucket.minutes),
          episodeCount: bucket.episodeCount,
          movieCount: bucket.movieCount,
        }))}
      />
    );
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[User Page] Last 30 days fetch failed:", error);
    }
    return null;
  }
}

function SectionSkeleton({ title }: { title: string }) {
  const isRecentEpisodes = title === "Recently Watched Episodes";
  const isRecentMovies = title === "Recently Watched Movies";

  return (
    <div className="space-y-3">
      <div className="mb-3 flex items-center gap-3">
        <div className="skeleton h-4 w-40 rounded" />
        <div className="h-px flex-1 bg-zinc-800" />
      </div>
      <div
        className={
          isRecentEpisodes
            ? "mx-auto grid max-w-[76rem] grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4"
            : isRecentMovies
              ? "mx-auto grid max-w-[76rem] grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
              : "grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
        }
      >
        {Array.from({ length: isRecentEpisodes ? 4 : 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className={isRecentEpisodes ? "aspect-[16/10] rounded-lg" : "aspect-[2/3] rounded-lg"}
          />
        ))}
      </div>
    </div>
  );
}

export default async function UserOverviewPage({ params }: Props) {
  const { slug } = await params;

  return (
    <div className="mx-auto max-w-[84rem] space-y-10">
      <Suspense fallback={<SectionSkeleton title="Recently Watched Episodes" />}>
        <UserRecentEpisodes slug={slug} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Recently Watched Movies" />}>
        <UserRecentMovies slug={slug} />
      </Suspense>

      <Suspense
        fallback={<Skeleton className="mx-auto h-[13rem] w-full max-w-[76rem] rounded-xl" />}
      >
        <UserLast30Days slug={slug} />
      </Suspense>

      <Suspense
        fallback={<Skeleton className="mx-auto h-[22rem] w-full max-w-[76rem] rounded-[28px]" />}
      >
        <UserRatingsSummary slug={slug} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Favorite Movies" />}>
        <UserFavorites slug={slug} type="movies" />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Favorite Shows" />}>
        <UserFavorites slug={slug} type="shows" />
      </Suspense>
    </div>
  );
}
