import { describe, expect, it } from 'vitest';
import { getLevel } from '../../src/data/map';
import { Game, samplePath } from '../../src/domain/game';
import { escalatorStep, liftLayout } from '../../src/scene/transport';
import { contains } from '../../src/movement/ground';

describe('visible transport alignment',()=>{
  it('keeps the whole lift cabin clear of the upper walkway slab through the full ride',()=>{
    const level=getLevel('liziba'),service=level.transports.find(t=>t.kind==='lift')!,layout=liftLayout(service);
    const upper=level.surfaces.find(s=>s.id===service.stops[1].surface)!;
    for(let t=0;t<=1;t+=.025){
      const p=samplePath(service.path,t);
      expect(p[0]).toBe(layout.center[0]);expect(p[2]).toBe(layout.center[2]);
      for(const dx of[-1.29,1.29])for(const dz of[-1.25,1.25])expect(contains(upper,p[0]+dx,p[2]+dz)).toBe(false);
    }
    const game=new Game(structuredClone(level));game.start();game.state.position=[...service.stops[0].position];game.state.stamina=64;
    game.interact();expect(game.state.position).toEqual(service.path[0]);
    game.update([0,0],service.duration/2);expect(game.state.position).toEqual(samplePath(service.path,.5));
    game.update([0,0],service.duration/2);expect(game.state.position).toEqual(service.stops[1].position);expect(game.state.stamina).toBe(64);
    game.interact();game.update([0,0],service.duration);expect(game.state.position).toEqual(service.stops[0].position);expect(game.state.stamina).toBe(64);
  });
  it('keeps a rider on the same rising tread and returns hidden steps below the walking plane',()=>{
    const service=getLevel('crown-escalator').transports[0];
    for(const direction of[0,1])for(let progress=0;progress<1;progress+=.05){
      const path=direction?[...service.path].reverse():service.path;
      const rider=samplePath(path,progress),cycle=(direction?1-progress:progress)*.5;
      escalatorStep(service.path,cycle).forEach((v,i)=>expect(v).toBeCloseTo(rider[i],8));
    }
    expect(escalatorStep(service.path,.75)[1]).toBeCloseTo(samplePath(service.path,.5)[1]-.74);
    escalatorStep(service.path,.2).forEach((v,i)=>expect(v).toBeCloseTo(escalatorStep(service.path,1.2)[i],8));
  });
});
