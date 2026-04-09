import { NextResponse } from "next/server";
import { getStartWatchingSectionPayload } from "@/components/dashboard/start-watching";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(await getStartWatchingSectionPayload());
}
