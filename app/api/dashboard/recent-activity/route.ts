import { NextResponse } from "next/server";
import { getRecentActivitySectionPayload } from "@/components/dashboard/recent-activity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(await getRecentActivitySectionPayload());
}
