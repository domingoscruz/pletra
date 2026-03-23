import { Suspense } from "react";
import Image from "next/image";
import Link from "@/components/ui/link";
import { createTraktClient } from "@/lib/trakt";
import { fetchTmdbImages } from "@/lib/tmdb";
import { formatRuntime } from "@/lib/format";
import { Backdrop } from "@/components/media/backdrop";
import { MediaCard } from "@/components/dashboard/media-card";
import { CardGrid } from "@/components/dashboard/card-grid";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
	params: Promise<{ slug: string }>;
}

type UserProfile = {
	username: string;
	name?: string;
	location?: string;
	about?: string;
	gender?: string;
	age?: number;
	joined_at?: string;
	vip?: boolean;
	vip_ep?: boolean;
	private?: boolean;
	vip_cover_image?: string;
	images?: { avatar?: { full?: string } };
	ids?: { slug?: string };
};

type UserStats = {
	movies?: {
		plays?: number;
		watched?: number;
		minutes?: number;
		collected?: number;
		ratings?: number;
		comments?: number;
	};
	shows?: { watched?: number; collected?: number; ratings?: number; comments?: number };
	episodes?: {
		plays?: number;
		watched?: number;
		minutes?: number;
		collected?: number;
		ratings?: number;
		comments?: number;
	};
	ratings?: { total?: number };
};

function formatMinutes(minutes: number): string {
	const days = Math.floor(minutes / 1440);
	const hours = Math.floor((minutes % 1440) / 60);
	if (days > 0) return `${days}d ${hours}h`;
	return `${hours}h`;
}

// Favorites section
async function UserFavorites({ slug, type }: { slug: string; type: "movies" | "shows" }) {
	const client = createTraktClient();
	const res =
		type === "movies"
			? await client.users.favorites.movies({
					params: { id: slug, sort: "rank" },
					query: { extended: "full", limit: 12 },
				})
			: await client.users.favorites.shows({
					params: { id: slug, sort: "rank" },
					query: { extended: "full", limit: 12 },
				});

	if (res.status !== 200) return null;

	type FavItem = {
		movie?: {
			title?: string;
			year?: number;
			rating?: number;
			ids?: { slug?: string; tmdb?: number; trakt?: number };
		};
		show?: {
			title?: string;
			year?: number;
			rating?: number;
			ids?: { slug?: string; tmdb?: number; trakt?: number };
		};
	};

	const items = (res.body as FavItem[]) ?? [];
	if (items.length === 0) return null;

	const images = await Promise.all(
		items.map((item) => {
			const tmdbId = type === "movies" ? item.movie?.ids?.tmdb : item.show?.ids?.tmdb;
			return tmdbId
				? fetchTmdbImages(tmdbId, type === "movies" ? "movie" : "tv")
				: Promise.resolve({ poster: null, backdrop: null });
		}),
	);

	return (
		<CardGrid
			title={`Favorite ${type === "movies" ? "Movies" : "Shows"}`}
			defaultRows={1}
			rowSize={6}
		>
			{items.map((item, i) => {
				const media = type === "movies" ? item.movie : item.show;
				if (!media) return null;
				return (
					<MediaCard
						key={media.ids?.trakt}
						title={media.title ?? "Unknown"}
						subtitle={media.year ? String(media.year) : undefined}
						href={`/${type}/${media.ids?.slug}`}
						backdropUrl={images[i]?.backdrop ?? null}
						posterUrl={images[i]?.poster ?? null}
						rating={media.rating}
						mediaType={type}
						ids={media.ids ?? {}}
						variant="poster"
					/>
				);
			})}
		</CardGrid>
	);
}

// Ratings section
async function UserRatings({ slug, type }: { slug: string; type: "movies" | "shows" }) {
	const client = createTraktClient();
	const res =
		type === "movies"
			? await client.users.ratings.movies({ params: { id: slug }, query: { extended: "full" } })
			: await client.users.ratings.shows({ params: { id: slug }, query: { extended: "full" } });

	if (res.status !== 200) return null;

	type RatedItem = {
		rating?: number;
		rated_at?: string;
		movie?: {
			title?: string;
			year?: number;
			rating?: number;
			ids?: { slug?: string; tmdb?: number; trakt?: number };
		};
		show?: {
			title?: string;
			year?: number;
			rating?: number;
			ids?: { slug?: string; tmdb?: number; trakt?: number };
		};
	};

	const items = (res.body as RatedItem[]) ?? [];
	if (items.length === 0) return null;

	// Sort by rating desc, then by date
	const sorted = [...items].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
	const top = sorted.slice(0, 18);

	const images = await Promise.all(
		top.map((item) => {
			const tmdbId = type === "movies" ? item.movie?.ids?.tmdb : item.show?.ids?.tmdb;
			return tmdbId
				? fetchTmdbImages(tmdbId, type === "movies" ? "movie" : "tv")
				: Promise.resolve({ poster: null, backdrop: null });
		}),
	);

	return (
		<CardGrid title={`Rated ${type === "movies" ? "Movies" : "Shows"}`} defaultRows={1} rowSize={6}>
			{top.map((item, i) => {
				const media = type === "movies" ? item.movie : item.show;
				if (!media) return null;
				return (
					<MediaCard
						key={media.ids?.trakt}
						title={media.title ?? "Unknown"}
						subtitle={media.year ? String(media.year) : undefined}
						href={`/${type}/${media.ids?.slug}`}
						backdropUrl={images[i]?.backdrop ?? null}
						posterUrl={images[i]?.poster ?? null}
						rating={media.rating}
						userRating={item.rating}
						mediaType={type}
						ids={media.ids ?? {}}
						variant="poster"
					/>
				);
			})}
		</CardGrid>
	);
}

// Recent history section
async function UserHistory({ slug }: { slug: string }) {
	const client = createTraktClient();
	const [movieRes, showRes] = await Promise.all([
		client.users.history.movies({
			params: { id: slug },
			query: { page: 1, limit: 25, extended: "full" },
		}),
		client.users.history.shows({
			params: { id: slug },
			query: { page: 1, limit: 25, extended: "full" },
		}),
	]);

	type HistoryItem = {
		watched_at?: string;
		movie?: {
			title?: string;
			year?: number;
			runtime?: number;
			rating?: number;
			ids?: { slug?: string; tmdb?: number; trakt?: number };
		};
		show?: { title?: string; ids?: { slug?: string; tmdb?: number; trakt?: number } };
		episode?: {
			season?: number;
			number?: number;
			title?: string;
			rating?: number;
			ids?: { trakt?: number };
		};
	};

	const movies = movieRes.status === 200 ? (movieRes.body as HistoryItem[]) : [];
	const shows = showRes.status === 200 ? (showRes.body as HistoryItem[]) : [];

	// Combine and sort by watched_at desc
	const all = [
		...movies.map((m) => ({ ...m, _type: "movie" as const })),
		...shows.map((s) => ({ ...s, _type: "show" as const })),
	].sort((a, b) => new Date(b.watched_at ?? 0).getTime() - new Date(a.watched_at ?? 0).getTime());

	const recent = all.slice(0, 24);
	if (recent.length === 0) return null;

	const images = await Promise.all(
		recent.map((item) => {
			const tmdbId = item._type === "movie" ? item.movie?.ids?.tmdb : item.show?.ids?.tmdb;
			const tmdbType = item._type === "movie" ? "movie" : "tv";
			return tmdbId
				? fetchTmdbImages(tmdbId, tmdbType as "movie" | "tv")
				: Promise.resolve({ poster: null, backdrop: null });
		}),
	);

	function formatTimeAgo(dateStr?: string) {
		if (!dateStr) return undefined;
		const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
		if (days < 1) return "Today";
		if (days === 1) return "Yesterday";
		if (days < 7) return `${days}d ago`;
		if (days < 30) return `${Math.floor(days / 7)}w ago`;
		return undefined;
	}

	return (
		<CardGrid title="Recently Watched" defaultRows={2} rowSize={6}>
			{recent.map((item, i) => {
				if (item._type === "movie") {
					const m = item.movie;
					if (!m) return null;
					const parts: string[] = [];
					if (m.year) parts.push(String(m.year));
					if (m.runtime) parts.push(formatRuntime(m.runtime));
					return (
						<MediaCard
							key={`m-${m.ids?.trakt}-${item.watched_at}`}
							title={m.title ?? "Unknown"}
							subtitle={parts.join(" · ") || undefined}
							href={`/movies/${m.ids?.slug}`}
							backdropUrl={images[i]?.backdrop ?? null}
							posterUrl={images[i]?.poster ?? null}
							rating={m.rating}
							mediaType="movies"
							ids={m.ids ?? {}}
							timestamp={formatTimeAgo(item.watched_at)}
						/>
					);
				}
				const s = item.show;
				const ep = item.episode;
				if (!s) return null;
				const epLabel = ep ? `S${ep.season}E${ep.number}` : undefined;
				const subtitle = [epLabel, ep?.title].filter(Boolean).join(" · ");
				return (
					<MediaCard
						key={`s-${ep?.ids?.trakt ?? s.ids?.trakt}-${item.watched_at}`}
						title={s.title ?? "Unknown"}
						subtitle={subtitle || undefined}
						href={
							ep
								? `/shows/${s.ids?.slug}/seasons/${ep.season}/episodes/${ep.number}`
								: `/shows/${s.ids?.slug}`
						}
						backdropUrl={images[i]?.backdrop ?? null}
						posterUrl={images[i]?.poster ?? null}
						rating={ep?.rating}
						mediaType="episodes"
						ids={ep?.ids ?? s.ids ?? {}}
						timestamp={formatTimeAgo(item.watched_at)}
					/>
				);
			})}
		</CardGrid>
	);
}

function SectionSkeleton({ title }: { title: string }) {
	return (
		<div className="space-y-3">
			<div className="mb-3 flex items-center gap-3">
				<div className="skeleton h-4 w-32 rounded" />
				<div className="h-px flex-1 bg-zinc-800" />
			</div>
			<div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
				{Array.from({ length: 6 }).map((_, i) => (
					<Skeleton key={i} className="aspect-[2/3] rounded-lg" />
				))}
			</div>
		</div>
	);
}

export default async function UserProfilePage({ params }: Props) {
	const { slug } = await params;
	const client = createTraktClient();

	const [profileRes, statsRes] = await Promise.all([
		client.users.profile({
			params: { id: slug },
			query: { extended: "full,vip" },
		}),
		client.users.stats({ params: { id: slug } }),
	]);

	if (profileRes.status !== 200) {
		return (
			<div className="flex min-h-[50vh] items-center justify-center text-muted">
				User not found.
			</div>
		);
	}

	const user = profileRes.body as unknown as UserProfile;
	const stats = statsRes.status === 200 ? (statsRes.body as unknown as UserStats) : null;
	const avatarUrl = user.images?.avatar?.full;
	const coverImage = user.vip_cover_image;
	const displayName = user.name || user.username;
	const joinDate = user.joined_at
		? new Date(user.joined_at).toLocaleDateString("en-US", { year: "numeric", month: "long" })
		: null;

	const totalWatchTime = (stats?.movies?.minutes ?? 0) + (stats?.episodes?.minutes ?? 0);

	return (
		<>
			<Backdrop src={coverImage ?? null} alt={displayName} />

			<div className="relative mx-auto max-w-6xl px-4 pt-6 pb-20">
				{/* Breadcrumb */}
				<nav className="mb-6 flex items-center gap-2 text-sm">
					<Link href="/" className="text-zinc-400 transition-colors hover:text-white">
						Home
					</Link>
					<span className="text-zinc-700">/</span>
					<span className="font-medium text-zinc-200">{displayName}</span>
				</nav>

				{/* Profile header */}
				<div className="flex flex-col gap-8 md:flex-row">
					{/* Avatar */}
					<div className="flex-shrink-0">
						<div className="relative h-36 w-36 overflow-hidden rounded-full shadow-2xl ring-2 ring-white/10">
							{avatarUrl ? (
								<Image
									src={avatarUrl}
									alt={displayName}
									fill
									className="object-cover"
									priority
									sizes="144px"
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center bg-zinc-800 text-4xl font-bold text-zinc-600">
									{displayName[0]?.toUpperCase()}
								</div>
							)}
						</div>
					</div>

					{/* Info */}
					<div className="flex-1 space-y-4">
						<div>
							<div className="flex items-center gap-3">
								<h1 className="text-3xl font-bold tracking-tight md:text-4xl">{displayName}</h1>
								{user.vip && (
									<span className="rounded-full bg-yellow-500/10 px-2.5 py-1 text-[11px] font-medium text-yellow-400 ring-1 ring-yellow-500/20">
										VIP
									</span>
								)}
							</div>
							<div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
								<span>@{user.username}</span>
								{user.location && (
									<>
										<span className="text-zinc-600">·</span>
										<span>{user.location}</span>
									</>
								)}
								{joinDate && (
									<>
										<span className="text-zinc-600">·</span>
										<span>Joined {joinDate}</span>
									</>
								)}
							</div>
						</div>

						{user.about && (
							<p className="max-w-2xl text-sm leading-relaxed text-zinc-300">{user.about}</p>
						)}

						{/* Stats */}
						{stats && (
							<div className="flex flex-wrap gap-6 pt-1">
								{stats.movies?.watched != null && stats.movies.watched > 0 && (
									<div>
										<p className="text-lg font-bold tabular-nums text-zinc-200">
											{stats.movies.watched.toLocaleString()}
										</p>
										<p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
											Movies
										</p>
									</div>
								)}
								{stats.shows?.watched != null && stats.shows.watched > 0 && (
									<div>
										<p className="text-lg font-bold tabular-nums text-zinc-200">
											{stats.shows.watched.toLocaleString()}
										</p>
										<p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
											Shows
										</p>
									</div>
								)}
								{stats.episodes?.watched != null && stats.episodes.watched > 0 && (
									<div>
										<p className="text-lg font-bold tabular-nums text-zinc-200">
											{stats.episodes.watched.toLocaleString()}
										</p>
										<p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
											Episodes
										</p>
									</div>
								)}
								{totalWatchTime > 0 && (
									<div>
										<p className="text-lg font-bold tabular-nums text-zinc-200">
											{formatMinutes(totalWatchTime)}
										</p>
										<p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
											Watch Time
										</p>
									</div>
								)}
								{stats.ratings?.total != null && stats.ratings.total > 0 && (
									<div>
										<p className="text-lg font-bold tabular-nums text-zinc-200">
											{stats.ratings.total.toLocaleString()}
										</p>
										<p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
											Ratings
										</p>
									</div>
								)}
							</div>
						)}
					</div>
				</div>

				{/* Content sections */}
				{!user.private && (
					<div className="mt-12 space-y-10">
						<Suspense fallback={<SectionSkeleton title="Recently Watched" />}>
							<UserHistory slug={slug} />
						</Suspense>

						<Suspense fallback={<SectionSkeleton title="Favorite Movies" />}>
							<UserFavorites slug={slug} type="movies" />
						</Suspense>

						<Suspense fallback={<SectionSkeleton title="Favorite Shows" />}>
							<UserFavorites slug={slug} type="shows" />
						</Suspense>

						<Suspense fallback={<SectionSkeleton title="Rated Movies" />}>
							<UserRatings slug={slug} type="movies" />
						</Suspense>

						<Suspense fallback={<SectionSkeleton title="Rated Shows" />}>
							<UserRatings slug={slug} type="shows" />
						</Suspense>
					</div>
				)}

				{user.private && (
					<div className="mt-12 flex items-center justify-center rounded-xl bg-white/[0.03] py-16 ring-1 ring-white/5">
						<div className="text-center">
							<svg
								className="mx-auto h-8 w-8 text-zinc-600"
								fill="none"
								stroke="currentColor"
								strokeWidth={1.5}
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
								/>
							</svg>
							<p className="mt-3 text-sm text-zinc-500">This profile is private</p>
						</div>
					</div>
				)}
			</div>
		</>
	);
}
