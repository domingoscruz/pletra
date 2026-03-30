import { ProxiedImage as Image } from "@/components/ui/proxied-image";
import Link from "@/components/ui/link";
import { createTraktClient } from "@/lib/trakt";
import { isCurrentUser } from "@/lib/trakt-server";
import { Backdrop } from "@/components/media/backdrop";
import { proxyImageUrl } from "@/lib/image-proxy";
import { ProfileTabs } from "./profile-tabs";

type UserProfile = {
	username: string;
	name?: string;
	location?: string;
	about?: string;
	joined_at?: string;
	vip?: boolean;
	private?: boolean;
	vip_cover_image?: string;
	images?: { avatar?: { full?: string } };
};

type UserStats = {
	movies?: { plays?: number; watched?: number; minutes?: number; ratings?: number };
	shows?: { watched?: number; ratings?: number };
	episodes?: { plays?: number; watched?: number; minutes?: number; ratings?: number };
	ratings?: { total?: number };
};

function formatMinutes(minutes: number): string {
	const days = Math.floor(minutes / 1440);
	const hours = Math.floor((minutes % 1440) / 60);
	if (days > 0) return `${days}d ${hours}h`;
	return `${hours}h`;
}

interface Props {
	params: Promise<{ slug: string }>;
	children: React.ReactNode;
}

export default async function UserProfileLayout({ params, children }: Props) {
	const { slug } = await params;
	const client = createTraktClient();
	const isOwnProfile = await isCurrentUser(slug);

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
	const avatarUrl = proxyImageUrl(user.images?.avatar?.full);
	const coverImage = proxyImageUrl(user.vip_cover_image);
	const displayName = user.name || user.username;
	const joinDate = user.joined_at
		? new Date(user.joined_at).toLocaleDateString("en-US", { year: "numeric", month: "long" })
		: null;

	const totalWatchTime = (stats?.movies?.minutes ?? 0) + (stats?.episodes?.minutes ?? 0);

	return (
		<>
			<Backdrop src={coverImage ?? null} alt={displayName} />

			<div className="relative z-10 mx-auto max-w-6xl px-4 pt-6 pb-20">
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

				{/* Tabs */}
				{!user.private && (
					<div className="mt-10">
						<ProfileTabs slug={slug} isOwnProfile={isOwnProfile} />
						<div className="mt-8">{children}</div>
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
