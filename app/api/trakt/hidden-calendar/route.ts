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
      params: { section: "dropped" },
      body: {
        shows: [{ ids: { trakt: traktId } }],
      } as any,
    });

    clearLocalCacheByPrefix("dashboard:upcoming-schedule:");

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to hide show";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest) {
  return NextResponse.json(
    { error: "Restore for hidden calendar shows is not implemented yet." },
    { status: 405 },
  );
}
