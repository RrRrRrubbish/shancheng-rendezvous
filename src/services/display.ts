interface LockableOrientation { lock?: (orientation: 'landscape') => Promise<void>; unlock?: () => void }
export interface LandscapeResult { fullscreen: boolean; locked: boolean }

/** Called directly from a tap. Failed browser capabilities never block play. */
export async function enterLandscape(): Promise<LandscapeResult> {
  let fullscreen = !!document.fullscreenElement, locked = false;
  if (!fullscreen && document.documentElement.requestFullscreen) {
    try { await document.documentElement.requestFullscreen(); fullscreen = !!document.fullscreenElement; }
    catch { /* e.g. Safari or an embedding policy: retain portrait play. */ }
  }
  try {
    const orientation = screen.orientation as LockableOrientation | undefined;
    if (orientation?.lock) { await orientation.lock('landscape'); locked = true; }
  } catch { /* Physical rotation and the portrait layout remain available. */ }
  return { fullscreen, locked };
}

export async function leaveFullscreen(): Promise<void> {
  try { (screen.orientation as LockableOrientation | undefined)?.unlock?.(); } catch { /* optional API */ }
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* browser owns exit */ }
}
