// Shared types for Trakt API responses used across components

export interface MediaIds {
  [key: string]: unknown;
  trakt?: number;
  slug?: string;
  imdb?: string;
  tmdb?: number;
  tvdb?: number;
}

export interface MovieSummary {
  title: string;
  year?: number;
  ids: MediaIds;
  tagline?: string;
  overview?: string;
  released?: string;
  runtime?: number;
  certification?: string;
  country?: string;
  status?: string;
  rating?: number;
  votes?: number;
  comment_count?: number;
  genres?: string[];
}

export interface ShowSummary {
  title: string;
  year?: number;
  ids: MediaIds;
  overview?: string;
  first_aired?: string;
  runtime?: number;
  certification?: string;
  network?: string;
  country?: string;
  status?: string;
  rating?: number;
  votes?: number;
  comment_count?: number;
  genres?: string[];
}

export interface EpisodeSummary {
  season: number;
  number: number;
  title?: string;
  overview?: string;
  first_aired?: string;
  runtime?: number;
  rating?: number;
  votes?: number;
  ids: MediaIds;
}

export interface TraktRating {
  trakt?: {
    rating?: number;
    votes?: number;
    distribution?: Record<string, number>;
  };
}
