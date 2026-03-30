import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { proxyImageUrl } from "@/lib/image-proxy";
import { Backdrop } from "@/components/media/backdrop";

export async function ProfileBackdrop() {
  const client = await getAuthenticatedTraktClient();

  const res = await client.users.profile({
    params: { id: "me" },
    query: { extended: "vip" },
  });

  if (res.status !== 200) return null;

  type Profile = { vip_cover_image?: string | null };
  const profile = res.body as unknown as Profile;
  const coverImage = proxyImageUrl(profile.vip_cover_image);

  if (!coverImage) return null;

  return <Backdrop src={coverImage} alt="Profile backdrop" />;
}
