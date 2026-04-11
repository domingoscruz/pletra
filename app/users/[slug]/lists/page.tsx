import type { Metadata } from "next";
import { requestWithPolicy } from "@/lib/api/http";
import { getUserProfileData } from "@/lib/metadata";
import { createTraktClient } from "@/lib/trakt";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { getOptionalTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages, fetchTmdbPersonImage } from "@/lib/tmdb";
import { ListsClient, type ListCardData } from "./lists-client";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getUserProfileData(slug);
  const username = profile?.username ?? slug;

  return {
    title: `${username}'s lists - Pletra`,
  };
}

type ListItem = {
  name?: string;
  description?: string | null;
  privacy?: string;
  item_count?: number;
  likes?: number;
  comment_count?: number;
  sort_by?: string;
  sort_how?: string;
  updated_at?: string;
  ids?: { trakt?: number; slug?: string };
  user?: { username?: string };
};

type LikedListItem = {
  liked_at?: string;
  list?: ListItem;
};

type PreviewSourceItem = {
  type?: "movie" | "show" | "season" | "episode" | "person";
  listed_at?: string;
  movie?: {
    title?: string;
    ids?: { tmdb?: number; trakt?: number };
  };
  show?: {
    title?: string;
    ids?: { tmdb?: number; trakt?: number };
  };
  season?: {
    number?: number;
    ids?: { tmdb?: number; trakt?: number };
  };
  episode?: {
    title?: string;
    ids?: { tmdb?: number; trakt?: number };
  };
  person?: {
    name?: string;
    ids?: { tmdb?: number; trakt?: number };
  };
};

type PosterPreview = {
  id: string;
  posterUrl: string;
  title: string;
};

function getPreviewTitle(item: PreviewSourceItem) {
  if (item.movie?.title) return item.movie.title;
  if (item.show?.title) return item.show.title;
  if (item.person?.name) return item.person.name;
  if (item.episode?.title) return item.episode.title;
  return "List item";
}

async function getPosterPreview(
  item: PreviewSourceItem,
  index: number,
): Promise<PosterPreview | null> {
  try {
    if (item.type === "person") {
      const personId = item.person?.ids?.tmdb;
      if (!personId) return null;
      const posterUrl = await fetchTmdbPersonImage(personId);
      return posterUrl
        ? {
            id: `person-${item.person?.ids?.trakt ?? personId}-${index}`,
            posterUrl,
            title: getPreviewTitle(item),
          }
        : null;
    }

    const tmdbId =
      item.movie?.ids?.tmdb ??
      item.show?.ids?.tmdb ??
      item.episode?.ids?.tmdb ??
      item.season?.ids?.tmdb;
    if (!tmdbId) return null;

    const tmdbType = item.movie ? "movie" : "tv";
    const images = await fetchTmdbImages(tmdbId, tmdbType);
    const posterUrl = images.poster ?? images.still ?? images.backdrop;

    return posterUrl
      ? {
          id: `${item.type ?? tmdbType}-${tmdbId}-${index}`,
          posterUrl,
          title: getPreviewTitle(item),
        }
      : null;
  } catch {
    return null;
  }
}

async function fetchListPreviewData(
  ownerSlug: string,
  listSlug: string,
): Promise<{ items: PreviewSourceItem[]; totalCount: number }> {
  const res = await requestWithPolicy(
    `https://api.trakt.tv/users/${encodeURIComponent(ownerSlug)}/lists/${encodeURIComponent(listSlug)}/items/movie,show,season,episode,person?extended=full&page=1&limit=5`,
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

  if (!res.ok) {
    return { items: [], totalCount: 0 };
  }

  const totalCount = parseInt(res.headers.get("x-pagination-item-count") ?? "0", 10);
  return {
    items: (await res.json()) as PreviewSourceItem[],
    totalCount,
  };
}

async function resolveViewerSlug() {
  try {
    const authClient = await getOptionalTraktClient();
    const profileRes = await authClient.users.profile({ params: { id: "me" } });
    if (profileRes.status === 200) {
      const profile = profileRes.body as { ids?: { slug?: string } };
      return profile.ids?.slug ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

export default async function ListsPage({ params }: Props) {
  const { slug } = await params;
  let personalLists: ListItem[] = [];
  let followedLists: LikedListItem[] = [];
  let watchlistMovieCount = 0;
  let watchlistShowCount = 0;
  let watchlistMovieItems: PreviewSourceItem[] = [];
  let watchlistShowItems: PreviewSourceItem[] = [];

  try {
    const client = createTraktClient();

    const [listsRes, watchlistMoviesRes, watchlistShowsRes, followedRes] = await Promise.all([
      client.users.lists.personal({ params: { id: slug } }),
      client.users.watchlist.movies({
        params: { id: slug, sort: "added" },
        query: { page: 1, limit: 5, extended: "full" },
      }),
      client.users.watchlist.shows({
        params: { id: slug, sort: "added" },
        query: { page: 1, limit: 5, extended: "full" },
      }),
      requestWithPolicy(
        `https://api.trakt.tv/users/${encodeURIComponent(slug)}/likes/lists?limit=50`,
        {
          headers: {
            "Content-Type": "application/json",
            "trakt-api-version": "2",
            "trakt-api-key": process.env.TRAKT_CLIENT_ID!,
            "user-agent": "pletra/1.0",
          },
          next: { revalidate: 300 },
        },
      ).catch(() => null),
    ]);

    personalLists = listsRes.status === 200 ? (listsRes.body as ListItem[]) : [];
    watchlistMovieItems =
      watchlistMoviesRes.status === 200
        ? ((watchlistMoviesRes.body as PreviewSourceItem[]) ?? [])
        : [];
    watchlistShowItems =
      watchlistShowsRes.status === 200
        ? ((watchlistShowsRes.body as PreviewSourceItem[]) ?? [])
        : [];
    followedLists = followedRes?.ok ? (((await followedRes.json()) as LikedListItem[]) ?? []) : [];

    watchlistMovieCount = parseInt(
      String(
        (watchlistMoviesRes as { headers?: { get?: (k: string) => string } }).headers?.get?.(
          "x-pagination-item-count",
        ) ?? "0",
      ),
      10,
    );
    watchlistShowCount = parseInt(
      String(
        (watchlistShowsRes as { headers?: { get?: (k: string) => string } }).headers?.get?.(
          "x-pagination-item-count",
        ) ?? "0",
      ),
      10,
    );
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[User Lists Page] Failed to load lists:", error);
    }
  }

  const viewerSlug = await resolveViewerSlug();
  const isOwner = viewerSlug?.toLowerCase() === slug.toLowerCase();

  const watchlistTotal = watchlistMovieCount + watchlistShowCount;
  const watchlistPreviewItems = [...watchlistMovieItems, ...watchlistShowItems]
    .sort((a, b) => new Date(b.listed_at ?? 0).getTime() - new Date(a.listed_at ?? 0).getTime())
    .slice(0, 5);

  const watchlistPreviewPosters = (
    await Promise.all(watchlistPreviewItems.map((item, index) => getPosterPreview(item, index)))
  ).filter((poster): poster is PosterPreview => Boolean(poster));

  const personalCards = await Promise.all(
    personalLists.map(async (list, index) => {
      const listSlug = list.ids?.slug ?? String(list.ids?.trakt ?? index);
      const previewData = list.ids?.slug
        ? await fetchListPreviewData(slug, list.ids.slug)
        : { items: [], totalCount: list.item_count ?? 0 };
      const previewPosters = (
        await Promise.all(
          previewData.items.map((item, previewIndex) => getPosterPreview(item, previewIndex)),
        )
      ).filter((poster): poster is PosterPreview => Boolean(poster));

      return {
        id: String(list.ids?.trakt ?? listSlug),
        slug: listSlug,
        href: `/users/${slug}/lists/${listSlug}`,
        title: list.name ?? "Untitled List",
        description: list.description?.trim() || "A curated collection from this profile.",
        privacy: list.privacy ?? "public",
        itemCount: previewData.totalCount || list.item_count || 0,
        likes: list.likes ?? 0,
        comments: list.comment_count ?? 0,
        updatedAt: list.updated_at,
        sortBy: list.sort_by,
        sortHow: list.sort_how,
        owner: list.user?.username ?? slug,
        ownerSlug: slug,
        previewPosters,
        kind: "personal" as const,
        editable: isOwner,
      } satisfies ListCardData;
    }),
  );

  const followedCards = await Promise.all(
    followedLists.map(async (liked, index) => {
      const list = liked.list;
      const ownerSlug = list?.user?.username ?? slug;
      const listSlug = list?.ids?.slug ?? String(list?.ids?.trakt ?? `followed-${index}`);
      const previewData =
        list?.ids?.slug && list.user?.username
          ? await fetchListPreviewData(list.user.username, list.ids.slug)
          : { items: [], totalCount: list?.item_count ?? 0 };
      const previewPosters = (
        await Promise.all(
          previewData.items.map((item, previewIndex) => getPosterPreview(item, previewIndex)),
        )
      ).filter((poster): poster is PosterPreview => Boolean(poster));

      return {
        id: `followed-${list?.ids?.trakt ?? listSlug}`,
        slug: listSlug,
        href: `/users/${ownerSlug}/lists/${listSlug}`,
        title: list?.name ?? "Untitled List",
        description: list?.description?.trim() || "A followed collection.",
        privacy: list?.privacy ?? "public",
        itemCount: previewData.totalCount || list?.item_count || 0,
        likes: list?.likes ?? 0,
        comments: list?.comment_count ?? 0,
        updatedAt: list?.updated_at ?? liked.liked_at,
        sortBy: list?.sort_by,
        sortHow: list?.sort_how,
        owner: list?.user?.username ?? ownerSlug,
        ownerSlug,
        previewPosters,
        kind: "followed" as const,
        editable: false,
      } satisfies ListCardData;
    }),
  );

  const cards: ListCardData[] = [];
  if (watchlistTotal > 0) {
    cards.push({
      id: "watchlist",
      slug: "watchlist",
      href: `/users/${slug}/lists/watchlist`,
      title: "Watchlist",
      description: "Movies, shows, seasons, and episodes queued for later.",
      privacy: "personal",
      itemCount: watchlistTotal,
      likes: 0,
      comments: 0,
      sortBy: "added",
      sortHow: "desc",
      owner: slug,
      ownerSlug: slug,
      previewPosters: watchlistPreviewPosters,
      kind: "watchlist",
      editable: false,
    });
  }

  cards.push(...personalCards, ...followedCards);

  return <ListsClient initialCards={cards} slug={slug} isOwner={isOwner} />;
}
