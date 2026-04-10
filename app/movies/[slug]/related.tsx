import { createTraktClient } from "@/lib/trakt";
import { fetchTmdbImages } from "@/lib/tmdb";
import { MediaCard } from "@/components/dashboard/media-card";
import { CardGrid } from "@/components/dashboard/card-grid";

export async function RelatedMovies({ slug }: { slug: string }) {
  const client = createTraktClient();

  const res = await client.movies.related({
    params: { id: slug },
    query: { page: 1, limit: 12, extended: "full" },
  });

  if (res.status !== 200) return null;

  type RelatedMovie = {
    title?: string;
    year?: number;
    rating?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };

  const movies = res.body as RelatedMovie[];
  if (movies.length === 0) return null;

  const images = await Promise.all(
    movies.map((m) =>
      m.ids?.tmdb
        ? fetchTmdbImages(m.ids.tmdb, "movie")
        : Promise.resolve({ poster: null, backdrop: null }),
    ),
  );

  return (
    <CardGrid title="Related" defaultRows={1} rowSize={6}>
      {movies.map((movie, i) => (
        <MediaCard
          key={movie.ids?.trakt}
          title={movie.title ?? "Unknown"}
          subtitle={movie.year ? String(movie.year) : undefined}
          href={`/movies/${movie.ids?.slug}`}
          backdropUrl={images[i]?.backdrop ?? null}
          posterUrl={images[i]?.poster ?? null}
          rating={movie.rating}
          mediaType="movies"
          ids={movie.ids ?? {}}
          variant="poster"
        />
      ))}
    </CardGrid>
  );
}
