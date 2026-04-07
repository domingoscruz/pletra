"use client";

import { fetchTraktRouteJson, getErrorMessage } from "@/lib/api/trakt-route";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { traktKeys } from "@/lib/queries/keys";

interface RateParams {
  type: "movies" | "shows" | "episodes";
  ids: Record<string, unknown>;
  rating: number;
}

export function useRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ type, ids, rating }: RateParams) => {
      try {
        return await fetchTraktRouteJson("/api/trakt/sync/ratings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [type]: [{ ids, rating, rated_at: new Date().toISOString() }],
          }),
          timeoutMs: 10000,
        });
      } catch (error) {
        throw new Error(getErrorMessage(error, "Failed to rate"));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: traktKeys.upNext() });
    },
  });
}
