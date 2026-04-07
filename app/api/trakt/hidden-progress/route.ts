import { NextRequest, NextResponse } from "next/server";
import { clearLocalCacheByPrefix } from "@/lib/local-cache";
import { getAuthenticatedTraktClient } from "@/lib/trakt-server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { traktId?: number };
    const traktId = Number(body?.traktId);

    if (!traktId) {
      return NextResponse.json({ error: "Missing traktId" }, { status: 400 });
    }

    const client = await getAuthenticatedTraktClient();
    const response = await client.users.hidden.add({
      params: { section: "progress_watched" },
      body: {
        shows: [{ ids: { trakt: traktId } }],
      } as any,
    });

    clearLocalCacheByPrefix("progress-show:");

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to hide show";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { traktId?: number };
    const traktId = Number(body?.traktId);

    if (!traktId) {
      return NextResponse.json({ error: "Missing traktId" }, { status: 400 });
    }

    const client = await getAuthenticatedTraktClient();
    const response = await client.users.hidden.remove.progress({
      body: {
        shows: [{ ids: { trakt: traktId } }],
      } as any,
    });

    clearLocalCacheByPrefix("progress-show:");

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to restore show";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
