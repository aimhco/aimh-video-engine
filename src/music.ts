// Pure: deterministically pick a track for a slug.
export function pickTrack(slug: string, tracks: string[]): string | undefined {
  if (tracks.length === 0) return undefined;
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return tracks[h % tracks.length];
}

export interface MusicSelectionState {
  bodyTrack?: string | null;
  outroTrack?: string | null;
}

export function resolveMusicSelection(
  slug: string,
  current: MusicSelectionState,
  bodyTracks: string[],
  outroTracks: string[],
): {
  bodyTrack?: string;
  outroTrack?: string;
  changed: boolean;
  persisted: { bodyTrack: string | null; outroTrack: string | null };
} {
  const bodyTrack = current.bodyTrack ?? pickTrack(slug, bodyTracks);
  const outroTrack = current.outroTrack ?? pickTrack(slug, outroTracks);
  const persisted = { bodyTrack: bodyTrack ?? null, outroTrack: outroTrack ?? null };
  const changed = current.bodyTrack !== persisted.bodyTrack || current.outroTrack !== persisted.outroTrack;
  return { bodyTrack: bodyTrack ?? undefined, outroTrack: outroTrack ?? undefined, changed, persisted };
}
