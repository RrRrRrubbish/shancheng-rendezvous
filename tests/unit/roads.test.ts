import { describe,expect,it } from 'vitest';
import { INTERCHANGE } from '../../src/data/interchange';
import { Game } from '../../src/domain/game';
import { bodyBlocked, contains, heightAt, RADIUS, solveMovement, surfacesNear } from '../../src/movement/ground';
import { compileRoads } from '../../src/movement/roads';
import { boxCollider, clampOrbit, followOrbit, resolveFollowCamera, sphereInside, structuralSolids, surfaceCollider, sweepCamera } from '../../src/scene/collision';
import type { Solid, Vec3 } from '../../src/domain/types';

const compiled=compileRoads(INTERCHANGE.network!);
function walk(g:Game,p:Vec3):void {
  for(let i=0;i<4000;i++){
    if(g.state.phase==='success')return;
    const dx=p[0]-g.state.position[0],dz=p[2]-g.state.position[2],d=Math.hypot(dx,dz);if(d<0.025)return;
    const before=[...g.state.position];g.update([dx/d,dz/d],Math.min(1/60,d/3));
    if(before.every((v,j)=>Math.abs(v-g.state.position[j])<1e-8)){
      const possible=surfacesNear(g.level,before[0],before[2]).filter(s=>contains(s,before[0],before[2])).map(s=>[s.id,heightAt(s,before[0],before[2]),s.neighbors.includes(g.state.surfaceId)]);
      throw new Error('Blocked '+g.state.surfaceId+' at '+before.join(',')+' toward '+p.join(',')+' phase '+g.state.phase+' surfaces '+JSON.stringify(possible));
    }
  }
  throw new Error('Route did not converge');
}
export const INNER=['one-west','inner-12','inner-23','inner-34','inner-45','five-east'];
export const OUTER=['one-west','one-east','outer-12','two-south','two-north','outer-23','three-east','three-west','outer-34','four-north','four-south','outer-45','five-west','five-east'];
describe('five-layer playable road network',()=>{
  it.each([['inner',INNER],['outer',OUTER]] as const)('finishes the complete %s route using actual continuous movement',(_,ids)=>{
    const g=new Game({...INTERCHANGE,obstacles:structuralSolids(INTERCHANGE)});g.start();const tiers=new Set<number>();
    for(const id of ids){const prepared=compiled.roads.find(r=>r.road.id===id)!;for(const p of prepared.points){walk(g,p);tiers.add(INTERCHANGE.surfaces.find(s=>s.id===g.state.surfaceId)!.tier!);}walk(g,INTERCHANGE.network!.nodes.find(n=>n.id===prepared.road.to)!.position);}
    expect(g.state.phase).toBe('success');expect(g.state.stamina).toBeGreaterThan(0);expect([...tiers].sort()).toEqual([1,2,3,4,5]);
  });
  it.each(compiled.roads)('walks $road.id in both directions without a junction gap or jump',prepared=>{
    for(const reverse of[false,true]){
      const from=INTERCHANGE.network!.nodes.find(n=>n.id===(reverse?prepared.road.to:prepared.road.from))!,to=INTERCHANGE.network!.nodes.find(n=>n.id===(reverse?prepared.road.from:prepared.road.to))!;
      const g=new Game({...INTERCHANGE,goal:{...INTERCHANGE.goal}});g.level.goal.surface='test-disabled';g.start();g.state.position=[...from.position];g.state.surfaceId='junction-'+from.id;
      const points=reverse?[...prepared.points].reverse():prepared.points;
      try{for(const p of points){walk(g,p);g.state.stamina=100;}walk(g,to.position);}catch(e){throw new Error(prepared.road.id+' reverse '+reverse+' '+String(e));}
      expect(g.state.position[1]).toBeCloseTo(to.position[1],1);
    }
  });
  it('a crossing never changes height without a declared ramp connection',()=>{
    const g=new Game(INTERCHANGE);g.start();g.state.surfaceId='junction-e';g.state.position=[12,5,0];
    for(let i=0;i<250;i++)g.update([0,1],1/60);
    expect(g.state.position[1]).toBeCloseTo(5);expect(g.state.surfaceId.startsWith('two-south')).toBe(true);
  });
  it('supports never occupy a lower walking route and checkpoints have body clearance',()=>{
    const solids=structuralSolids(INTERCHANGE);const level={...INTERCHANGE,obstacles:solids};
    for(const road of compiled.roads)for(const p of road.points){
      const overhead=surfacesNear(level,p[0],p[2]).filter(s=>contains(s,p[0],p[2],-RADIUS)&&heightAt(s,p[0],p[2])>p[1]+0.7&&heightAt(s,p[0],p[2])-(s.thickness??0.6)<p[1]+1.5).map(s=>[s.id,heightAt(s,p[0],p[2])]);
      const obstacles=solids.filter(o=>p[1]+1.5>o.min[1]&&p[1]<o.max[1]&&Math.hypot(Math.max(o.min[0]-p[0],0,p[0]-o.max[0]),Math.max(o.min[2]-p[2],0,p[2]-o.max[2]))<RADIUS).map(o=>o.id);
      expect(bodyBlocked(level,p),road.road.id+' '+p.join(',')+' overhead '+JSON.stringify(overhead)+' solids '+JSON.stringify(obstacles)).toBe(false);
    }
    for(const p of [...level.checkpoints,...level.discoveries])expect(bodyBlocked(level,p.position),p.surface).toBe(false);
  });
  it('visual and collision polygons share their exact elevation at every road edge',()=>{
    for(const s of INTERCHANGE.surfaces)for(const p of s.polygon!)expect(Number.isFinite(heightAt(s,...p))).toBe(true);
    for(const road of compiled.roads){for(let i=0;i<road.points.length-1;i++){const s=road.surfaces[i*2];expect(contains(s,road.right[i][0],road.right[i][2])).toBe(true);expect(heightAt(s,road.right[i][0],road.right[i][2])).toBeCloseTo(road.right[i][1],6);}}
  });
});

describe('camera volume and full-body collision',()=>{
  const solid=boxCollider({id:'building',min:[-2,0,2],max:[2,9,4]});
  it('pulls the camera in front of close walls instead of enforcing a minimum distance',()=>{
    const hit=sweepCamera([0,1.2,0],[0,5,10],[solid]);
    expect(hit.position[2]).toBeLessThan(1.73);expect(sphereInside(hit.position,solid)).toBe(false);
  });
  it('detects swept corner collisions and prevents an interpolation through the building',()=>{
    const hit=sweepCamera([-4,3,3],[4,3,3],[solid]);expect(hit.fraction).toBeLessThan(0.3);expect(hit.position[0]).toBeLessThan(-2.28);
  });
  it('uses a camera volume rather than just its center ray',()=>{
    const hit=sweepCamera([2.1,2,0],[2.1,2,6],[solid]);expect(hit.fraction).toBeLessThan(1);
  });
  it('wraps horizontal orbit continuously through a full turn while clamping pitch',()=>{
    const low=clampOrbit(-10,-10),high=clampOrbit(10,10);
    expect(low.offset).toBeCloseTo(Math.atan2(Math.sin(-10),Math.cos(-10)));
    expect(high.offset).toBeCloseTo(Math.atan2(Math.sin(10),Math.cos(10)));
    expect(low.pitch).toBeCloseTo(-12*Math.PI/180);expect(high.pitch).toBeCloseTo(68*Math.PI/180);
    for(const angle of[-Math.PI,-2,-1,0,1,2,Math.PI])expect(Math.cos(clampOrbit(angle+Math.PI*4,0.6).offset)).toBeCloseTo(Math.cos(angle));
  });
  it('keeps a clear external camera beyond a nearby occluder instead of collapsing into the actor',()=>{
    const pillar=boxCollider({id:'near-pillar',min:[0.3,0,-0.2],max:[0.6,5,0.2]});
    const result=resolveFollowCamera([0,1.22,0],[8,6,0],[pillar]);
    expect(result.occluded).toBe(true);expect(result.position).toEqual([8,6,0]);expect(sphereInside(result.position,pillar)).toBe(false);
  });
  it('allows looking upward without moving the eye underground or the aim into a bridge deck',()=>{
    for(const y of[0,5,20]){
      const floor=boxCollider({id:'floor',min:[-20,y-0.6,-20],max:[20,y,20]});
      const ceiling=boxCollider({id:'ceiling',min:[-20,y+3,-20],max:[20,y+4,20]});
      const{target,desired}=followOrbit([0,y,0],0,-12*Math.PI/180,10.8,[floor,ceiling]);
      expect(target[1]).toBeLessThan(y+2.72);expect(target[1]).toBeGreaterThan(desired[1]);
      expect(desired[1]).toBeGreaterThanOrEqual(y+0.7);expect(sphereInside(target,ceiling)).toBe(false);
      const safe=resolveFollowCamera(target,desired,[floor,ceiling]);expect(sphereInside(safe.position,floor)).toBe(false);
    }
  });
  it('escapes a deep blocked ray using a safe nearby angle without entering the building',()=>{
    const building=boxCollider({id:'deep-building',min:[0.4,0,-3],max:[20,20,3]});
    const result=resolveFollowCamera([0,1.22,0],[8,6,0],[building]);
    expect(sphereInside(result.position,building)).toBe(false);
    expect(result.position[0]<building.min[0]-.28||Math.abs(result.position[2])>3.28).toBe(true);
  });
  it('retains the contracted camera when every external angle is enclosed by solid walls',()=>{
    const walls=[
      {id:'east',min:[.5,-30,-30],max:[30,30,30]},
      {id:'west',min:[-30,-30,-30],max:[-.5,30,30]},
      {id:'north',min:[-30,-30,.5],max:[30,30,30]},
      {id:'south',min:[-30,-30,-30],max:[30,30,-.5]},
      {id:'roof',min:[-30,3,-30],max:[30,30,30]},
      {id:'floor',min:[-30,-30,-30],max:[30,0,30]},
    ].map(w=>boxCollider(w as Solid));
    const result=resolveFollowCamera([0,1.22,0],[8,6,0],walls);
    expect(walls.some(w=>sphereInside(result.position,w))).toBe(false);
    expect(result.occluded).not.toBe(true);expect(result.fraction).toBeLessThan(.1);
  });
  it('blocks shoulders against pillars and head against insufficient overhead clearance',()=>{
    const base=structuredClone(INTERCHANGE);base.network=undefined;base.surfaces=[{id:'test',name:'test',layer:'test',bounds:[-10,10,-10,10],origin:[0,0,0],gradient:[0,0],terrain:'flat',neighbors:[]}];
    base.obstacles=[{id:'pillar',min:[1,0,-1],max:[2,5,1]}];
    const path=solveMovement(base,[0,0,0],'test',[1,0],2);expect(path.at(-1)!.to[0]).toBeLessThanOrEqual(1-RADIUS);
    base.surfaces.push({...base.surfaces[0],id:'overhead',origin:[0,1.8,0]});
    expect(bodyBlocked({...base,surfaces:[...base.surfaces]},[0,0,0])).toBe(true);
  });
  it('camera floor prisms retain the same top and bottom as rendered road decks',()=>{
    const flat=INTERCHANGE.surfaces.find(s=>s.id==='junction-e')!,solid=surfaceCollider(flat);
    expect(sphereInside([12,5.1,0],solid,0)).toBe(false);expect(sphereInside([12,4.8,0],solid,0)).toBe(true);
  });
});
