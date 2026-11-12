import { describe,it,expect } from 'vitest';
import { Game, samplePath } from '../../src/domain/game';
import { LEVELS } from '../../src/data/map';
import { keyboardDirection, normalizeInput, validateLevel } from '../../src/movement/ground';
import type { Level, Point, Vec3 } from '../../src/domain/types';

function fixture():Level {
  const l=structuredClone(LEVELS[0]);
  l.surfaces=[{id:'floor',name:'test',layer:'test',bounds:[-20,40,-20,20],origin:[0,0,0],gradient:[0,0],terrain:'flat',neighbors:[]}];
  l.start={surface:'floor',position:[0,0,0]};l.goal={surface:'floor',position:[35,0,0]};
  l.transports=[{id:'rail',name:'test rail',kind:'rail',duration:2,recoveryGroup:'rail-group',stops:[{name:'A',surface:'floor',position:[0,0,0]},{name:'B',surface:'floor',position:[10,0,0]}],path:[[0,0,0],[10,0,0]]}];
  l.discoveries=[{id:'d',title:'test',surface:'floor',position:[4,0,0],text:'test',source:''}];
  l.checkpoints=[{id:'cp',name:'test checkpoint',surface:'floor',position:[-3,0,0]}];
  return l;
}
function run(game:Game,direction:Point,seconds:number,hz=60):void {for(let i=0;i<Math.round(seconds*hz);i++)game.update(direction,1/hz);}
function started(level=fixture()):Game {const g=new Game(level);g.start();return g;}
function walkTo(g:Game,target:Point):void {
  for(let i=0;i<5000;i++){
    if(g.state.phase==='success')return;
    const dx=target[0]-g.state.position[0],dz=target[1]-g.state.position[2],dist=Math.hypot(dx,dz);
    if(dist<0.045)return;
    if(g.state.phase!=='exploring')throw new Error('route stopped: '+g.state.phase);
    const old=[...g.state.position];g.update([dx/dist,dz/dist],Math.min(1/60,dist/3));
    if(old.every((v,j)=>Math.abs(v-g.state.position[j])<1e-8))throw new Error('route blocked at '+old.join(','));
  }throw new Error('route too long');
}
function ride(g:Game):void {expect(g.interaction()?.kind).toBe('transport');g.interact();run(g,[0,0],12);expect(g.state.phase).toBe('exploring');}
describe('level integrity and reference routes',()=>{
  it.each(LEVELS)('validates $name',l=>expect(()=>validateLevel(l)).not.toThrow());
  it('rejects disconnected references and wrong landing height',()=>{
    const l=fixture();l.surfaces[0].neighbors=['missing'];expect(()=>validateLevel(l)).toThrow();
    const other=fixture();other.transports[0].stops[1].position[1]=20;expect(()=>validateLevel(other)).toThrow();
  });
  it('finishes Liziba by stairs and rail',()=>{
    const g=started(LEVELS[0]);walkTo(g,[-27,7]);walkTo(g,[-27,-5]);walkTo(g,[-24,-5]);ride(g);walkTo(g,[19,-4]);walkTo(g,[19,12]);walkTo(g,[12,14]);expect(g.state.phase).toBe('success');expect(g.state.stamina).toBeGreaterThan(20);
  });
  it('finishes Liziba by lift and rail without switching at a crossing',()=>{
    const g=started(LEVELS[0]);walkTo(g,[-15,10]);expect(g.state.surfaceId).toBe('quay');ride(g);expect(g.state.surfaceId).toBe('skywalk');walkTo(g,[-15,-5]);walkTo(g,[-24,-5]);ride(g);walkTo(g,[19,-4]);walkTo(g,[19,12]);walkTo(g,[12,14]);expect(g.state.phase).toBe('success');
  });
  it.each(['escalator','short','fold'] as const)('finishes Crown by %s with optional street discoveries',route=>{
    const g=started(LEVELS[1]);
    if(route==='escalator'){walkTo(g,[2,7]);ride(g);walkTo(g,[2,-12]);}
    else{
      walkTo(g,[-14,7]);walkTo(g,[-14,-1]);walkTo(g,[-17,-1]);walkTo(g,[-6,-1]);walkTo(g,[-17,-1]);
      if(route==='short'){walkTo(g,[-11,-1]);walkTo(g,[-11,-10]);}
      else{walkTo(g,[-23,-1]);walkTo(g,[-23,7]);walkTo(g,[-27,7]);walkTo(g,[-27,-10]);}
    }
    walkTo(g,[8,-12]);walkTo(g,[8,-10]);
    expect(g.state.phase).toBe('success');expect(g.state.stamina).toBeGreaterThan(0);
    if(route!=='escalator')expect(g.state.discoveries).toContain('crown-height');
    if(route==='fold')expect(g.state.discoveries).toContain('crown-lanes');
  });
  it('boards the rail directly at its berth and lands only on the destination platform',()=>{
    const g=started(LEVELS[0]),service=g.level.transports.find(t=>t.kind==='rail')!;
    g.state.position=[...service.stops[0].position];g.state.surfaceId=service.stops[0].surface;g.state.stamina=55;g.interact();
    expect(g.state.position).toEqual(service.path[0]);
    for(let i=0;i<service.duration*60-1;i++){
      g.update([1,1],1/60);expect(g.state.position[2]).toBeCloseTo(-9.8);expect(g.state.position[1]).toBeCloseTo(6.65);
    }
    run(g,[0,0],1);
    expect(g.state.position).toEqual(service.stops[1].position);expect(g.state.surfaceId).toBe('arrival');expect(g.state.phase).toBe('exploring');expect(g.state.stamina).toBe(75);
    expect(g.state.position).not.toEqual(g.level.goal.position);
  });
  it('finishes the cableway with walking on both banks',()=>{
    const g=started(LEVELS[2]);walkTo(g,[-8,5]);walkTo(g,[1,5]);walkTo(g,[1,7]);ride(g);walkTo(g,[18,4]);walkTo(g,[25,4]);walkTo(g,[25,-1]);expect(g.state.phase).toBe('success');
  });

});
describe('continuous movement and stamina',()=>{
  it('starts at 100, with no time resource',()=>{const g=started();expect(g.state.stamina).toBe(100);expect('time' in g.state).toBe(false);});
  it('normalizes diagonals and matches camera-relative directions',()=>{
    expect(Math.hypot(...normalizeInput([1,1]))).toBeCloseTo(1);
    expect(keyboardDirection(1,0)[0]).toBeCloseTo(Math.SQRT1_2);
    expect(keyboardDirection(1,0)[1]).toBeCloseTo(-Math.SQRT1_2);
    expect(keyboardDirection(0,0)).toEqual([0,0]);
    expect(keyboardDirection(0,-1,0)).toEqual([0,-1]);
    expect(keyboardDirection(1,0,Math.PI/2)[1]).toBeCloseTo(-1);
    expect(keyboardDirection(0,-1,-Math.PI/2)[0]).toBeCloseTo(1);
    for(const yaw of [-Math.PI,0,0.3,Math.PI/2])expect(Math.hypot(...keyboardDirection(1,1,yaw))).toBeCloseTo(1);
  });
  it('charges 10 points over 10 units of flat walking',()=>{const g=started();run(g,[1,0],10/3);expect(g.state.distance).toBeCloseTo(10);expect(g.state.stamina).toBeCloseTo(90);});
  it('has the same speed for single-axis and diagonal movement',()=>{const a=started(),b=started();run(a,[1,0],2);run(b,[1,1],2);expect(a.state.distance).toBeCloseTo(b.state.distance);});
  it('charges uphill 2.5 per unit and downhill 0.8',()=>{
    const l=fixture();l.surfaces[0].terrain='stairs';l.surfaces[0].gradient=[0.5,0];l.goal.position=[35,17.5,0];l.transports=[];l.checkpoints=[];l.discoveries=[];
    const g=started(l);run(g,[1,0],10/3);expect(g.state.stamina).toBeCloseTo(75);
    run(g,[-1,0],10/3);expect(g.state.stamina).toBeCloseTo(67);
  });
  it('does not charge while standing, paused or in briefing',()=>{
    const g=new Game(fixture());run(g,[1,0],2);expect(g.state.stamina).toBe(100);g.start();run(g,[0,0],100);g.pause();run(g,[1,0],100);expect(g.state.position).toEqual([0,0,0]);expect(g.state.stamina).toBe(100);
  });
  it('does not charge at a wall but charges the actual slide',()=>{
    const g=started();g.state.position=[39.64,0,0];run(g,[1,0],2);expect(g.state.stamina).toBe(100);run(g,[1,1],2);expect(g.state.position[0]).toBeCloseTo(39.64);expect(g.state.stamina).toBeLessThan(100);
  });
  it('does not switch to an overlapping upper surface',()=>{
    const l=fixture();l.surfaces.push({...structuredClone(l.surfaces[0]),id:'upper',origin:[0,8,0]});
    const g=started(l);run(g,[1,0],3);expect(g.state.surfaceId).toBe('floor');expect(g.state.position[1]).toBe(0);
  });
  it('stops at the last affordable position without negative stamina',()=>{
    const g=started();g.state.stamina=0.12;run(g,[1,0],1);expect(g.state.position[0]).toBeCloseTo(0.12);expect(g.state.stamina).toBe(0);expect(g.state.phase).toBe('fatigued');
  });
  it('splits flat and uphill costs at the exact surface boundary',()=>{
    const l=fixture();l.transports=[];l.discoveries=[];l.checkpoints=[];
    l.surfaces=[
      {id:'floor',name:'flat',layer:'a',bounds:[-20,0,-10,10],origin:[0,0,0],gradient:[0,0],terrain:'flat',neighbors:['ramp']},
      {id:'ramp',name:'ramp',layer:'b',bounds:[0,40,-10,10],origin:[0,0,0],gradient:[0.5,0],terrain:'stairs',neighbors:['floor']},
    ];
    l.start.position=[-1,0,0];l.goal={surface:'ramp',position:[35,17.5,0]};
    const g=started(l);run(g,[1,0],2/3);
    expect(g.state.position[0]).toBeCloseTo(1);expect(g.state.stamina).toBeCloseTo(96.5);
    const h=started(l);h.state.stamina=0.99;run(h,[1,0],1);
    expect(h.state.surfaceId).toBe('floor');expect(h.state.position[0]).toBeCloseTo(-0.01);
  });
  it('accepts exact-zero arrival',()=>{
    const l=fixture();l.goal.position=[1.6,0,0];const g=started(l);g.state.stamina=1;run(g,[1,0],1);expect(g.state.phase).toBe('success');expect(g.state.stamina).toBeCloseTo(0);
  });
  it('produces consistent distance and stamina at 30/60/120 Hz',()=>{
    const snapshots=[30,60,120].map(hz=>{const g=started();run(g,[1,0],2,hz);return g.state;});
    for(const s of snapshots){expect(s.position[0]).toBeCloseTo(6,5);expect(s.stamina).toBeCloseTo(94,5);}
  });
  it('only discovers on the correct surface and allows optional discoveries to be skipped',()=>{
    const l=fixture();l.discoveries[0].surface='upper';l.surfaces.push({...structuredClone(l.surfaces[0]),id:'upper',origin:[0,8,0]});l.discoveries[0].position[1]=8;
    const g=started(l);walkTo(g,[35,0]);expect(g.state.discoveries).toEqual([]);expect(g.state.phase).toBe('success');
  });
});
describe('transport transactions and checkpoint rollback',()=>{
  it('carries a passenger without input and awards once',()=>{
    const g=started();g.state.stamina=55;g.interact();expect(g.state.phase).toBe('riding');const r=structuredClone(g.state.ride)!;
    run(g,[1,1],1);run(g,[0,0],2);expect(g.state.position).toEqual([10,0,0]);expect(g.state.stamina).toBe(75);expect(g.finishRide(r.id,r.generation)).toBe(false);
    g.interact();run(g,[0,0],3);expect(g.state.stamina).toBe(75);expect(g.state.rides).toBe(2);
  });
  it('consumes recovery eligibility even if full',()=>{const g=started();g.interact();run(g,[0,0],3);expect(g.state.stamina).toBe(100);expect(g.state.consumedGroups).toEqual(['rail-group']);});
  it('rejects boarding from a remote location',()=>{const g=started();g.state.position=[20,0,0];g.interact();expect(g.state.phase).toBe('exploring');});
  it('ignores interaction during a ride and requires a previous trip to skip',()=>{
    const g=started();g.interact();const id=g.state.ride!.id;g.interact();expect(g.state.ride!.id).toBe(id);g.skipRide();expect(g.state.phase).toBe('riding');
    run(g,[0,0],3);g.interact();g.skipRide();expect(g.state.phase).toBe('exploring');expect(g.state.position).toEqual([0,0,0]);
  });
  it('freezes a ride while paused',()=>{const g=started();g.interact();g.pause();run(g,[0,0],4);expect(g.state.ride!.elapsed).toBe(0);g.pause(false);run(g,[0,0],3);expect(g.state.rides).toBe(1);});
  it('invalidates a delayed ride completion on retry',()=>{
    const g=started();g.state.stamina=20;g.interact();const r=structuredClone(g.state.ride)!;g.retry();expect(g.finishRide(r.id,r.generation)).toBe(false);expect(g.state.stamina).toBe(100);expect(g.state.rides).toBe(0);
  });
  it('restores position, stamina, discoveries and recovery ledger atomically',()=>{
    const g=started();g.state.position=[-3,0,0];g.state.stamina=60;g.update([0,0],1/60);expect(g.state.checkpoint.id).toBe('cp');
    g.state.position=[0,0,0];g.interact();run(g,[0,0],3);expect(g.state.stamina).toBe(95);g.state.discoveries.push('d');
    g.restoreCheckpoint();expect(g.state.position).toEqual([-3,0,0]);expect(g.state.stamina).toBe(75);expect(g.state.consumedRests).toEqual(['cp']);expect(g.state.discoveries).toEqual([]);expect(g.state.consumedGroups).toEqual([]);
    g.state.position=[0,0,0];g.interact();run(g,[0,0],3);expect(g.state.stamina).toBe(95);
  });
  it('deep-copies checkpoint values and restores a positive fatigue snapshot',()=>{
    const g=started();g.state.position=[-3,0,0];g.state.stamina=64;g.update([0,0],1/60);g.state.position[0]=12;g.state.discoveries.push('d');g.state.phase='fatigued';g.state.stamina=0;
    g.restoreCheckpoint();expect(g.state.stamina).toBe(79);expect(g.state.position[0]).toBe(-3);expect(g.state.phase).toBe('exploring');
  });
  it('invalidates a delayed ride on checkpoint restore or exit',()=>{
    const g=started();g.interact();let r=structuredClone(g.state.ride)!;g.restoreCheckpoint();expect(g.finishRide(r.id,r.generation)).toBe(false);g.interact();r=structuredClone(g.state.ride)!;g.cancel();expect(g.finishRide(r.id,r.generation)).toBe(false);
  });
  it('samples a path by cumulative length and reaches exact endpoints',()=>{
    const path:Vec3[]=[[0,0,0],[0,3,0],[4,3,0]];expect(samplePath(path,0)).toEqual([0,0,0]);expect(samplePath(path,1)).toEqual([4,3,0]);expect(samplePath(path,3/7)).toEqual([0,3,0]);
  });
});

describe('automatic rest transactions',()=>{
  it('heals automatically once, caps at 100, and re-entry cannot farm stamina',()=>{
    const g=started();g.state.position=[-3,0,0];g.state.stamina=93;g.update([0,0],1/60);
    expect(g.state.stamina).toBe(100);expect(g.interaction()).toBeUndefined();expect(g.state.consumedRests).toEqual(['cp']);
    g.state.stamina=40;run(g,[0,0],2);expect(g.state.stamina).toBe(40);
    walkTo(g,[-6,0]);walkTo(g,[-3,0]);expect(g.state.stamina).toBeCloseTo(34);
  });
  it('consumes rest eligibility even at full health, then retries with a fresh ledger',()=>{
    const g=started();g.state.position=[-3,0,0];g.update([0,0],1/60);
    expect(g.state.stamina).toBe(100);expect(g.state.consumedRests).toEqual(['cp']);
    g.retry();expect(g.state.consumedRests).toEqual([]);
    g.state.position=[-3,0,0];g.state.stamina=50;g.update([0,0],1/60);expect(g.state.stamina).toBe(65);
  });
  it('recovers on an exact-zero entry before applying fatigue',()=>{
    const l=fixture();l.checkpoints[0].position=[1.9,0,0];
    const g=started(l);g.state.stamina=1;run(g,[1,0],1/3);
    expect(g.state.stamina).toBeCloseTo(15);expect(g.state.phase).toBe('exploring');
    expect(g.state.checkpoint.snapshot.stamina).toBeCloseTo(15);
  });
  it('does not recover through another floor or while paused',()=>{
    const l=fixture();l.surfaces.push({...structuredClone(l.surfaces[0]),id:'upper',origin:[0,8,0]});
    l.checkpoints[0].surface='upper';l.checkpoints[0].position=[0,8,0];
    const g=started(l);g.state.stamina=40;run(g,[0,0],1);
    expect(g.state.stamina).toBe(40);expect(g.state.consumedRests).toEqual([]);
    g.state.surfaceId='upper';g.state.position=[0,8,0];g.pause();run(g,[0,0],1);expect(g.state.stamina).toBe(40);
    g.pause(false);g.update([0,0],1/60);expect(g.state.stamina).toBe(55);
  });
  it('restoring a post-reward checkpoint never grants its rest again',()=>{
    const g=started();g.state.position=[-3,0,0];g.state.stamina=50;g.update([0,0],1/60);
    for(let i=0;i<3;i++){g.state.stamina=0;g.state.phase='fatigued';g.restoreCheckpoint();g.update([0,0],1/60);expect(g.state.stamina).toBe(65);}
    expect(g.state.checkpoint.snapshot.consumedRests).toEqual(['cp']);
  });
});
