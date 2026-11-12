import type { Level, MovementSegment, Point, Surface, Vec3 } from '../domain/types';
import { polygonArea } from './roads';

export const SPEED = 3;
export const RADIUS = 0.36;
export const BODY_HEIGHT = 1.5;
export const EPSILON = 1e-6;
export const heightAt = (s: Surface, x: number, z: number): number =>
  s.origin[1] + (x - s.origin[0]) * s.gradient[0] + (z - s.origin[2]) * s.gradient[1];
export function contains(s: Surface, x: number, z: number, pad = 0): boolean {
  if(x<s.bounds[0]+pad-EPSILON||x>s.bounds[1]-pad+EPSILON||z<s.bounds[2]+pad-EPSILON||z>s.bounds[3]-pad+EPSILON)return false;
  if(!s.polygon)return true;
  const sign=Math.sign(polygonArea(s.polygon));
  return s.polygon.every((a,i)=>{const b=s.polygon![(i+1)%s.polygon!.length];return sign*((b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]))>=pad*Math.hypot(b[0]-a[0],b[1]-a[1])-EPSILON;});
}
const indices=new WeakMap<Level,Map<string,Surface>>();
function index(level:Level):Map<string,Surface>{let result=indices.get(level);if(!result){result=new Map(level.surfaces.map(s=>[s.id,s]));indices.set(level,result);}return result;}
const grids=new WeakMap<Level,Map<string,Surface[]>>();
export function surfacesNear(level:Level,x:number,z:number):Surface[]{
  let grid=grids.get(level);
  if(!grid){grid=new Map();for(const s of level.surfaces){for(let ix=Math.floor((s.bounds[0]-RADIUS)/4);ix<=Math.floor((s.bounds[1]+RADIUS)/4);ix++)for(let iz=Math.floor((s.bounds[2]-RADIUS)/4);iz<=Math.floor((s.bounds[3]+RADIUS)/4);iz++){const key=ix+':'+iz;if(!grid.has(key))grid.set(key,[]);grid.get(key)!.push(s);}}grids.set(level,grid);}
  return grid.get(Math.floor(x/4)+':'+Math.floor(z/4))??[];
}
function nearby(level:Level,surface:Surface,depth=1):Surface[]{
  const map=index(level),found=new Set([surface]);let edge=[surface];
  for(let i=0;i<depth;i++){const next:Surface[]=[];for(const s of edge)for(const id of s.neighbors){const n=map.get(id)!;if(!found.has(n)){found.add(n);next.push(n);}}edge=next;}
  return [...found];
}
export function bodyBlocked(level:Level,p:Vec3):boolean {
  if((level.obstacles??[]).some(o=>p[1]+BODY_HEIGHT>o.min[1]+EPSILON&&p[1]<o.max[1]-EPSILON&&
    Math.hypot(Math.max(o.min[0]-p[0],0,p[0]-o.max[0]),Math.max(o.min[2]-p[2],0,p[2]-o.max[2]))<RADIUS-EPSILON))return true;
  for(const s of surfacesNear(level,p[0],p[2])){
    for(let i=0;i<9;i++){
      const angle=i*Math.PI/4,x=p[0]+(i===8?0:Math.cos(angle)*RADIUS),z=p[2]+(i===8?0:Math.sin(angle)*RADIUS);
      if(!contains(s,x,z))continue;
      const y=heightAt(s,x,z);
      if(y>p[1]+0.7&&y-(s.thickness??0.6)<p[1]+BODY_HEIGHT)return true;
    }
  }
  return false;
}
export function validateLevel(level: Level): void {
  const ids = new Set(level.surfaces.map(s => s.id));
  if (ids.size !== level.surfaces.length) throw new Error('重复的可走面');
  for (const s of level.surfaces) {
    if (s.bounds[0] >= s.bounds[1] || s.bounds[2] >= s.bounds[3] || s.neighbors.some(id => !ids.has(id))) throw new Error('无效的可走面或连接');
    if (![...s.bounds, ...s.origin, ...s.gradient].every(Number.isFinite)) throw new Error('无效的地面坐标');
    if(s.polygon&&(s.polygon.length<3||polygonArea(s.polygon)<=EPSILON))throw new Error('无效道路多边形');
    for (const id of s.neighbors) if (!level.surfaces.find(t => t.id === id)!.neighbors.includes(s.id)) throw new Error('地面连接必须互相声明');
  }
  for (const p of [level.start, level.goal, ...level.discoveries, ...level.checkpoints, ...level.transports.flatMap(t => t.stops)]) {
    const s = level.surfaces.find(s => s.id === p.surface);
    if (!s || !contains(s, p.position[0], p.position[2], RADIUS) || Math.abs(heightAt(s, p.position[0], p.position[2]) - p.position[1]) > EPSILON) throw new Error('地点不在有效地面上');
  }
  for (const t of level.transports) {
    if (t.duration <= 0 || t.path.length < 2 || t.stops[0].surface === t.stops[1].surface && t.stops[0].position.every((v, i) => v === t.stops[1].position[i])) throw new Error('无效交通');
    for (const d of [0, 1]) if (t.path[d ? t.path.length - 1 : 0].some((v, i) => Math.abs(v - (t.stops[d].vehiclePosition??t.stops[d].position)[i]) > EPSILON)) throw new Error('交通端点不一致');
  }
}
export function normalizeInput(input: Point): Point {
  const length = Math.hypot(...input);
  return length > 1 ? [input[0] / length, input[1] / length] : [...input];
}
export function keyboardDirection(x: number, y: number, yaw = Math.PI / 4): Point {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return normalizeInput([x * c + y * s, y * c - x * s]);
}
function tryStep(level: Level, surface: Surface, position: Vec3, dx: number, dz: number): { position: Vec3; surface: Surface } | undefined {
  const x = position[0] + dx, z = position[2] + dz;
  const adjacent = nearby(level,surface);
  const next = adjacent.find(s => contains(s, x, z) && Math.abs(heightAt(s, x, z) - position[1]) < 0.35);
  if (!next) return;
  const y = heightAt(next, x, z);
  if(bodyBlocked(level,[x,y,z]))return;
  const safe = surfacesNear(level,x,z).filter(s=>Math.abs(heightAt(s,x,z)-y)<1);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const xx = x + Math.cos(a) * RADIUS, zz = z + Math.sin(a) * RADIUS;
    if (!safe.some(s => contains(s, xx, zz) && Math.abs(heightAt(s, xx, zz) - y) < 0.65)) return;
  }
  return { position: [x, y, z], surface: next };
}
export function solveMovement(level: Level, position: Vec3, surfaceId: string, input: Point, dt: number): MovementSegment[] {
  const direction = normalizeInput(input);
  const count = Math.max(1, Math.ceil(SPEED * dt / 0.04));
  const dx = direction[0] * SPEED * dt / count, dz = direction[1] * SPEED * dt / count;
  let current = [...position] as Vec3, surface = index(level).get(surfaceId)!;
  const segments: MovementSegment[] = [];
  const append = (to: Vec3, target: Surface) => {
    const distance = Math.hypot(to[0] - current[0], to[2] - current[2]);
    if (distance <= EPSILON) return false;
    const uphill = to[1] - current[1];
    const coefficient = (uphill > EPSILON ? 2.5 : uphill < -EPSILON ? 0.8 : 1)*(level.staminaScale??1);
    segments.push({ from: current, to, surfaceId: target.id, distance, coefficient });
    current = to; surface = target;
    return true;
  };
  const add = (result: ReturnType<typeof tryStep>) => {
    if (!result) return false;
    if (result.surface.id !== surface.id) {
      const [x0,x1,z0,z1] = surface.bounds;
      const dx = result.position[0]-current[0], dz = result.position[2]-current[2];
      let t = 1;
      if(surface.polygon){
        for(let i=0;i<surface.polygon.length;i++){
          const a=surface.polygon[i],b=surface.polygon[(i+1)%surface.polygon.length];
          const start=(b[0]-a[0])*(current[2]-a[1])-(b[1]-a[1])*(current[0]-a[0]);
          const end=(b[0]-a[0])*(result.position[2]-a[1])-(b[1]-a[1])*(result.position[0]-a[0]);
          if(end<-EPSILON)t=Math.min(t,start/(start-end));
        }
      }
      if (dx > EPSILON) t = Math.min(t,(x1-current[0])/dx);
      if (dx < -EPSILON) t = Math.min(t,(x0-current[0])/dx);
      if (dz > EPSILON) t = Math.min(t,(z1-current[2])/dz);
      if (dz < -EPSILON) t = Math.min(t,(z0-current[2])/dz);
      t = Math.max(0,Math.min(1,t));
      const x = current[0]+dx*t,z = current[2]+dz*t;
      append([x,heightAt(surface,x,z),z],surface);
    }
    const moved = append(result.position,result.surface);
    if (!moved) surface = result.surface;
    return moved;
  };
  for (let i = 0; i < count; i++) {
    if (!add(tryStep(level, surface, current, dx, dz))) {
      if (Math.abs(dx) > EPSILON) add(tryStep(level, surface, current, dx, 0));
      if (Math.abs(dz) > EPSILON) add(tryStep(level, surface, current, 0, dz));
    }
  }
  return segments;
}
