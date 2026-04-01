/**
 * Central mapper to transform Trakt API responses into Pletra's MediaCard props.
 * This ensures consistency across all sections like Trending, Popular, and Search.
 */

export interface TraktMediaItem {
  movie?: any;
  show?: any;
  episode?: any;
  [key: string]: any;
}

export function mapTraktToMediaCard(item: TraktMediaItem, type: "movies" | "shows" | "episodes") {
  const media = item.movie || item.show || item.episode;

  if (!media) return null;

  // Extract the correct release date based on media type
  // Movies use 'released', Episodes use 'first_aired'
  const releasedAt = media.released || media.first_aired || null;

  return {
    title: media.title,
    // For episodes, the subtitle usually contains SxE info, for others it might be the year
    subtitle: type === "movies" ? media.year?.toString() : undefined,
    releasedAt: releasedAt,
    rating: media.rating,
    ids: media.ids,
    mediaType: type,
    // Add other common fields here
  };
}
