import * as THREE from 'three';
import type { RunState, Solid, Transport, Vec3 } from '../domain/types';
import { samplePath } from '../domain/game';

const material = (color: string) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .82 });
function box(parent: THREE.Object3D, pos: Vec3, size: Vec3, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...pos); mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function solid(id: string, pos: Vec3, size: Vec3): Solid {
  return { id, min: pos.map((v,i)=>v-size[i]/2) as Vec3, max: pos.map((v,i)=>v+size[i]/2) as Vec3 };
}

/** Shaft footprint sits outside the upper walkway, so the cabin never crosses its slab. */
export function liftLayout(service: Transport): { center: Vec3; bottom: number; top: number; walls: Solid[]; reservation: Solid } {
  const [bottom, top] = service.path, [x,,z] = bottom, high = top[1] + 2.7;
  return { center: [...bottom], bottom: bottom[1], top: top[1], walls: [
    solid('lift-back',[x-1.45,(bottom[1]+high)/2,z],[.16,high-bottom[1],2.9]),
    ...[-1,1].map(side=>solid('lift-side-'+side,[x,(bottom[1]+high)/2,z+side*1.45],[2.9,high-bottom[1],.16])),
    ...[-1,1].map(side=>solid('lift-front-pier-'+side,[x+1.45,(bottom[1]+high)/2,z+side*1.15],[.16,high-bottom[1],.6])),
  ], reservation: solid('lift-interior-reserved',[x,(bottom[1]+high)/2,z],[2.9,high-bottom[1],2.9]) };
}

export class LiftModel {
  readonly cabin = new THREE.Group();
  readonly layout: ReturnType<typeof liftLayout>;
  private landingDoors: THREE.Mesh[][] = [];
  private cabinDoors: THREE.Mesh[] = [];
  private openness = [1,0];
  private cabinOpen = 1;
  private parked = 0;
  private generation = -1;
  private riding = false;
  constructor(private service: Transport, structure: THREE.Group, dynamic: THREE.Group) {
    this.layout = liftLayout(service);
    const { center: [x,,z], bottom, top, walls } = this.layout;
    const frame = material('#557e75'), cream = material('#e3d5b9'), dark = material('#365c56');
    const glass = new THREE.MeshBasicMaterial({ color:'#9fcbbd',transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide });
    // Actual open doorways at both floors, bounded by continuous corner posts.
    for (const wall of walls) {
      const p=wall.min.map((v,i)=>(v+wall.max[i])/2) as Vec3, size=wall.min.map((v,i)=>wall.max[i]-v) as Vec3;
      if(wall.id.includes('pier')) box(structure,p,size,frame);
      else {
        box(structure,p,size,glass);
        for(const y of[bottom+.15,top+.1,top+2.5])box(structure,[p[0],y,p[2]],[size[0],.12,size[2]],frame);
      }
    }
    for(const dx of[-1.45,1.45])for(const dz of[-1.45,1.45])
      box(structure,[x+dx,(bottom+top+2.7)/2,z+dz],[.14,top-bottom+2.7,.14],frame);
    box(structure,[x,top+2.75,z],[3.15,.22,3.15],cream);
    for(const y of[bottom,top]) {
      box(structure,[x+1.46,y+2.35,z],[.2,.3,2.9],frame);
      box(structure,[x+1.64,y-.08,z],[.4,.16,1.85],cream);
      const doors=[-1,1].map(side=>box(dynamic,[x+1.46,y+1.07,z+side*.41],[.08,2.14,.8],dark));
      this.landingDoors.push(doors);
      box(structure,[x+1.58,y+1.15,z+.99],[.12,.2,.14],material('#e5b25c'));
    }
    // Open, glazed cabin: the player remains visible, with feet on its moving floor.
    box(this.cabin,[0,-.09,0],[2.58,.18,2.5],cream);
    box(this.cabin,[0,2.32,0],[2.58,.16,2.5],frame);
    box(this.cabin,[-1.23,1.12,0],[.1,2.24,2.5],glass);
    for(const side of[-1,1]) {
      box(this.cabin,[0,1.12,side*1.2],[2.5,2.24,.07],glass);
      box(this.cabin,[0,.75,side*1.2],[2.5,.07,.07],frame);
      for(const dx of[-1.2,1.2])box(this.cabin,[dx,1.12,side*1.2],[.08,2.24,.08],frame);
    }
    for(const side of[-1,1])this.cabinDoors.push(box(this.cabin,[1.25,1.07,side*.41],[.06,2.14,.8],glass));
    // Twin guide rails visibly continue through the whole travel height.
    for(const dz of[-.9,.9])box(structure,[x-1.32,(bottom+top+2.5)/2,z+dz],[.06,top-bottom+2.5,.06],dark);
    this.cabin.position.set(...service.path[0]); dynamic.add(this.cabin);
  }
  update(state: RunState, dt: number, reducedMotion: boolean): void {
    const active=state.ride?.serviceId===this.service.id;
    if(this.generation!==state.generation){
      this.generation=state.generation;this.parked=state.completedServices.includes(this.service.id)&&state.surfaceId===this.service.stops[1].surface?1:0;
      this.riding=false;
    }
    if(active)this.parked=state.ride!.direction?0:1;
    this.riding=active;
    const p=active?state.position:this.service.path[this.parked?this.service.path.length-1:0];
    this.cabin.position.set(...p);
    const blend=reducedMotion?1:1-Math.exp(-14*(state.paused?0:dt));
    this.cabinOpen+=((active?0:1)-this.cabinOpen)*blend;
    this.cabinDoors.forEach((door,i)=>door.position.z=(i?1:-1)*(.41+this.cabinOpen*.82));
    this.landingDoors.forEach((pair,index)=>{
      const open=!active&&index===this.parked?1:0;
      this.openness[index]+=(open-this.openness[index])*blend;
      pair.forEach((door,i)=>door.position.z=this.layout.center[2]+(i?1:-1)*(.41+this.openness[index]*.82));
    });
  }
  info(): { cabin: number[]; shaft: number[]; doors: number[]; riding: boolean } {
    return {cabin:this.cabin.position.toArray(),shaft:this.layout.center,doors:[...this.openness],riding:this.riding};
  }
}

/** Closed upper/return circuit. Upper treads remain horizontal, including while moving. */
export function escalatorStep(path: Vec3[], cycle: number): Vec3 {
  const u=((cycle%1)+1)%1,upper=u<=.5;
  const p=samplePath(path,upper?u*2:2-u*2);
  return [p[0],p[1]-(upper?0:.74),p[2]];
}

export class EscalatorModel {
  private lanes: { x:number; steps:THREE.InstancedMesh; edges:THREE.InstancedMesh; belts:{curve:THREE.CatmullRomCurve3;markers:THREE.InstancedMesh}[] }[]=[];
  private phase=0;
  private generation=-1;
  private direction=1;
  private dummy=new THREE.Object3D();
  private count=64;
  constructor(private service: Transport, structure: THREE.Group, dynamic: THREE.Group) {
    const tread=material('#a7aaa0'),edge=material('#dfbc60'),rail=material('#344f4b'),silver=material('#a4b5a9');
    const [a,b]=service.path;
    for(const x of[-.2,2,4.2]) {
      const steps=new THREE.InstancedMesh(new THREE.BoxGeometry(1.5,.28,.5),tread,this.count);
      const edges=new THREE.InstancedMesh(new THREE.BoxGeometry(1.5,.018,.055),edge,this.count);
      steps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);edges.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      steps.frustumCulled=false;edges.frustumCulled=false;dynamic.add(steps,edges);
      const belts=[];
      for(const dx of[-.84,.84]) {
        const xx=x+dx;
        const points=[new THREE.Vector3(xx,a[1]+.94,a[2]),new THREE.Vector3(xx,(a[1]+b[1])/2+.94,(a[2]+b[2])/2),
          new THREE.Vector3(xx,b[1]+.94,b[2]),new THREE.Vector3(xx,b[1]+.72,b[2]-.3),new THREE.Vector3(xx,b[1]+.49,b[2]),
          new THREE.Vector3(xx,(a[1]+b[1])/2+.49,(a[2]+b[2])/2),new THREE.Vector3(xx,a[1]+.49,a[2]),new THREE.Vector3(xx,a[1]+.72,a[2]+.3)];
        const curve=new THREE.CatmullRomCurve3(points,true,'centripetal');
        const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,96,.065,6,true),rail);structure.add(tube);
        const markers=new THREE.InstancedMesh(new THREE.BoxGeometry(.14,.025,.10),silver,18);
        markers.frustumCulled=false;markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);dynamic.add(markers);
        belts.push({curve,markers});
      }
      this.lanes.push({x,steps,edges,belts});
      // Combs and landings stay fixed as the tread circuit disappears below them.
      for(const p of[a,b])box(structure,[x,p[1]-.03,p[2]],[1.62,.1,.65],silver);
    }
  }
  update(state: RunState, dt: number, reducedMotion: boolean): void {
    if(this.generation!==state.generation){this.generation=state.generation;this.phase=0;this.direction=1;}
    const ride=state.ride?.serviceId===this.service.id?state.ride:undefined;
    if(ride){this.direction=ride.direction?-1:1;this.phase=(ride.direction?1-ride.elapsed/ride.duration:ride.elapsed/ride.duration)*.5;}
    else if(!state.paused&&!reducedMotion)this.phase=(this.phase+dt/this.service.duration*.5*this.direction+1)%1;
    for(const lane of this.lanes) {
      const phase=lane.x===2?this.phase:lane.x<2?this.phase:-this.phase;
      for(let i=0;i<this.count;i++) {
        const p=escalatorStep(this.service.path,i/this.count+phase);
        this.dummy.position.set(lane.x,p[1]-.12,p[2]);this.dummy.rotation.set(0,0,0);this.dummy.updateMatrix();lane.steps.setMatrixAt(i,this.dummy.matrix);
        this.dummy.position.y=p[1]+.028;this.dummy.position.z-=.2;this.dummy.updateMatrix();lane.edges.setMatrixAt(i,this.dummy.matrix);
      }
      lane.steps.instanceMatrix.needsUpdate=true;lane.edges.instanceMatrix.needsUpdate=true;
      for(const {curve,markers}of lane.belts)for(let i=0;i<18;i++) {
        const u=((i/18+phase)%1+1)%1,p=curve.getPointAt(u),tangent=curve.getTangentAt(u);
        this.dummy.position.copy(p);this.dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),tangent);this.dummy.updateMatrix();markers.setMatrixAt(i,this.dummy.matrix);
        markers.instanceMatrix.needsUpdate=true;
      }
    }
  }
  info(): { phase:number; step:Vec3; lanes:number; vehicle:boolean } {
    return {phase:this.phase,step:escalatorStep(this.service.path,this.phase),lanes:this.lanes.length,vehicle:false};
  }
}
