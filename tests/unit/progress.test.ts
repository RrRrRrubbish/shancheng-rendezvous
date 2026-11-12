import {describe,it,expect} from 'vitest';
import {completeLevel,defaultProgress,LEGACY_KEY,readProgress,SAVE_KEY,unlockedCount,writeProgress} from '../../src/services/progress';
import type {StorageLike} from '../../src/services/progress';
class Memory implements StorageLike {
  data=new Map<string,string>();
  getItem(k:string){return this.data.get(k)??null;}
  setItem(k:string,v:string){this.data.set(k,v);}
  removeItem(k:string){this.data.delete(k);}
}
describe('progress schema v2',()=>{
  it('starts with only Liziba unlocked',()=>{const p=readProgress(new Memory()).progress;expect(p.schemaVersion).toBe(2);expect(unlockedCount(p)).toBe(1);expect(p.lastLevel).toBe('liziba');});
  it('unlocks in sequence and does not allow skipped levels',()=>{const p=completeLevel(defaultProgress(),'crown-escalator',[]);expect(p.completed).toEqual([]);const done=completeLevel(p,'liziba',['liziba-building','bad']);expect(done.completed).toEqual(['liziba']);expect(done.discoveries).toEqual(['liziba-building']);expect(unlockedCount(done)).toBe(2);});
  it('round-trips valid settings and permanent discoveries',()=>{const m=new Memory(),p=completeLevel(defaultProgress(),'liziba',['liziba-quay']);p.settings.muted=true;p.lastLevel='crown-escalator';expect(writeProgress(m,p)).toBe(true);expect(readProgress(m).progress).toEqual(p);});
  it('retains old data and migrates only sound, not three-level completion',()=>{const m=new Memory(),old=JSON.stringify({schemaVersion:1,sound:false,unlocked:3,completed:['L01','L02','L03']});m.setItem(LEGACY_KEY,old);const p=readProgress(m).progress;expect(p.settings.muted).toBe(true);expect(p.completed).toEqual([]);expect(m.getItem(LEGACY_KEY)).toBe(old);});
  it.each(['{broken','null','{"schemaVersion":99}'])('recovers from invalid data %s',raw=>{const m=new Memory();m.setItem(SAVE_KEY,raw);expect(readProgress(m).progress).toEqual(defaultProgress());expect(readProgress(m).warning).toBeTruthy();});
  it('rejects out-of-order completions and unknown discoveries',()=>{const m=new Memory();const p=defaultProgress();p.completed=['huangjuewan'];m.setItem(SAVE_KEY,JSON.stringify(p));expect(readProgress(m).warning).toBeTruthy();p.completed=['liziba'];p.discoveries=['invented'];m.setItem(SAVE_KEY,JSON.stringify(p));expect(readProgress(m).warning).toBeTruthy();});
  it('rejects bad settings and locked last level',()=>{const m=new Memory();const p=defaultProgress();p.settings.music=8;m.setItem(SAVE_KEY,JSON.stringify(p));expect(readProgress(m).warning).toBeTruthy();p.settings.music=0.4;p.lastLevel='huangjuewan';m.setItem(SAVE_KEY,JSON.stringify(p));expect(readProgress(m).warning).toBeTruthy();});
  it('keeps play available if storage throws',()=>{const bad:StorageLike={getItem:()=>{throw new Error();},setItem:()=>{throw new Error();},removeItem:()=>{throw new Error();}};expect(readProgress(bad).warning).toBeTruthy();expect(writeProgress(bad,defaultProgress())).toBe(false);});
});
