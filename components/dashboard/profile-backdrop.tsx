import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { withLocalCache } from "@/lib/local-cache";
import { measureAsync } from "@/lib/perf";
import { proxyImageUrl } from "@/lib/image-proxy";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { Backdrop } from "@/components/media/backdrop";

const PROFILE_BACKDROP_CACHE_TTL_MS = 5 * 60 * 1000;

export async function ProfileBackdrop() {
  return measureAsync("dashboard:profile-backdrop:section", async () => {
    try {
      const coverImage = await measureAsync("dashboard:profile-backdrop:data", () =>
        withLocalCache("dashboard:profile-backdrop:me", PROFILE_BACKDROP_CACHE_TTL_MS, async () => {
          const client = await getAuthenticatedTraktClient();

          const res = await client.users.profile({
            params: { id: "me" },
            query: { extended: "vip" },
          });

          if (res.status !== 200) return null;

          type Profile = { vip_cover_image?: string | null };
          const profile = res.body as unknown as Profile;
          return proxyImageUrl(profile.vip_cover_image);
        }),
      );

      if (!coverImage) return null;

      return <Backdrop src={coverImage} alt="Profile backdrop" />;
    } catch (error) {
      if (!isTraktExpectedError(error)) {
        console.error("[Pletra] Profile Backdrop Error:", error);
      }
      return null;
    }
  });
}
