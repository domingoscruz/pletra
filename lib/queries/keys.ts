export const traktKeys = {
  all: ["trakt"] as const,
  upNext: () => [...traktKeys.all, "upNext"] as const,
  history: () => [...traktKeys.all, "history"] as const,
  movie: (slug: string) => [...traktKeys.all, "movie", slug] as const,
  show: (slug: string) => [...traktKeys.all, "show", slug] as const,
  season: (slug: string, number: number) => [...traktKeys.all, "season", slug, number] as const,
  episode: (slug: string, season: number, episode: number) =>
    [...traktKeys.all, "episode", slug, season, episode] as const,
  ratings: (type: string, slug: string) => [...traktKeys.all, "ratings", type, slug] as const,
  comments: (type: string, slug: string) => [...traktKeys.all, "comments", type, slug] as const,
  watchlist: () => [...traktKeys.all, "watchlist"] as const,
};
