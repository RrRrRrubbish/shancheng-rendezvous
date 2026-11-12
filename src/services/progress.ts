import { LEVEL_IDS, LEVELS } from '../data/map';
import type { LevelId, Progress, Settings } from '../domain/types';

export const SAVE_KEY = 'shancheng-rendezvous:progress:v2';
export const LEGACY_KEY = 'shancheng-rendezvous:progress:v1';
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export const defaultSettings = (): Settings => ({ muted: false, music: 0.32, ambient: 0.38, effects: 0.55, reducedMotion: false, lowQuality: false });
export const defaultProgress = (): Progress => ({ schemaVersion: 2, completed: [], discoveries: [], lastLevel: 'liziba', settings: defaultSettings(), tutorialSeen: false });
export function unlockedCount(p: Progress): number { return Math.min(4, p.completed.length+1); }
export function readProgress(storage: StorageLike): { progress: Progress; warning?: string } {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) {
      const p = defaultProgress(), legacy = storage.getItem(LEGACY_KEY);
      if (legacy) {
        try { const v = JSON.parse(legacy); if (v?.schemaVersion === 1 && typeof v.sound === 'boolean') p.settings.muted = !v.sound; } catch { /* Keep new defaults. */ }
        return { progress: p, warning: '新的山城旅程从李子坝开始，旧版进度已保留。' };
      }
      return { progress: p };
    }
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object') throw new Error('invalid');
    const p = v as Progress;
    if (p.schemaVersion !== 2 || !Array.isArray(p.completed) || p.completed.length > 4 ||
      p.completed.some((id, i) => id !== LEVEL_IDS[i]) || !Array.isArray(p.discoveries) || typeof p.tutorialSeen !== 'boolean') throw new Error('invalid');
    const discoveries = LEVELS.filter(l => p.completed.includes(l.id)).flatMap(l => l.discoveries.map(d => d.id));
    if (p.discoveries.some(id => typeof id !== 'string' || !discoveries.includes(id))) throw new Error('invalid');
    const settings = p.settings;
    if (!settings || !['music','ambient','effects'].every(k => typeof settings[k as keyof Settings] === 'number' && Number.isFinite(settings[k as keyof Settings]) && Number(settings[k as keyof Settings]) >= 0 && Number(settings[k as keyof Settings]) <= 1) ||
      !['muted','reducedMotion','lowQuality'].every(k => typeof settings[k as keyof Settings] === 'boolean')) throw new Error('invalid');
    const lastIndex = LEVEL_IDS.indexOf(p.lastLevel);
    if (lastIndex < 0 || lastIndex >= unlockedCount(p)) throw new Error('invalid');
    return { progress: { ...p, completed: [...p.completed], discoveries: [...new Set(p.discoveries)], settings: { ...settings } } };
  } catch { return { progress: defaultProgress(), warning: '进度暂时无法读取，已准备一段新的旅程。' }; }
}
export function writeProgress(storage: StorageLike, progress: Progress): boolean {
  try { storage.setItem(SAVE_KEY, JSON.stringify(progress)); return true; } catch { return false; }
}
export function completeLevel(progress: Progress, id: LevelId, discoveries: string[]): Progress {
  const p = structuredClone(progress), index = LEVEL_IDS.indexOf(id);
  if (index < 0 || index > p.completed.length) return p;
  if (!p.completed.includes(id)) p.completed.push(id);
  const valid = LEVELS[index].discoveries.map(d => d.id);
  p.discoveries = [...new Set([...p.discoveries, ...discoveries.filter(d => valid.includes(d))])];
  return p;
}
