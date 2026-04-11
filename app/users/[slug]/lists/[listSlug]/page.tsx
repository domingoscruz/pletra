import { requestWithPolicy } from "@/lib/api/http";
import type { Metadata } from "next";
import { createTraktClient } from "@/lib/trakt";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { getOptionalTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages, fetchTmdbPersonImage } from "@/lib/tmdb";
import { ListDetailClient } from "./list-detail-client";

interface Props {
  params: Promise<{ slug: string; listSlug: string }>;
  searchParams: Promise<{
    sort?: string;
    order?: string;
    page?: string;
    genres?: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, listSlug } = await params;

  try {
    const client = createTraktClient();
    const summaryRes = await client.users.lists.list.summary({
      params: { id: slug, list_id: listSlug },
    });

    if (summaryRes.status === 200) {
      const list = summaryRes.body as ListSummary;
      const listName = list.name ?? "List";
      const userName = list.user?.username ?? slug;
      return {
        title: `${listName}, a list by ${userName} - Pletra`,
      };
    }
  } catch {}

  return {
    title: `${listSlug}, a list by ${slug} - Pletra`,
  };
}

type ListSummary = {
  name?: string;
  description?: string | null;
  privacy?: string;
  item_count?: number;
  likes?: number;
  allow_comments?: boolean;
  display_numbers?: boolean;
  sort_by?: string;
  sort_how?: string;
  created_at?: string;
  updated_at?: string;
  ids?: { trakt?: number; slug?: string };
  user?: { username?: string };
};

type ListedItem = {
  rank?: number;
  id?: number;
  listed_at?: string;
  notes?: string | null;
  type?: "movie" | "show" | "season" | "episode" | "person";
  movie?: {
    title?: string;
    year?: number;
    runtime?: number;
    rating?: number;
    genres?: string[];
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
  show?: {
    title?: string;
    year?: number;
    rating?: number;
    genres?: string[];
    runtime?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
  season?: {
    number?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
  episode?: {
    title?: string;
    season?: number;
    number?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
  person?: {
    name?: string;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
};

export default async function ListDetailPage({ params, searchParams }: Props) {
  const { slug, listSlug } = await params;
  const sp = await searchParams;
  const sortBy = sp.sort ?? "rank";
  const sortHow = sp.order ?? "asc";
  const genres = sp.genres;
  const limit = 100;

  // Get list summary
  let summaryRes: { status: number; body?: unknown } = { status: 500 };

  try {
    const client = createTraktClient();
    summaryRes = await client.users.lists.list.summary({
      params: { id: slug, list_id: listSlug },
    });
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[List Detail Page] Failed to load list summary:", error);
    }
  }

  const listInfo = summaryRes.status === 200 ? (summaryRes.body as unknown as ListSummary) : null;

  if (!listInfo) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-muted">
        List not found.
      </div>
    );
  }

  // Build query params for direct Trakt API fetch (includes person type)
  // Fetch list items directly from Trakt API to include person type
  let items: ListedItem[] = [];

  try {
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const queryParams = new URLSearchParams({
        extended: "full",
        sort_by: sortBy,
        sort_how: sortHow,
        page: String(page),
        limit: String(limit),
      });
      if (genres) queryParams.set("genres", genres);

      const itemsRes = await requestWithPolicy(
        `https://api.trakt.tv/users/${encodeURIComponent(slug)}/lists/${encodeURIComponent(listSlug)}/items/movie,show,season,episode,person?${queryParams.toString()}`,
        {
          headers: {
            "Content-Type": "application/json",
            "trakt-api-version": "2",
            "trakt-api-key": process.env.TRAKT_CLIENT_ID!,
            "user-agent": "pletra/1.0",
          },
          next: { revalidate: 300 },
        },
        {
          timeoutMs: 10000,
          maxRetries: 2,
        },
      );

      if (!itemsRes.ok) break;
      items.push(...((await itemsRes.json()) as ListedItem[]));
      totalPages = parseInt(itemsRes.headers.get("x-pagination-page-count") ?? "1", 10);
      page += 1;
    }
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[List Detail Page] Failed to load list items:", error);
    }
  }

  // Check if this is the current user's list
  let isOwner = false;
  try {
    const authClient = await getOptionalTraktClient();
    if (authClient) {
      const profileRes = await authClient.users.profile({ params: { id: "me" } });
      if (profileRes.status === 200) {
        const profile = profileRes.body as { ids?: { slug?: string } };
        isOwner = profile.ids?.slug === slug;
      }
    }
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[List Detail Page] Failed to resolve list ownership:", error);
    }
  }

  // Fetch images (person images from TMDB)
  const images = await Promise.all(
    items.map(async (item) => {
      if (item.type === "person") {
        const tmdbId = item.person?.ids?.tmdb;
        if (!tmdbId) return { poster: null, backdrop: null };
        const poster = await fetchTmdbPersonImage(tmdbId).catch(() => null);
        return { poster, backdrop: null };
      }
      const tmdbId =
        item.movie?.ids?.tmdb ??
        item.show?.ids?.tmdb ??
        item.episode?.ids?.tmdb ??
        item.season?.ids?.tmdb;
      const tmdbType = item.movie ? "movie" : "tv";
      return tmdbId
        ? fetchTmdbImages(tmdbId, tmdbType as "movie" | "tv").catch(() => ({
            poster: null,
            backdrop: null,
          }))
        : { poster: null, backdrop: null };
    }),
  );

  // Collect genres from all items for the client-side genre pill filter
  const genreSet = new Set<string>();
  for (const item of items) {
    for (const g of item.movie?.genres ?? item.show?.genres ?? []) {
      genreSet.add(g);
    }
  }
  const allGenres = [...genreSet].sort();

  const serialized = items.map((item, i) => ({
    id: item.id ?? item.rank ?? i,
    rank: item.rank ?? i + 1,
    listedAt: item.listed_at ?? "",
    notes: item.notes ?? null,
    type: item.type ?? (item.movie ? "movie" : item.show ? "show" : "person"),
    title:
      item.movie?.title ??
      item.show?.title ??
      item.episode?.title ??
      (item.season?.number ? `Season ${item.season.number}` : undefined) ??
      item.person?.name ??
      "Unknown",
    year: item.movie?.year ?? item.show?.year,
    rating: item.movie?.rating ?? item.show?.rating,
    runtime: item.movie?.runtime ?? item.show?.runtime,
    href:
      item.type === "person"
        ? `/people/${item.person?.ids?.slug ?? item.person?.ids?.trakt}`
        : item.movie
          ? `/movies/${item.movie.ids?.slug}`
          : item.show
            ? `/shows/${item.show?.ids?.slug}`
            : item.episode?.ids?.slug
              ? `/shows/${item.show?.ids?.slug}/seasons/${item.episode.season}/episodes/${item.episode.number}`
              : `/shows/${item.show?.ids?.slug}/seasons/${item.season?.number}`,
    posterUrl: images[i]?.poster ?? null,
    backdropUrl: images[i]?.backdrop ?? null,
    mediaType: item.movie
      ? ("movies" as const)
      : item.show
        ? ("shows" as const)
        : ("movies" as const),
    ids:
      item.movie?.ids ??
      item.show?.ids ??
      item.episode?.ids ??
      item.season?.ids ??
      item.person?.ids ??
      {},
    genres: item.movie?.genres ?? item.show?.genres ?? [],
  }));

  return (
    <ListDetailClient
      items={serialized}
      slug={slug}
      listSlug={listSlug}
      sortBy={sortBy}
      sortHow={sortHow}
      isOwner={isOwner}
      allGenres={allGenres}
      activeGenres={genres ?? ""}
      listInfo={listInfo}
    />
  );
}
