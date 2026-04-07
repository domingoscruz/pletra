"use client";

import { fetchTraktRouteJson, getErrorMessage } from "@/lib/api/trakt-route";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { traktKeys } from "@/lib/queries/keys";

interface WatchlistParams {
  action: "add" | "remove";
  type: "movies" | "shows";
  ids: Record<string, unknown>;
}

export function useWatchlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ action, type, ids }: WatchlistParams) => {
      const endpoint =
        action === "remove" ? "/api/trakt/sync/watchlist/remove" : "/api/trakt/sync/watchlist";
      try {
        return await fetchTraktRouteJson(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [type]: [{ ids }],
          }),
          timeoutMs: 10000,
        });
      } catch (error) {
        throw new Error(getErrorMessage(error, `Failed to ${action} watchlist`));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: traktKeys.watchlist() });
    },
  });
}
