"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ProgressProvider } from "@bprogress/next/app";
import { SettingsProvider } from "@/lib/settings";
import { ToastProvider } from "@/lib/toast";

export function Providers({ children }: { children: ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 60 * 1000,
						refetchOnWindowFocus: false,
					},
				},
			}),
	);

	return (
		<QueryClientProvider client={queryClient}>
			<SettingsProvider>
				<ProgressProvider
					color="#ed1c24"
					height="4px"
					options={{ showSpinner: false }}
					shallowRouting
				>
					<ToastProvider>{children}</ToastProvider>
				</ProgressProvider>
			</SettingsProvider>
		</QueryClientProvider>
	);
}
