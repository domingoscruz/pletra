import { NextResponse } from "next/server";
import { getFriendsActivitySectionPayload } from "@/components/dashboard/friends-activity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(await getFriendsActivitySectionPayload());
}
