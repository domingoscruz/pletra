import { NextRequest, NextResponse } from "next/server";
import { setListNote } from "@/lib/list-notes";
import { isCurrentUser } from "@/lib/trakt-server";

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    ownerSlug?: string;
    listSlug?: string;
    itemKey?: string;
    notes?: string | null;
  } | null;

  if (!body?.ownerSlug || !body.listSlug || !body.itemKey) {
    return NextResponse.json({ error: "Missing note target." }, { status: 400 });
  }

  const allowed = await isCurrentUser(body.ownerSlug);
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notes = typeof body.notes === "string" ? body.notes.slice(0, 255) : null;
  await setListNote(body.ownerSlug, body.listSlug, body.itemKey, notes);

  return NextResponse.json({ ok: true, notes });
}
