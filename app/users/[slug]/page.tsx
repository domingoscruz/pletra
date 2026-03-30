import { Suspense } from "react";
import { createTraktClient } from "@/lib/trakt";
import { fetchTmdbImages } from "@/lib/tmdb";
import { formatRuntime } from "@/lib/format";
import { MediaCard } from "@/components/dashboard/media-card";
import { CardGrid } from "@/components/dashboard/card-grid";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  params: Promise<{ slug: string }>;
}

type FavItem = {
  movie?: {
    title?: string;
    year?: number;
    rating?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
  show?: {
    title?: string;
    year?: number;
    rating?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
};

async function UserFavorites({ slug, type }: { slug: string; type: "movies" | "shows" }) {
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
        : Promise.resolve({ poster: null, backdrop: null });
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
}

type HistoryItem = {
  watched_at?: string;
  movie?: {
    title?: string;
    year?: number;
    runtime?: number;
    rating?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
  show?: { title?: string; ids?: { slug?: string; tmdb?: number; trakt?: number } };
  episode?: {
    season?: number;
    number?: number;
    title?: string;
    rating?: number;
    ids?: { trakt?: number };
  };
};

async function UserHistory({ slug }: { slug: string }) {
  const client = createTraktClient();
  const [movieRes, showRes] = await Promise.all([
    client.users.history.movies({
      params: { id: slug },
      query: { page: 1, limit: 25, extended: "full" },
    }),
    client.users.history.shows({
      params: { id: slug },
      query: { page: 1, limit: 25, extended: "full" },
    }),
  ]);

  const movies = movieRes.status === 200 ? (movieRes.body as HistoryItem[]) : [];
  const shows = showRes.status === 200 ? (showRes.body as HistoryItem[]) : [];

  const all = [
    ...movies.map((m) => ({ ...m, _type: "movie" as const })),
    ...shows.map((s) => ({ ...s, _type: "show" as const })),
  ].sort((a, b) => new Date(b.watched_at ?? 0).getTime() - new Date(a.watched_at ?? 0).getTime());

  const recent = all.slice(0, 24);
  if (recent.length === 0) return null;

  const images = await Promise.all(
    recent.map((item) => {
      const tmdbId = item._type === "movie" ? item.movie?.ids?.tmdb : item.show?.ids?.tmdb;
      const tmdbType = item._type === "movie" ? "movie" : "tv";
      return tmdbId
        ? fetchTmdbImages(tmdbId, tmdbType as "movie" | "tv")
        : Promise.resolve({ poster: null, backdrop: null });
    }),
  );

  function formatTimeAgo(dateStr?: string) {
    if (!dateStr) return "";
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    if (days < 1) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return "";
  }

  return (
    <CardGrid title="Recently Watched" defaultRows={2} rowSize={6}>
      {recent.map((item, i) => {
        const timeAgo = formatTimeAgo(item.watched_at);

        if (item._type === "movie") {
          const m = item.movie;
          if (!m) return null;
          const parts: string[] = [];
          if (m.year) parts.push(String(m.year));
          if (m.runtime) parts.push(formatRuntime(m.runtime));
          if (timeAgo) parts.push(timeAgo);

          return (
            <MediaCard
              key={`m-${m.ids?.trakt}-${item.watched_at}`}
              title={m.title ?? "Unknown"}
              subtitle={parts.join(" · ") || undefined}
              href={`/movies/${m.ids?.slug}`}
              backdropUrl={images[i]?.backdrop ?? null}
              posterUrl={images[i]?.poster ?? null}
              rating={m.rating}
              mediaType="movies"
              ids={m.ids ?? {}}
              variant="poster"
            />
          );
        }
        const s = item.show;
        const ep = item.episode;
        if (!s) return null;
        const epLabel = ep ? `S${ep.season}E${ep.number}` : undefined;
        const subtitle = [epLabel, ep?.title, timeAgo].filter(Boolean).join(" · ");

        return (
          <MediaCard
            key={`s-${ep?.ids?.trakt ?? s.ids?.trakt}-${item.watched_at}`}
            title={s.title ?? "Unknown"}
            subtitle={subtitle || undefined}
            href={
              ep
                ? `/shows/${s.ids?.slug}/seasons/${ep.season}/episodes/${ep.number}`
                : `/shows/${s.ids?.slug}`
            }
            backdropUrl={images[i]?.backdrop ?? null}
            posterUrl={images[i]?.poster ?? null}
            rating={ep?.rating}
            mediaType="episodes"
            ids={ep?.ids ?? s.ids ?? {}}
            variant="poster"
          />
        );
      })}
    </CardGrid>
  );
}

function SectionSkeleton({ title }: { title: string }) {
  return (
    <div className="space-y-3">
      <div className="mb-3 flex items-center gap-3">
        <div className="skeleton h-4 w-32 rounded" />
        <div className="h-px flex-1 bg-zinc-800" />
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default async function UserOverviewPage({ params }: Props) {
  const { slug } = await params;

  return (
    <div className="space-y-10">
      <Suspense fallback={<SectionSkeleton title="Recently Watched" />}>
        <UserHistory slug={slug} />
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
