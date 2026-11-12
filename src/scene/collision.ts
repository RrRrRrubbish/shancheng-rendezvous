import type { Level, Solid, Surface, Vec3 } from '../domain/types';
import { contains, heightAt, surfacesNear } from '../movement/ground';
import { compileRoads } from '../movement/roads';

interface Plane { normal:Vec3; offset:number }
export interface CameraSolid { id:string; planes:Plane[]; min:Vec3; max:Vec3 }
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const normalized=(normal:Vec3,offset:number):Plane=>{const length=Math.hypot(...normal);return{normal:normal.map(n=>n/length) as Vec3,offset:offset/length};};
export function boxCollider(s:Solid):CameraSolid {
  return {...s,planes:[{normal:[1,0,0],offset:s.max[0]},{normal:[-1,0,0],offset:-s.min[0]},
    {normal:[0,1,0],offset:s.max[1]},{normal:[0,-1,0],offset:-s.min[1]},
    {normal:[0,0,1],offset:s.max[2]},{normal:[0,0,-1],offset:-s.min[2]}]};
}
export function beamCollider(id:string,a:Vec3,b:Vec3,width:number,height:number):CameraSolid {
  const delta=b.map((v,i)=>v-a[i]) as Vec3,d=Math.hypot(...delta),flat=Math.hypot(delta[0],delta[2]);
  const z=delta.map(v=>v/d) as Vec3,x:Vec3=[delta[2]/flat,0,-delta[0]/flat];
  const y:Vec3=[z[1]*x[2],z[2]*x[0]-z[0]*x[2],-z[1]*x[0]],center=a.map((v,i)=>(v+b[i])/2) as Vec3;
  const planes:Plane[]=[];for(const[axis,r]of [[x,width/2],[y,height/2],[z,d/2]] as const){planes.push({normal:axis,offset:dot(axis,center)+r},{normal:axis.map(v=>-v) as Vec3,offset:-dot(axis,center)+r});}
  const size=center.map((_,i)=>Math.abs(x[i])*width/2+Math.abs(y[i])*height/2+Math.abs(z[i])*d/2);
  return{id,planes,min:center.map((v,i)=>v-size[i]) as Vec3,max:center.map((v,i)=>v+size[i]) as Vec3};
}
export function surfaceCollider(s:Surface):CameraSolid {
  const [x0,x1,z0,z1]=s.bounds,polygon=s.polygon??[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
  const planes:Plane[]=polygon.map((a,i)=>{const b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dz=b[1]-a[1];return normalized([dz,0,-dx],dz*a[0]-dx*a[1]);});
  const [gx,gz]=s.gradient,c=s.origin[1]-gx*s.origin[0]-gz*s.origin[2],thickness=s.thickness??(s.terrain==='stairs'?0.55:0.6);
  planes.push(normalized([-gx,1,-gz],c),normalized([gx,-1,gz],-c+thickness));
  const heights=polygon.map(p=>heightAt(s,p[0],p[1]));
  const min:Vec3=[x0,Math.min(...heights)-thickness,z0],max:Vec3=[x1,Math.max(...heights),z1];
  // Bound acute triangle corners as well as face planes when expanding for camera volume.
  planes.push(...boxCollider({id:s.id,min,max}).planes);
  return {id:s.id,planes,min,max};
}
export function sphereInside(p:Vec3,solid:CameraSolid,radius=0.28):boolean {
  return solid.planes.every(plane=>dot(plane.normal,p)<plane.offset+radius-1e-5);
}
export function sweepCamera(a:Vec3,b:Vec3,solids:CameraSolid[],radius=0.28):{position:Vec3;fraction:number;obstacle?:string} {
  const delta=b.map((v,i)=>v-a[i]) as Vec3;let nearest=1,obstacle:string|undefined;
  for(const solid of solids){
    if(solid.min.some((v,i)=>Math.max(a[i],b[i])+radius<v)||solid.max.some((v,i)=>Math.min(a[i],b[i])-radius>v))continue;
    let enter=0,leave=1,possible=true;
    for(const plane of solid.planes){
      const start=dot(plane.normal,a)-plane.offset-radius,velocity=dot(plane.normal,delta);
      if(Math.abs(velocity)<1e-8){if(start>0){possible=false;break;}continue;}
      const t=-start/velocity;if(velocity<0)enter=Math.max(enter,t);else leave=Math.min(leave,t);
      if(enter>leave){possible=false;break;}
    }
    if(possible&&leave>0&&enter<nearest){nearest=Math.max(0,enter-0.012/Math.max(0.01,Math.hypot(...delta)));obstacle=solid.id;}
  }
  return {position:a.map((v,i)=>v+delta[i]*nearest) as Vec3,fraction:nearest,obstacle};
}
export function resolveFollowCamera(target:Vec3,desired:Vec3,solids:CameraSolid[]):{position:Vec3;fraction:number;obstacle?:string;occluded?:boolean} {
  const hit=sweepCamera(target,desired,solids),length=Math.hypot(...desired.map((v,i)=>v-target[i]));
  const distance=Math.hypot(...hit.position.map((v,i)=>v-target[i]));
  if(distance>=2.2||length<2.2)return hit;
  // A thin pillar beside the head must not collapse the camera into the actor.
  // Use a clear point beyond the occluder and fade the sightline locally; the
  // camera itself stays outside solids. Camera travel is checked independently.
  for(const factor of[1,0.85,0.7,0.55,0.4,0.3]){
    if(length*factor<2.2)continue;
    const candidate=target.map((v,i)=>v+(desired[i]-v)*factor) as Vec3;
    if(!solids.some(s=>sphereInside(candidate,s)))return{position:candidate,fraction:factor,obstacle:hit.obstacle,occluded:true};
  }
  // A ramp or low roof may fill the entire requested ray at eye level. Search
  // nearby external angles before allowing the eye to collapse onto the target.
  if(distance<1.1){
    const yaw=Math.atan2(desired[0]-target[0],desired[2]-target[2]);
    const pitch=Math.asin((desired[1]-target[1])/Math.max(0.01,length));
    for(const turn of[0,Math.PI/6,-Math.PI/6,Math.PI/3,-Math.PI/3,Math.PI/2,-Math.PI/2,Math.PI]){
      for(const elevation of[pitch+0.25,pitch-0.25,0.6]){
        const range=Math.min(length,5),p=Math.max(-0.15,Math.min(1.1,elevation));
        const candidate:Vec3=[target[0]+Math.sin(yaw+turn)*Math.cos(p)*range,target[1]+Math.sin(p)*range,target[2]+Math.cos(yaw+turn)*Math.cos(p)*range];
        if(!solids.some(s=>sphereInside(candidate,s)))return{position:candidate,fraction:range/length,obstacle:hit.obstacle,occluded:true};
      }
    }
  }
  return hit;
}
const layouts=new WeakMap<Level,Solid[]>();
const box=(id:string,p:Vec3,size:Vec3):Solid=>({id,min:p.map((v,i)=>v-size[i]/2) as Vec3,max:p.map((v,i)=>v+size[i]/2) as Vec3});
export function structuralSolids(level:Level):Solid[]{
  const cached=layouts.get(level);if(cached)return cached;
  const solids:Solid[]=[];
  const add=(id:string,p:Vec3,size:Vec3)=>solids.push(box(id,p,size));
  if(level.network){
    for(const prepared of compileRoads(level.network).roads){
      if(prepared.road.kind==='ramp'&&!prepared.road.id.startsWith('outer-'))continue;
      let previous=-20;
      for(let i=0;i<prepared.points.length;i++){
        const p=prepared.points[i],distance=Math.hypot(p[0]-prepared.points[0][0],p[2]-prepared.points[0][2]);
        if(p[1]<3||distance-previous<9||i<2||i>prepared.points.length-3)continue;
        const a=prepared.points[i-1],b=prepared.points[i+1];
        if(Math.abs(b[1]-a[1])/Math.max(0.01,Math.hypot(b[0]-a[0],b[2]-a[2]))>0.35)continue;
        // A full vertical pier must miss every lower route, including its walkable shoulders.
        const blocked=surfacesNear(level,p[0],p[2]).some(s=>contains(s,p[0],p[2],-1.1)&&heightAt(s,p[0],p[2])<p[1]-1.3);
        if(blocked)continue;
        const top=p[1]-0.5;add('pier-'+prepared.road.id+'-'+i,[p[0],(top-0.5)/2,p[2]],[0.85,top+0.5,0.85]);previous=distance;
      }
    }
  }
  for(const cp of level.checkpoints){const[x,y,z]=cp.position,[dx,dz]=cp.benchOffset??[0,-1.25];add('bench-'+cp.id,[x+dx,y+0.4,z+dz],[1.25,0.8,0.5]);}
  layouts.set(level,solids);return solids;
}

export const CAMERA_PITCH_MIN=Math.PI*-12/180;
export const CAMERA_PITCH_MAX=Math.PI*68/180;
export const wrapAngle=(angle:number):number=>Math.atan2(Math.sin(angle),Math.cos(angle));
export function clampOrbit(offset:number,pitch:number):{offset:number;pitch:number}{
  return{offset:wrapAngle(offset),pitch:Math.max(CAMERA_PITCH_MIN,Math.min(CAMERA_PITCH_MAX,pitch))};
}

/** Looking up raises the aim, keeping the eye above the walking surface instead of underground. */
export function followOrbit(position:Vec3,yaw:number,pitch:number,distance:number,solids:CameraSolid[]):{target:Vec3;desired:Vec3}{
  const head:Vec3=[position[0],position[1]+1.22,position[2]];
  const lift=Math.max(0,-Math.sin(pitch)*distance);
  const target=sweepCamera(head,[head[0],head[1]+lift,head[2]],solids).position;
  return{target,desired:[target[0]+Math.sin(yaw)*Math.cos(pitch)*distance,
    Math.max(position[1]+0.7,target[1]+Math.sin(pitch)*distance),target[2]+Math.cos(yaw)*Math.cos(pitch)*distance]};
}
