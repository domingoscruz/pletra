import { NextRequest, NextResponse } from "next/server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { ApiRequestError, getResponseErrorDetails, requestWithPolicy } from "@/lib/api/http";

const TRAKT_API_BASE = "https://api.trakt.tv";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("query");
  const type = req.nextUrl.searchParams.get("type") || "movie,show";

  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  const traktUrl = `${TRAKT_API_BASE}/search/${type}?query=${encodeURIComponent(query)}&extended=full&limit=12`;

  let res: Response;
  try {
    res = await requestWithPolicy(
      traktUrl,
      {
        headers: {
          "Content-Type": "application/json",
          "trakt-api-version": "2",
          "trakt-api-key": process.env.TRAKT_CLIENT_ID!,
          "user-agent": "pletra/1.0",
        },
        cache: "no-store",
      },
      {
        timeoutMs: 10000,
        maxRetries: 2,
      },
    );
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return NextResponse.json(
        { error: error.message, results: [] },
        { status: error.status > 0 ? error.status : 502 },
      );
    }
    throw error;
  }

  if (!res.ok) {
    const details = await getResponseErrorDetails(res);
    return NextResponse.json({ error: details.message, results: [] }, { status: res.status });
  }

  const data = await res.json<Record<string, unknown>[]>();

  // Fetch TMDB poster images in parallel
  const results = await Promise.all(
    data.map(async (item: Record<string, unknown>) => {
      const mediaType = item.type as string;
      const media = item[mediaType] as Record<string, unknown> | undefined;
      if (!media) return null;

      const ids = media.ids as Record<string, unknown> | undefined;
      const tmdbId = ids?.tmdb as number | undefined;
      let posterUrl: string | null = null;

      if (tmdbId) {
        try {
          const tmdbType = mediaType === "show" ? "tv" : "movie";
          const images = await fetchTmdbImages(tmdbId, tmdbType);
          posterUrl = images.poster;
        } catch {
          // ignore
        }
      }

      return {
        type: mediaType,
        title: media.title as string,
        year: media.year as number | undefined,
        slug: ids?.slug as string,
        overview: media.overview as string | undefined,
        rating: media.rating as number | undefined,
        posterUrl,
      };
    }),
  );

  return NextResponse.json(results.filter(Boolean));
}
