"use client";

import { useState, useRef, useEffect } from "react";
import Link from "@/components/ui/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useSettings } from "@/lib/settings";

function getTraktUrl(pathname: string): string | null {
	const movieMatch = pathname.match(/^\/movies\/([^/]+)/);
	if (movieMatch) return `https://trakt.tv/movies/${movieMatch[1]}`;

	const episodeMatch = pathname.match(/^\/shows\/([^/]+)\/seasons\/(\d+)\/episodes\/(\d+)/);
	if (episodeMatch)
		return `https://trakt.tv/shows/${episodeMatch[1]}/seasons/${episodeMatch[2]}/episodes/${episodeMatch[3]}`;

	const seasonMatch = pathname.match(/^\/shows\/([^/]+)\/seasons\/(\d+)/);
	if (seasonMatch) return `https://trakt.tv/shows/${seasonMatch[1]}/seasons/${seasonMatch[2]}`;

	const showMatch = pathname.match(/^\/shows\/([^/]+)/);
	if (showMatch) return `https://trakt.tv/shows/${showMatch[1]}`;

	const personMatch = pathname.match(/^\/people\/([^/]+)/);
	if (personMatch) return `https://trakt.tv/people/${personMatch[1]}`;

	const userMatch = pathname.match(/^\/users\/([^/]+)/);
	if (userMatch) return `https://trakt.tv/users/${userMatch[1]}`;

	return null;
}

function SettingsPopover({ isSignedIn }: { isSignedIn: boolean }) {
	const { settings, updateSetting } = useSettings();
	const [open, setOpen] = useState(false);
	const popoverRef = useRef<HTMLDivElement>(null);
	const router = useRouter();

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		if (open) {
			document.addEventListener("mousedown", handleClickOutside);
			return () => document.removeEventListener("mousedown", handleClickOutside);
		}
	}, [open]);

	return (
		<div ref={popoverRef} className="relative">
			<button
				onClick={() => setOpen(!open)}
				className={`flex h-9 cursor-pointer items-center rounded-full px-3 text-sm transition-colors ${
					open ? "text-white" : "text-zinc-400 hover:text-white"
				}`}
				title="Settings"
			>
				<svg
					className="h-4 w-4"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.5}
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
					/>
					<path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
			</button>

			{open && (
				<div className="absolute bottom-full right-0 mb-2 w-56 rounded-xl bg-zinc-900/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
					<p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
						Settings
					</p>
					<label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/5">
						<span className="text-sm text-zinc-300">Show Backdrops</span>
						<button
							role="switch"
							aria-checked={settings.showBackdrops}
							onClick={() => updateSetting("showBackdrops", !settings.showBackdrops)}
							className={`relative h-5 w-9 cursor-pointer rounded-full transition-colors ${
								settings.showBackdrops ? "bg-accent" : "bg-zinc-700"
							}`}
						>
							<span
								className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
									settings.showBackdrops ? "translate-x-4" : "translate-x-0"
								}`}
							/>
						</button>
					</label>

					{isSignedIn && (
						<>
							<div className="my-2 h-px bg-zinc-800" />
							<button
								onClick={async () => {
									setOpen(false);
									await authClient.signOut();
									router.push("/auth/login");
								}}
								className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
							>
								<svg
									className="h-4 w-4"
									fill="none"
									stroke="currentColor"
									strokeWidth={1.5}
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
									/>
								</svg>
								Sign out
							</button>
						</>
					)}
				</div>
			)}
		</div>
	);
}

export function FloatingNav() {
	const pathname = usePathname();
	const { data: session } = authClient.useSession();
	const isHome = pathname === "/";
	const traktUrl = getTraktUrl(pathname);
	const userSlug = session?.user?.email?.replace(/@trakt\.tv$/, "") || null;
	const isProfile = userSlug && pathname === `/users/${userSlug}`;

	return (
		<div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
			<nav className="flex items-center gap-1 rounded-full bg-zinc-900/90 px-2 py-1.5 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
				{/* Home */}
				<Link
					href="/"
					className={`flex h-9 items-center rounded-full px-3 text-sm font-medium transition-colors ${
						isHome ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
					}`}
					title="Home"
				>
					<svg
						className="h-4 w-4"
						fill="none"
						stroke="currentColor"
						strokeWidth={1.5}
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
						/>
					</svg>
				</Link>

				{/* Profile */}
				{userSlug && (
					<Link
						href={`/users/${userSlug}`}
						className={`flex h-9 items-center rounded-full px-3 text-sm transition-colors ${
							isProfile ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
						}`}
						title="Profile"
					>
						<svg
							className="h-4 w-4"
							fill="none"
							stroke="currentColor"
							strokeWidth={1.5}
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
							/>
						</svg>
					</Link>
				)}

				{/* Search trigger */}
				<button
					onClick={() => {
						window.dispatchEvent(new CustomEvent("open-search-palette"));
					}}
					className="flex h-9 cursor-pointer items-center rounded-full px-3 text-sm text-zinc-400 transition-colors hover:text-white"
					title="Search (⌘P)"
				>
					<svg
						className="h-4 w-4"
						fill="none"
						stroke="currentColor"
						strokeWidth={1.5}
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
						/>
					</svg>
				</button>

				{/* External Trakt link */}
				{traktUrl && (
					<>
						<div className="h-5 w-px bg-zinc-700" />
						<a
							href={traktUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="flex h-9 cursor-pointer items-center rounded-full px-3 text-sm text-zinc-400 transition-colors hover:text-[#ed1c24]"
							title="View on Trakt"
						>
							<svg
								className="h-4 w-4"
								fill="none"
								stroke="currentColor"
								strokeWidth={1.5}
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
								/>
							</svg>
						</a>
					</>
				)}

				<div className="h-5 w-px bg-zinc-700" />

				{/* Settings (includes sign out) */}
				<SettingsPopover isSignedIn={!!session?.user} />

				{/* Sign in link for unauthenticated users */}
				{!session?.user && (
					<Link
						href="/auth/login"
						className="flex h-9 items-center rounded-full px-4 text-sm text-zinc-400 transition-colors hover:text-white"
					>
						Sign in
					</Link>
				)}
			</nav>
		</div>
	);
}
