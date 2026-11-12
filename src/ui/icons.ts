const paths: Record<string, string> = {
  mountain: '<path d="M3 19v-7h6V6h6v6h6v7M9 19v-4h6v4"/><circle cx="15" cy="5" r="2"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  leaf: '<path d="M19 4C7 3 3 8 5 14s12 7 14-10Z"/><path d="m5 20 10-10M9 15l-1-4m4 1h4"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  stairs: '<path d="M3 20v-5h5v-5h5V5h8M4 4h7m0 0v7m0-7L3 12"/>',
  bridge: '<path d="M3 18V6m18 12V6M3 9c5 8 13 8 18 0M3 18h18M8 14v4m8-4v4M12 15v3"/>',
  lift: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 4-4 4 4m-8 6 4 4 4-4M12 5v6m0 2v6"/>',
  walk: '<circle cx="14" cy="4" r="2"/><path d="m7 10 4-3 3 1 2 4h3m-8-5-2 7 4 3 1 5m-5-8-3 7"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14"/>',
  restart: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  home: '<path d="m3 11 9-8 9 8M5 10v11h5v-6h4v6h5V10"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  book: '<path d="M12 5C7 2 3 4 3 4v15s4-2 9 1c5-3 9-1 9-1V4s-4-2-9 1Zm0 0v15"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
};

export function icon(name: string, className = ''): string {
  return `<svg class="icon ${className}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.pin}</svg>`;
}
