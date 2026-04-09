import { NextResponse } from "next/server";
import { getContinueWatchingSectionPayload } from "@/components/dashboard/continue-watching";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(await getContinueWatchingSectionPayload());
}
