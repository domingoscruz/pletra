/**
 * Interfaces representing the raw data structures from Trakt API.
 */
export interface TraktIds {
  trakt: number;
  slug: string;
  tvdb?: number;
  imdb?: string;
  tmdb?: number;
  tvrage?: number;
}

export interface TraktMovie {
  title: string;
  year: number;
  ids: TraktIds;
  tagline?: string;
  overview?: string;
  released?: string;
  runtime?: number;
  country?: string;
  updated_at?: string;
  trailer?: string;
  homepage?: string;
  status?: string;
  rating?: number;
  votes?: number;
  comment_count?: number;
  language?: string;
  available_translations?: string[];
  genres?: string[];
  certification?: string;
}

export interface TraktShow {
  title: string;
  year: number;
  ids: TraktIds;
  overview?: string;
  first_aired?: string;
  airs?: {
    day: string;
    time: string;
    timezone: string;
  };
  runtime?: number;
  certification?: string;
  network?: string;
  country?: string;
  trailer?: string;
  homepage?: string;
  status?: string;
  rating?: number;
  votes?: number;
  comment_count?: number;
  updated_at?: string;
  language?: string;
  available_translations?: string[];
  genres?: string[];
  aired_episodes?: number;
}

export interface TraktEpisode {
  season: number;
  number: number;
  title: string;
  ids: TraktIds;
  number_abs?: number;
  overview?: string;
  first_aired?: string;
  updated_at?: string;
  rating?: number;
  votes?: number;
  comment_count?: number;
  available_translations?: string[];
  runtime?: number;
}

/**
 * The wrapper item returned by many Trakt list endpoints (Trending, Popular, Search).
 */
export interface TraktMediaItem {
  watchers?: number; // Present in Trending
  play_count?: number; // Present in Recommended
  movie?: TraktMovie;
  show?: TraktShow;
  episode?: TraktEpisode;
  type?: "movie" | "show" | "episode" | "person";
}

/**
 * Normalized interface for Pletra's MediaCard component.
 */
export interface MediaCardProps {
  title: string;
  subtitle?: string;
  releasedAt: string | null;
  rating: number;
  ids: TraktIds;
  mediaType: "movies" | "shows" | "episodes";
  year?: number;
}

/**
 * Central mapper to transform Trakt API responses into Pletra's MediaCard props.
 * Handles nested objects from search, trending, and direct sync returns.
 */
export function mapTraktToMediaCard(
  item: TraktMediaItem,
  fallbackType: "movies" | "shows" | "episodes",
): MediaCardProps | null {
  // Trakt can return the media object directly or nested inside a wrapper
  const movie = item.movie;
  const show = item.show;
  const episode = item.episode;

  // Determine the primary media object and its type
  let media: TraktMovie | TraktShow | TraktEpisode | undefined;
  let type: "movies" | "shows" | "episodes" = fallbackType;

  if (movie) {
    media = movie;
    type = "movies";
  } else if (show) {
    media = show;
    type = "shows";
  } else if (episode) {
    media = episode;
    type = "episodes";
  } else {
    // If no nested object, the 'item' itself might be the media object
    media = item as unknown as TraktMovie;
  }

  if (!media || !media.title) return null;

  // Extract the correct release date based on available fields
  // Movies: 'released', Shows/Episodes: 'first_aired'
  const releasedAt = (media as TraktMovie).released || (media as TraktShow).first_aired || null;

  // For episodes, format the title to include SxE for better UX in cards
  let displayTitle = media.title;
  let displaySubtitle = "";

  if (type === "episodes" && "season" in media) {
    const ep = media as TraktEpisode;
    displayTitle = ep.title;
    displaySubtitle = `S${ep.season}E${ep.number}`;
  } else if (type === "movies" && "year" in media) {
    displaySubtitle = media.year?.toString() || "";
  } else if (type === "shows" && "year" in media) {
    displaySubtitle = media.year?.toString() || "";
  }

  return {
    title: displayTitle,
    subtitle: displaySubtitle,
    releasedAt: releasedAt,
    rating: media.rating || 0,
    ids: media.ids,
    mediaType: type,
    year: "year" in media ? media.year : undefined,
  };
}
