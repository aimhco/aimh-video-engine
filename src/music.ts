// Pure: deterministically pick a track for a slug.
export function pickTrack(slug: string, tracks: string[]): string | undefined {
  if (tracks.length === 0) return undefined;
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return tracks[h % tracks.length];
}
