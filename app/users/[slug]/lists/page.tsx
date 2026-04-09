import Link from "@/components/ui/link";
import { createTraktClient } from "@/lib/trakt";
import { isTraktExpectedError } from "@/lib/trakt-errors";

interface Props {
  params: Promise<{ slug: string }>;
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
  created_at?: string;
  updated_at?: string;
  ids?: { trakt?: number; slug?: string };
  user?: { username?: string };
};

export default async function ListsPage({ params }: Props) {
  const { slug } = await params;
  let lists: ListItem[] = [];
  let watchlistMovieCount = 0;
  let watchlistShowCount = 0;

  try {
    const client = createTraktClient();

    const [listsRes, watchlistMoviesRes, watchlistShowsRes] = await Promise.all([
      client.users.lists.personal({ params: { id: slug } }),
      client.users.watchlist.movies({
        params: { id: slug, sort: "added" },
        query: { page: 1, limit: 1 },
      }),
      client.users.watchlist.shows({
        params: { id: slug, sort: "added" },
        query: { page: 1, limit: 1 },
      }),
    ]);

    lists = listsRes.status === 200 ? (listsRes.body as ListItem[]) : [];

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

  // Get watchlist total count from headers
  const watchlistTotal = watchlistMovieCount + watchlistShowCount;

  const allLists = lists;
  const hasWatchlist = watchlistTotal > 0;

  if (allLists.length === 0 && !hasWatchlist) {
    return (
      <div className="flex items-center justify-center rounded-xl bg-white/[0.02] py-16 ring-1 ring-white/5">
        <div className="text-center">
          <svg
            className="mx-auto h-8 w-8 text-zinc-700"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
            />
          </svg>
          <p className="mt-3 text-sm text-zinc-500">No lists yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Watchlist (built-in) */}
      {hasWatchlist && (
        <Link
          href={`/users/${slug}/lists/watchlist`}
          className="group flex items-center justify-between rounded-lg px-4 py-4 transition-colors hover:bg-white/[0.04]"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 shrink-0 text-accent" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <p className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">
                Watchlist
              </p>
            </div>
            <p className="mt-0.5 ml-6 text-xs text-zinc-500">Movies and shows to watch</p>
          </div>

          <div className="flex shrink-0 items-center gap-4 pl-4">
            <div className="text-right">
              <p className="text-sm font-bold tabular-nums text-zinc-300">{watchlistTotal}</p>
              <p className="text-[9px] uppercase text-zinc-600">items</p>
            </div>
            <svg
              className="h-4 w-4 text-zinc-700 transition-colors group-hover:text-zinc-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </Link>
      )}

      {/* Personal lists */}
      {allLists.map((list) => (
        <Link
          key={list.ids?.trakt}
          href={`/users/${slug}/lists/${list.ids?.slug}`}
          className="group flex items-center justify-between rounded-lg px-4 py-4 transition-colors hover:bg-white/[0.04]"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">
                {list.name}
              </p>
              {list.privacy === "private" && (
                <svg
                  className="h-3 w-3 shrink-0 text-zinc-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                  />
                </svg>
              )}
            </div>
            {list.description && (
              <p className="mt-0.5 truncate text-xs text-zinc-500">{list.description}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-4 pl-4">
            <div className="text-right">
              <p className="text-sm font-bold tabular-nums text-zinc-300">{list.item_count ?? 0}</p>
              <p className="text-[9px] uppercase text-zinc-600">items</p>
            </div>
            {(list.likes ?? 0) > 0 && (
              <div className="text-right">
                <p className="text-sm font-bold tabular-nums text-zinc-300">{list.likes}</p>
                <p className="text-[9px] uppercase text-zinc-600">likes</p>
              </div>
            )}
            {list.updated_at && (
              <span className="hidden text-[11px] text-zinc-600 lg:inline">
                Updated{" "}
                {new Date(list.updated_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
            <svg
              className="h-4 w-4 text-zinc-700 transition-colors group-hover:text-zinc-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </Link>
      ))}
    </div>
  );
}
