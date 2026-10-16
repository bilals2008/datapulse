import { useEffect, useState } from "react";

import { LATEST_RELEASE_API } from "@/lib/links";

export type ReleaseAsset = { name: string; browser_download_url: string };
export type LatestRelease = { tag_name: string; assets: ReleaseAsset[] };

export async function fetchLatestRelease(): Promise<LatestRelease> {
  const res = await fetch(LATEST_RELEASE_API);
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as LatestRelease;
}

export function useLatestRelease() {
  const [release, setRelease] = useState<LatestRelease>();

  useEffect(() => {
    let cancelled = false;

    fetchLatestRelease().then(
      (next) => {
        if (!cancelled) setRelease(next);
      },
      () => {},
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return release;
}
