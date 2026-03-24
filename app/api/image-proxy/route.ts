import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies images from domains that block direct fetches (e.g. walter-r2.trakt.tv).
 * Usage: /api/image-proxy?url=https://walter-r2.trakt.tv/images/...
 */
export async function GET(req: NextRequest) {
	const url = req.nextUrl.searchParams.get("url");
	if (!url) {
		return new NextResponse("Missing url param", { status: 400 });
	}

	// Only allow proxying from known image domains
	const allowed = ["walter-r2.trakt.tv", "walter.trakt.tv", "media.trakt.tv", "secure.gravatar.com"];
	let hostname: string;
	try {
		hostname = new URL(url).hostname;
	} catch {
		return new NextResponse("Invalid url", { status: 400 });
	}

	if (!allowed.includes(hostname)) {
		return new NextResponse("Domain not allowed", { status: 403 });
	}

	try {
		const res = await fetch(url, {
			headers: {
				"User-Agent": "pletra/1.0",
				Accept: "image/*",
			},
		});

		if (!res.ok) {
			return new NextResponse("Upstream error", { status: res.status });
		}

		const contentType = res.headers.get("content-type") ?? "image/jpeg";
		const buffer = await res.arrayBuffer();

		return new NextResponse(buffer, {
			status: 200,
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
			},
		});
	} catch {
		return new NextResponse("Fetch failed", { status: 502 });
	}
}
