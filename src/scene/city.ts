import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Level, RunState, Solid, Surface, Transport, Vec3 } from '../domain/types';
import { bodyBlocked, contains, heightAt, surfacesNear } from '../movement/ground';
import { compileRoads } from '../movement/roads';
import { beamCollider, boxCollider, CAMERA_PITCH_MIN, CAMERA_PITCH_MAX, clampOrbit, followOrbit, wrapAngle, resolveFollowCamera, sphereInside, structuralSolids, surfaceCollider, sweepCamera } from './collision';
import type { CameraSolid } from './collision';
import { samplePath } from '../domain/game';
import { Walker } from './actor';
import { CityEnvironment } from './environment';
import { EscalatorModel, LiftModel } from './transport';
import { createSign } from './signs';

const C = { paper:'#f1ecdf',road:'#ede3ce',side:'#b3bd9a',teal:'#537b72',coral:'#d96d4c',gold:'#d2a55f',dark:'#3e5754',foliage:'#879b73',water:'#91b7ad' };
const random=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
export class CityScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(58,1,0.1,360);
  private scene = new THREE.Scene();
  private staticRoot = new THREE.Group();
  private actor = new THREE.Group();
  private walker = new Walker();
  private contactShadow?:THREE.Mesh;
  private environment:CityEnvironment;
  private sun = new THREE.DirectionalLight('#fff1c9',2.2);
  private shadowAnchor = new THREE.Vector3(Infinity,Infinity,Infinity);
  private lowQuality=false;
  private dynamic = new THREE.Group();
  private passengerVehicles = new Map<string,THREE.Group>();
  private parkedVehiclePaths = new Map<string,Vec3[]>();
  private lift?:LiftModel;
  private escalator?:EscalatorModel;
  private signLayer=document.createElement('div');
  private signs:{object:THREE.Group;label:HTMLSpanElement}[]=[];
  private vehicles: { object:THREE.Group;path:Vec3[];duration:number;offset:number;rotation:number;service?:string }[] = [];
  private discs = new Map<string,THREE.Object3D>();
  private materials = new Map<string,THREE.MeshStandardMaterial>();
  private observer: ResizeObserver;
  private animation = 0;
  private state?: RunState;
  private elapsed = 0;
  private lastTime = 0;
  private disposed = false;
  private reducedMotion = false;
  private width = 1;
  private height = 1;
  private zoom = 1;
  private forceCutaway = false;
  private overview = false;
  private yaw = Math.PI / 4;
  private pitch = 0.58;
  private baseYaw = 0;
  private orbitOffset = 0;
  private manualOrbit = false;
  private rideCamera?: { key:string; transport:Transport; generation:number; saved:{yaw:number;baseYaw:number;offset:number;pitch:number;zoom:number;manual:boolean} };
  private cameraTransition = 0;
  private rideVehiclePosition?:Vec3;
  private colliders:CameraSolid[]=[];
  private cameraObstructed = false;
  private cameraTarget = new THREE.Vector3();
  private cameraReady = false;
  private cameraGeneration = -1;
  private drag?: { id:number;x:number;y:number };
  private raycaster = new THREE.Raycaster();
  private blocking = new Set<THREE.Object3D>();
  get movementYaw():number { return this.overview ? Math.PI/4 : this.yaw; }
  get viewMode():'follow'|'overview'|'ride-overview' { return this.rideCamera?'ride-overview':this.overview ? 'overview' : 'follow'; }
  private pointerDown = (e:PointerEvent):void => {
    if(e.button!==0 || this.drag || this.overview || this.rideCamera || this.state?.paused)return;
    e.preventDefault();
    this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.host.focus({preventScroll:true});
  };
  private pointerMove = (e:PointerEvent):void => {
    if(!this.drag || this.drag.id!==e.pointerId || this.state?.paused)return;
    const orbit=clampOrbit(this.orbitOffset-(e.clientX-this.drag.x)*0.005,this.pitch+(e.clientY-this.drag.y)*0.003);
    this.manualOrbit=true;this.orbitOffset=orbit.offset;this.pitch=orbit.pitch;this.yaw=this.baseYaw+this.orbitOffset;
    this.drag.x=e.clientX;this.drag.y=e.clientY;
  };
  private pointerEnd = (event?:PointerEvent):void => {
    if(event&&event.pointerId!==this.drag?.id)return;
    const id=this.drag?.id;this.drag=undefined;
    if(id!==undefined&&this.renderer.domElement.hasPointerCapture(id))this.renderer.domElement.releasePointerCapture(id);
  };
  setOverview(value:boolean):void { if(this.rideCamera)return;this.overview=value;this.pointerEnd();this.cameraReady=false; }
  private defaultYaw():number {return this.level.id==='yangtze-cableway'||this.level.network?-Math.PI/2:0;}
  recenter():void { if(this.rideCamera)return;this.manualOrbit=false;this.baseYaw=this.localYaw();this.orbitOffset=0;this.yaw=this.baseYaw;this.pitch=0.58;this.overview=false;this.cameraReady=false; }
  cameraInfo() {
    const p=this.camera.position.toArray() as Vec3;
    return {mode:this.viewMode,yaw:this.movementYaw,baseYaw:this.baseYaw,pitch:this.pitch,offset:this.orbitOffset,position:p,target:this.cameraTarget.toArray(),blocked:this.cameraObstructed,inside:this.colliders.filter(c=>sphereInside(p,c)).map(c=>c.id),vehiclePosition:this.rideVehiclePosition,transitioning:this.cameraTransition>0,actor:this.walker.info(),actorVisible:this.actor.visible,shadows:this.renderer.shadowMap.enabled,lift:this.lift?.info(),escalator:this.escalator?.info()};
  }
  private fadeMeshes: {mesh:THREE.Mesh;minY:number;material:THREE.MeshStandardMaterial}[] = [];
  constructor(private host:HTMLElement,readonly level:Level,onFrame:(dt:number)=>void,onLost:()=>void) {
    this.yaw=this.defaultYaw();this.baseYaw=this.yaw;
    this.level.obstacles=[...(this.level.obstacles??[]),...structuralSolids(level).filter(o=>!this.level.obstacles?.some(s=>s.id===o.id))];
    this.colliders=level.surfaces.map(surfaceCollider).concat(this.level.obstacles.filter(s=>s.id!=='lift-interior-reserved').map(boxCollider));
    this.renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    const canvas=this.renderer.domElement;canvas.className='city-canvas';canvas.setAttribute('aria-label',level.name+'三维探索场景');
    canvas.addEventListener('pointerdown',this.pointerDown);canvas.addEventListener('pointermove',this.pointerMove);
    canvas.addEventListener('pointerup',this.pointerEnd);canvas.addEventListener('pointercancel',this.pointerEnd);
    canvas.addEventListener('lostpointercapture',this.pointerEnd);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onLost();});host.prepend(canvas);
    this.signLayer.className='sign-labels';this.signLayer.setAttribute('aria-hidden','true');host.append(this.signLayer);
    this.scene.background=new THREE.Color('#dce9e0');this.scene.fog=new THREE.Fog('#dce9e0',level.network?100:68,level.network?270:230);
    this.scene.add(new THREE.HemisphereLight('#fff8df','#6e8d83',1.7));
    this.sun.position.set(-24,38,20);this.sun.castShadow=true;
    const shadow=this.sun.shadow;shadow.mapSize.setScalar(matchMedia('(any-pointer:coarse)').matches?1024:2048);
    shadow.camera.left=-26;shadow.camera.right=26;shadow.camera.top=26;shadow.camera.bottom=-26;shadow.camera.near=0.5;shadow.camera.far=110;
    shadow.bias=-0.0003;shadow.normalBias=0.055;shadow.autoUpdate=false;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.scene.add(this.sun,this.sun.target);
    this.scene.add(this.staticRoot,this.dynamic);
    this.environment=new CityEnvironment(level);this.scene.add(this.environment);
    const target=new THREE.Vector3(...level.center).add(new THREE.Vector3(0,2.4,0));
    this.camera.position.copy(target).add(new THREE.Vector3(38,39,38));this.camera.lookAt(target);
    this.build();this.buildActor();this.buildPassengerVehicles();this.batch();this.resize();
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
    const frame=(now:number)=>{
      if(this.disposed)return;
      const dt=this.lastTime?Math.min((now-this.lastTime)/1000,0.085):0;this.lastTime=now;
      onFrame(document.hidden?0:dt);
      if(!document.hidden){if(!this.state?.paused)this.elapsed+=dt;this.animate(dt);this.renderer.render(this.scene,this.camera);}
      this.animation=requestAnimationFrame(frame);
    };this.animation=requestAnimationFrame(frame);
  }
  private mat(color:string):THREE.MeshStandardMaterial {
    if(!this.materials.has(color))this.materials.set(color,new THREE.MeshStandardMaterial({color,roughness:0.88,flatShading:true}));
    return this.materials.get(color)!;
  }
  private box(parent:THREE.Object3D,pos:Vec3,size:Vec3,color:string):THREE.Mesh {
    const m=new THREE.Mesh(new THREE.BoxGeometry(...size),this.mat(color));m.position.set(...pos);parent.add(m);
    if(parent===this.staticRoot&&size[0]*size[1]*size[2]>=0.6)this.colliders.push(boxCollider({id:'model-'+this.colliders.length,min:pos.map((v,i)=>v-size[i]/2) as Vec3,max:pos.map((v,i)=>v+size[i]/2) as Vec3}));
    return m;
  }
  private beam(parent:THREE.Object3D,a:Vec3,b:Vec3,width:number,height:number,color:string):void {
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),d=end.clone().sub(start);
    const m=new THREE.Mesh(new THREE.BoxGeometry(width,height,d.length()),this.mat(color));
    m.position.copy(start).lerp(end,0.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),d.normalize());parent.add(m);
  }
  private ball(parent:THREE.Object3D,pos:Vec3,r:number,color:string,scale:Vec3=[1,1,1]):THREE.Mesh {
    const m=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1),this.mat(color));m.position.set(...pos);m.scale.set(...scale);parent.add(m);return m;
  }
  private pole(parent:THREE.Object3D,pos:Vec3,height:number,r:number,color:string):void {
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,height,8),this.mat(color));m.position.set(pos[0],pos[1]+height/2,pos[2]);parent.add(m);
  }
  private tree(x:number,y:number,z:number,size=1):void {
    this.pole(this.staticRoot,[x,y,z],1.7*size,0.09*size,'#8e8165');
    this.ball(this.staticRoot,[x,y+2*size,z],0.75*size,C.foliage,[0.85,1.15,0.85]);
    this.ball(this.staticRoot,[x+0.4*size,y+1.6*size,z+0.1],0.52*size,'#a0ad83');
  }
  private sign(pos:Vec3,text:string,width=2.4,height=0.55,color:string=C.teal):void {
    const object=createSign(text,width,height,color,this.renderer.capabilities.getMaxAnisotropy());
    object.position.set(...pos);this.staticRoot.add(object);
    const label=document.createElement('span');label.className='sign-readable';label.textContent=text;label.hidden=true;this.signLayer.append(label);this.signs.push({object,label});
  }
  private building(pos:Vec3,width:number,depth:number,height:number,color:string):void {
    const[x,y,z]=pos;
    const seed=x*13.1+z*7.3+height*3.1;
    const facade=new THREE.Color(color).lerp(new THREE.Color(['#b6c4b6','#d5ba98','#c9cebc','#aabcb7'][Math.floor(random(seed)*4)]),.18+random(seed+1)*.25);
    this.box(this.staticRoot,[x,y+height/2,z],[width,height,depth],'#'+facade.getHexString());
    this.registerSolid({id:'building-'+pos.join(':'),min:[x-width/2,y,z-depth/2],max:[x+width/2,y+height,z+depth/2]});
    // Facade detail is decorative, grouped without adding tiny movement/camera obstacles.
    const details=new THREE.Group();this.staticRoot.add(details);
    this.box(details,[x,y+height+0.08,z],[width+0.16,0.16,depth+0.16],C.teal);
    const rows=Math.max(1,Math.floor((height-.2)/1.05)),columns=Math.max(1,Math.floor(width/0.85));
    for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){
      const xx=x-width/2+(c+0.5)*width/columns,yy=y+.64+r*1.05,s=seed+r*19+c*5;
      this.box(details,[xx,yy,z+depth/2+.025],[.34,.46,.04],random(s)>.78?'#e8c88b':random(s+4)>.5?'#6e8d84':'#879f98');
      if(random(s+1)>.71&&width<9){
        this.box(details,[xx,yy-.28,z+depth/2+.22],[.62,.08,.44],'#b5b099');
        this.box(details,[xx,yy-.06,z+depth/2+.41],[.62,.30,.055],'#92a597');
      }else if(random(s+2)>.82){
        this.box(details,[xx+.18,yy-.31,z+depth/2+.12],[.26,.18,.18],'#d6d6c7');
        this.box(details,[xx+.18,yy-.31,z+depth/2+.22],[.17,.10,.015],'#9aa99e');
      }
    }
    for(let r=0;r<rows;r++)for(let c=0;c<Math.max(1,Math.floor(depth/1.5));c++){
      const zz=z-depth/2+.75+c*1.4;
      this.box(details,[x+width/2+.025,y+.7+r*1.05,zz],[.04,.45,.4],random(seed+r*9+c)>.7?'#d9c69a':'#849c8c');
    }
    if(height>3){
      this.box(details,[x+width*.18,y+height+.35,z-.3],[.85,.5,.7],'#c2bca7');
      this.box(details,[x-width*.22,y+height+.19,z+.35],[.7,.22,.6],'#859e91');
      this.pole(details,[x+width*.18,y+height+.6,z-.3],.5,.055,'#6e8b7b');
      if(random(seed+8)>.5)this.box(details,[x-width*.2,y+height+.55,z-depth*.2],[.6,.7,.6],'#acb4a3');
    }
  }
  private registerSolid(solid:Solid):void {
    if(this.level.obstacles!.some(s=>s.id===solid.id))return;
    this.level.obstacles!.push(solid);this.colliders.push(boxCollider(solid));
  }
  private surface(s:Surface):void {
    const[x0,x1,z0,z1]=s.bounds,w=x1-x0,d=z1-z0;
    const polygon=s.polygon??[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
    const top=polygon.map(p=>[p[0],heightAt(s,p[0],p[1]),p[1]]);
    const order=s.id.startsWith('junction-')?0.034:s.roadId?0.008+this.level.network!.roads.findIndex(r=>r.id===s.roadId)*0.0008:0;
    const vertices=top.flatMap(p=>[p[0],p[1]+order,p[2]]),indices:number[]=[];
    for(let i=1;i<polygon.length-1;i++)indices.push(0,i+1,i);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
    const asphalt=this.level.network?['#526976','#5b737b','#5e7581','#596c7c','#627986'][(s.tier??1)-1]:C.road;
    if(s.terrain!=='stairs')this.staticRoot.add(new THREE.Mesh(geo,this.mat(asphalt)));else geo.dispose();
    const thickness=s.thickness??0.55,slab:number[]=[],faces:number[]=[];
    top.forEach(p=>slab.push(...p));top.forEach(p=>slab.push(p[0],p[1]-thickness,p[2]));
    const n=top.length;
    for(let i=0;i<n;i++){const j=(i+1)%n;faces.push(i,j,i+n,j,j+n,i+n);}
    for(let i=1;i<n-1;i++)faces.push(n,n+i,n+i+1);
    const underside=new THREE.BufferGeometry();underside.setAttribute('position',new THREE.Float32BufferAttribute(slab,3));underside.setIndex(faces);underside.computeVertexNormals();
    this.staticRoot.add(new THREE.Mesh(underside,this.mat(this.level.network?'#c3baa3': '#a4ad99')));
    if(s.terrain==='stairs'){
      const axis=Math.abs(s.gradient[0])>0?'x':'z',length=axis==='x'?w:d,count=Math.ceil(length/0.3);
      for(let i=0;i<count;i++){
        const x=axis==='x'?x0+(i+0.5)*w/count:(x0+x1)/2,z=axis==='z'?z0+(i+0.5)*d/count:(z0+z1)/2;
        this.box(this.staticRoot,[x,heightAt(s,x,z)-0.21,z],[axis==='x'?w/count:w,0.42,axis==='z'?d/count:d],i%2?'#d9c7a4':'#e5d3b0');
      }
      if(axis==='z')for(const x of[x0+0.12,x1-0.12])this.rail([x,heightAt(s,x,z0),z0],[x,heightAt(s,x,z1),z1]);
      else for(const z of[z0+0.12,z1-0.12])this.rail([x0,heightAt(s,x0,z),z],[x1,heightAt(s,x1,z),z]);
    }
  }
  private rail(a:Vec3,b:Vec3):void {
    this.beam(this.staticRoot,[a[0],a[1]+0.7,a[2]],[b[0],b[1]+0.7,b[2]],0.065,0.065,C.teal);
    const count=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/1.4));
    for(let i=0;i<=count;i++){const t=i/count;this.pole(this.staticRoot,[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t],0.7,0.035,C.teal);}
  }
  private ring(pos:Vec3,color:string,r=0.65):THREE.Group {
    const g=new THREE.Group();g.position.set(...pos);
    const m=new THREE.Mesh(new THREE.RingGeometry(r*0.72,r,40),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:0.85,depthWrite:false}));
    m.rotation.x=-Math.PI/2;m.position.y=0.055;g.add(m);this.dynamic.add(g);return g;
  }
  private build():void {
    const center=this.level.center;
    if(this.level.id!=='yangtze-cableway'){
      this.box(this.staticRoot,[0,-1.35,0],[this.level.network?82:this.level.id==='liziba'?70:66,1.8,this.level.network?82:this.level.id==='liziba'?40:36],'#a9b393');
      this.box(this.staticRoot,[0,-2.45,0],[this.level.network?81:this.level.id==='liziba'?69:65,0.5,this.level.network?81:this.level.id==='liziba'?39:35],'#c8c4ab');
    }else{
      this.box(this.staticRoot,[-7,0,2],[16,1.6,21],'#a9b393');this.box(this.staticRoot,[22,0,2],[14,1.6,21],'#a9b393');
    }
    this.level.surfaces.forEach(s=>this.surface(s));
    this.backdrop();
    if(this.level.id==='liziba')this.liziba();
    if(this.level.id==='crown-escalator')this.crown();
    if(this.level.id==='yangtze-cableway')this.cableway();
    if(this.level.id==='huangjuewan')this.interchange();
    this.level.transports.forEach(t=>t.stops.forEach((stop,index)=>{
      this.ring(stop.position,C.teal,0.66);
      const[x,y,z]=stop.position;this.pole(this.staticRoot,[x+0.7,y,z],1.4,0.04,C.teal);
      this.sign([x+0.7,y+1.6,z],t.kind==='rail'?'轨道入口':t.kind==='escalator'?'扶梯'+(index?'上口':'下口'):t.kind==='cableway'?'索道入口':'直梯',1.7,0.42);
    }));
    for(const d of this.level.discoveries){const g=this.ring(d.position,C.gold,0.5);this.ball(g,[0,0.8,0],0.14,C.gold);this.discs.set(d.id,g);}
    for(const cp of this.level.checkpoints){
      const[x,y,z]=cp.position;const marker=this.ring(cp.position,'#299f9c',0.9);this.discs.set(cp.id,marker);
      const[dx,dz]=cp.benchOffset??[0,-1.25],bx=x+dx,bz=z+dz;
      this.ball(marker,[0,1.45,0],0.26,'#45c4ab');
      this.box(this.staticRoot,[bx,y+0.3,bz],[1.2,0.14,0.35],'#a98b61');this.box(this.staticRoot,[bx,y+0.55,bz-0.19],[1.2,0.35,0.08],'#a98b61');
      for(const offset of [-0.45,0.45])this.box(this.staticRoot,[bx+offset,y+0.14,bz],[0.08,0.28,0.3],C.dark);
    }
    const[gx,gy,gz]=this.level.goal.position;this.ring(this.level.goal.position,C.coral,0.8);
    this.pole(this.staticRoot,[gx+0.45,gy,gz],2.1,0.045,C.coral);this.box(this.staticRoot,[gx+0.9,gy+1.85,gz],[0.85,0.5,0.05],C.coral);
    this.sign([gx+0.7,gy+2.6,gz],this.level.goalName,2.1,0.45,C.coral);
    for(let i=0;i<7;i++){const h=this.ball(this.staticRoot,[center[0]-25+i*9,-3,-24-i%2*5],5+i%3*2,i%2?'#c4c9ae':'#cdd0b8',[1.3,0.8,0.8]);h.rotation.y=i*0.5;}
  }
  private backdrop():void {
    const id=this.level.id;
    if(id==='liziba'||id==='crown-escalator'){
      // Broad terraces and a dense hillside establish the city's vertical form.
      this.box(this.staticRoot,[-4,1.8,-23],[68,7,9],'#a6b092');
      this.box(this.staticRoot,[0,4.4,-32],[75,12,9],'#aab397');
      for(let i=0;i<11;i++){
        const x=-27+i*5.1,z=-30-random(i+20)*8,y=6+random(i+22)*2;
        this.building([x,y,z],3+random(i)*2,3.4,7+random(i+3)*9,['#c5c4b0','#d4c5a9','#b9c7b6'][Math.floor(random(i+7)*3)]);
      }
      for(let i=0;i<9;i++)this.tree(-22+i*5,7,-23.8,1+(i%3)*0.2);
    }else if(id==='yangtze-cableway'){
      for(const side of [-1,1]){
        const x=side<0?-30:43;
        this.box(this.staticRoot,[x,0.5,-15],[24,5.2,44],'#a6b19a');
        for(let i=0;i<8;i++)this.building([x+(i%3)*2.8,3,-20+i*5],3.2,3.5,7+(i*5)%14,side<0?'#c7c5b4':'#b7c2b1');
      }
      // A distant bridge reads as a river-city silhouette, not a playable route.
      this.beam(this.staticRoot,[0,2,-35],[18,2,-35],1.4,0.4,'#92a69c');
      for(const x of [1,17])this.box(this.staticRoot,[x,3,-35],[0.4,10,0.5],'#9aaba0');
      for(const x of [1,17])for(const end of [5,9,13])this.beam(this.staticRoot,[x,8,-35],[end,2,-35],0.04,0.04,'#a5b1a3');
    }else{
      for(let i=0;i<12;i++)this.building([-44+(i%6)*17,0,i<6?-44:44],4.5,5,6+(i*3)%12,'#bac5b2');
      for(let i=0;i<16;i++)this.tree(-38+(i%8)*10,0,i<8?-38:38,1.35);
    }
  }
  private liziba():void {
    const service=this.level.transports.find(t=>t.kind==='rail')!,track=[[-29,6.65,-9.8],...service.path,[18,6.65,-9.8]] as Vec3[];
    // Rail deck, running surface and the passenger train all use the same path.
    for(let i=0;i<track.length-1;i++){
      const a=track[i],b=track[i+1],deckA:Vec3=[a[0],a[1]-0.3,a[2]],deckB:Vec3=[b[0],b[1]-0.3,b[2]];
      this.beam(this.staticRoot,deckA,deckB,2.1,0.55,'#a8b4a4');
      for(const dz of[-0.63,0.63])this.beam(this.staticRoot,[a[0],a[1]+0.015,a[2]+dz],[b[0],b[1]+0.015,b[2]+dz],0.06,0.06,C.dark);
    }
    for(const x of[-25,-17,-9,0,8,17])this.box(this.staticRoot,[x,2.8,-9.8],[0.65,6.4,0.8],'#a0ac9a');
    // A broad lower building and an upper housing block frame a genuinely open rail corridor.
    this.building([5,0,-10.7],17,6.4,5.75,'#c8b89c');
    this.building([5,10.4,-10.7],17,6.4,11.2,'#dfcfad');
    for(const x of[-3,13])for(const z of[-13.4,-7.8])this.box(this.staticRoot,[x,8.1,z],[0.5,4.6,0.5],'#cdbb9c');
    this.sign([5,11.35,-7.42],'李子坝 · 轨道2号线',9,0.9);
    this.box(this.staticRoot,[11.5,6.15,-7.1],[18.8,0.3,0.8],'#d8c7a4');
    this.sign([14,7.8,-6.9],'李子坝站 · 出站 ↓',5.6,0.6);
    // Origin station is visibly separate from Liziba. Both boarding rings remain on platforms.
    this.sign([-24,8.3,-6.8],'佛图关站 → 李子坝',7,0.7);
    for(const x of[-30.5,-18])this.box(this.staticRoot,[x,8.1,-6.6],[0.24,4.2,0.24],'#95a393');
    this.box(this.staticRoot,[-24,10.3,-5.6],[14,0.22,4.8],'#9aa88f');
    const train=this.train();this.passengerVehicles.set('rail',train);train.visible=false;
    // No second decorative train is allowed to overlap or contradict the boarded one.
    this.lift=new LiftModel(this.level.transports.find(t=>t.kind==='lift')!,this.staticRoot,this.dynamic);
    this.lift.layout.walls.forEach(wall=>this.registerSolid(wall));
    // Entry is through E/tap; reserve the shaft from free walking, but its glass
    // is not an opaque camera volume. The cabin travels entirely outside the slab.
    if(!this.level.obstacles!.some(s=>s.id===this.lift!.layout.reservation.id))this.level.obstacles!.push(this.lift.layout.reservation);
    for(const z of[-1,4,8])this.box(this.staticRoot,[-16.7,2.6,z],[0.35,5.6,0.35],'#a7b198');
    this.sign([-27,1.5,5.4],'梯道 ↑ 佛图关站',4.1,0.55);
    this.sign([-21.3,1.55,12.3],'直梯入口 →',3.2,.5);
    this.sign([19,7.8,0.4],'出站梯道 ↓ 观景平台',5,0.55);
    for(const[x,z,h]of[[-33,0,7],[-8,1,8],[27,-4,9],[28,13,7]] as number[][])this.building([x,0,z],3.6,4,h,'#d7c2a1');
    for(const[x,z]of[[-30,15],[-12,14],[7,17],[24,16],[-19,2]])this.tree(x,0,z,1);
  }
  private crown():void {
    this.building([-4,0,-17],8,4,13,'#d5c4a5');this.building([9,0,-17],5,4,14,'#b9c0ab');
    this.sign([-3,10.3,-14.7],'两路口 · 菜园坝',5,0.65);
    const z0=7,z1=-9;
    this.beam(this.staticRoot,[2,-0.58,z0],[2,7.42,z1],8,0.4,'#b7aa8b');
    for(const x of[-2,6])this.beam(this.staticRoot,[x,2.8,z0],[x,10.8,z1],0.3,5.8,'#c5b69a');
    for(const x of[-0.2,2,4.2]){
      this.beam(this.staticRoot,[x,-0.32,z0],[x,7.68,z1],1.7,0.2,'#8a9686');
      for(const dx of[-0.82,0.82])this.beam(this.staticRoot,[x+dx,0.42,z0],[x+dx,8.42,z1],0.12,0.55,'#869487');
    }
    this.escalator=new EscalatorModel(this.level.transports.find(t=>t.kind==='escalator')!,this.staticRoot,this.dynamic);
    // A raised 6.3-unit hall leaves room for a shorter indoor follow camera.
    this.beam(this.staticRoot,[2,6.3,z0],[2,14.3,z1],8.4,0.24,'#ded4bc');
    this.colliders.push(beamCollider('escalator-roof',[2,6.3,z0],[2,14.3,z1],8.4,0.24));
    for(const x of[-2,6]){
      this.colliders.push(beamCollider('escalator-wall-'+x,[x,2.8,z0],[x,10.8,z1],0.3,5.8));
      this.registerSolid({id:'escalator-side-'+x,min:[x-0.15,-0.1,z1],max:[x+0.15,13.7,z0]});
    }
    for(let i=0;i<8;i++){const t=i/7;this.box(this.staticRoot,[2,6+8*t,z0+(z1-z0)*t],[7.3,0.07,0.13],'#fcf0c7');}
    for(const[z,y,label]of[[8,0,'皇冠大扶梯'],[-10,8,'皇冠大扶梯 · 两路口']] as [number,number,string][]){
      this.box(this.staticRoot,[2,y+5.6,z],[8.7,0.7,0.65],'#b29c69');
      for(const x of[-2,6])this.box(this.staticRoot,[x,y+2.65,z],[0.3,5.6,0.65],'#c3b696');
      this.sign([2,y+5.6,z+0.37],label,7,0.65,'#786e50');
    }
    // Small street blocks frame three stair flights without filling the walkable routes.
    for(const[x,y,z,w,d,h]of[[-18,0,2,3,3,5],[-20,3,-5,4,3,5],[-31,0,0,3,7,10]] as number[][])
      this.building([x,y,z],w,d,h,'#cbbca1');
    this.sign([-14,1.6,5.6],'梯道 ↑ 中层街巷',4.6,0.55);
    this.sign([-15,4.5,-2.6],'近路 ↑  /  观景 →',5.4,0.55);
    this.sign([-23,4.6,0.6],'折返梯道 · 歇脚处 ↑',4.8,0.5);
    this.sign([-6,4.4,-2.8],'侧望平台 · 可选行记',4.6,0.5);
    for(const[x,z]of[[-19,13],[11,12],[-27,10]])this.tree(x,0,z,1);
  }
  private cableway():void {
    for(const x of [-11,-7,25,29])this.building([x,2,-8.5],3.2,4,8+(x%3+3),'#c7bda2');
    for(const x of [-12,-7,25])this.tree(x,2,10,1.05);
    for(const x of [1,16]){
      this.box(this.staticRoot,[x,9.6,5],[6.2,0.4,6.9],'#b6b797');
      this.registerSolid({id:'cable-roof-'+x,min:[x-3.1,9.4,1.55],max:[x+3.1,9.8,8.45]});
      for(const dx of [-2.8,2.8])for(const dz of[-3,3]){
        this.box(this.staticRoot,[x+dx,7.7,5+dz],[0.28,4.2,0.3],'#b8b49a');
        this.registerSolid({id:'cable-column-'+x+':'+dx+':'+dz,min:[x+dx-0.14,5.6,5+dz-0.15],max:[x+dx+0.14,9.8,5+dz+0.15]});
      }
      this.box(this.staticRoot,[x,6.5,8.6],[3.8,0.7,0.3],'#d2ba8f');
      this.registerSolid({id:'cable-edge-'+x,min:[x-1.9,6.15,8.45],max:[x+1.9,6.85,8.75]});
      this.box(this.staticRoot,[x,10,3.7],[3.3,0.4,0.8],'#95a79c');
      for(const dx of [-2.8,2.8])this.box(this.staticRoot,[x+dx,9.4,1.8],[0.28,1.6,0.45],'#8fa095');
    }
    const cable=this.level.transports.find(t=>t.kind==='cableway')!;
    for(const dz of[-0.3,0.3])for(let i=0;i<cable.path.length-1;i++){
      const a=cable.path[i],b=cable.path[i+1];
      this.beam(this.staticRoot,[a[0],a[1]+2.37,a[2]+dz],[b[0],b[1]+2.37,b[2]+dz],0.045,0.045,C.dark);
    }
    this.sign([1,8.35,7.68],'长江索道',3.8,0.65,'#9f5a3c');
    this.sign([16,8.35,7.68],'长江索道 · 南岸',3.8,0.65,'#9f5a3c');
  }
  private train():THREE.Group {
    const g=new THREE.Group();
    for(let i=0;i<3;i++){
      const x=(i-1)*2.6;this.box(g,[x,0.5,0],[2.5,1,1.05],'#ebe6ce');this.box(g,[x,0.12,0],[2.5,0.22,1.1],'#4b9b70');this.box(g,[x,1.04,0],[2.45,0.12,1.04],C.teal);
      for(const z of [-0.54,0.54])for(const dx of [-0.75,0,0.75])this.box(g,[x+dx,0.68,z],[0.5,0.45,0.03],'#557971');
    }this.dynamic.add(g);return g;
  }
  private interchange():void {
    const compiled=compileRoads(this.level.network!);
    const verge=['#c4a35b','#65a58d','#8aa5c2','#b5a0be','#e0b573'];
    for(const{road,points,left,right}of compiled.roads){
      let marks=0;
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],d=Math.hypot(b[0]-a[0],b[2]-a[2]);
        for(const edge of[left,right]){
          const p=edge[i-1],q=edge[i];
          const x=(p[0]+q[0])/2,z=(p[2]+q[2])/2,y=(p[1]+q[1])/2;
          if(surfacesNear(this.level,x,z).some(s=>s.roadId!==road.id&&contains(s,x,z)&&Math.abs(heightAt(s,x,z)-y)<0.06))continue;
          this.beam(this.staticRoot,[p[0],p[1]+0.13,p[2]],[q[0],q[1]+0.13,q[2]],0.18,0.28,'#d4cbb7');
          this.beam(this.staticRoot,[p[0],p[1]+0.285,p[2]],[q[0],q[1]+0.285,q[2]],0.19,0.025,verge[road.tier-1]);
        }
        if(Math.floor(marks/2.5)%2===0)this.beam(this.staticRoot,[a[0],a[1]+0.018,a[2]],[b[0],b[1]+0.018,b[2]],0.065,0.018,'#e2dfca');
        marks+=d;
      }
    }
    for(const solid of structuralSolids(this.level).filter(s=>s.id.startsWith('pier-'))){
      const center=solid.min.map((v,i)=>(v+solid.max[i])/2) as Vec3,size=solid.min.map((v,i)=>solid.max[i]-v) as Vec3;
      this.box(this.staticRoot,center,size,'#adb6a8');
      this.box(this.staticRoot,[center[0],solid.max[1]-0.1,center[2]],[1.7,0.3,1.25],'#b9bdab');
    }
    for(const n of this.level.network!.nodes.filter(n=>['a','e','h','k','n'].includes(n.id))){
      const[x,y,z]=n.position;
      this.sign([x,y+2.3,z-2.1],'第 '+n.tier+' 层 · '+(n.tier<5?'寻找上行匝道':'赴约点 ↗'),4.3,0.6,'#3c635d');
      this.pole(this.staticRoot,[x+1.9,y,z-2.1],2.6,0.07,'#52716b');
    }
    this.sign([-21,2.3,9.9],'黄桷湾立交 · 五层道路探索',6.7,0.7,'#3c635d');
  }
  private buildActor():void {
    this.actor.add(this.walker);
    const textureCanvas=document.createElement('canvas');textureCanvas.width=64;textureCanvas.height=64;
    const ctx=textureCanvas.getContext('2d')!,gradient=ctx.createRadialGradient(32,32,3,32,32,32);
    gradient.addColorStop(0,'rgba(30,49,42,.36)');gradient.addColorStop(1,'rgba(30,49,42,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
    const shadowTexture=new THREE.CanvasTexture(textureCanvas);
    this.contactShadow=new THREE.Mesh(new THREE.PlaneGeometry(1.2,0.9),new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
    this.contactShadow.rotation.x=-Math.PI/2;this.dynamic.add(this.contactShadow);
    const arrow=new THREE.Mesh(new THREE.ConeGeometry(0.12,0.27,3),new THREE.MeshBasicMaterial({color:C.coral,depthTest:false}));
    arrow.position.y=2;arrow.rotation.z=Math.PI;arrow.renderOrder=99;this.actor.add(arrow);this.dynamic.add(this.actor);
  }
  private buildPassengerVehicles():void {
    for(const kind of ['cableway']){
      if(!this.level.transports.some(t=>t.kind===kind))continue;
      const g=new THREE.Group(),rail=kind==='rail';
      this.box(g,[0,0.8,0],[rail?1.45:2,1.6,rail?3.4:1.5],rail?'#e6e2ce':'#c75c3e');
      if(rail)this.box(g,[0,0.23,0],[1.48,0.3,3.45],'#4b9b70');
      for(const x of [-1,1])this.box(g,[x*(rail?0.74:1.02),1.08,0],[0.03,0.55,rail?2.7:1.25],'#86afa2');
      for(const z of [-1,1])this.box(g,[0,1.08,z*(rail?1.71:0.77)],[rail?1.2:1.8,0.55,0.03],'#86afa2');
      this.box(g,[0,1.68,0],[rail?1.55:2.15,0.13,rail?3.5:1.65],C.dark);
      if(!rail)this.box(g,[0,2.03,0],[0.08,0.65,0.08],C.dark);
      g.visible=false;this.dynamic.add(g);this.passengerVehicles.set(kind,g);
    }
  }
  private batch():void {
    this.staticRoot.updateMatrixWorld(true);
    const groups=new Map<string,THREE.Mesh[]>();
    this.staticRoot.traverse(o=>{
      if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshStandardMaterial){
        const bounds=new THREE.Box3().setFromObject(o),minY=bounds.min.y,center=bounds.getCenter(new THREE.Vector3());
        const key=Math.floor(minY/5)+':'+Math.floor(center.x/12)+':'+Math.floor(center.z/12);
        if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(o);
      }
    });
    for(const group of groups.values()){
      const geos=group.map(m=>{const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.deleteAttribute('uv');g.applyMatrix4(m.matrixWorld);
        const color=(m.material as THREE.MeshStandardMaterial).color,colors=new Float32Array(g.getAttribute('position').count*3);
        for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
        g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;});
      const combined=mergeGeometries(geos,false);geos.forEach(g=>g.dispose());if(!combined)continue;
      const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.88,flatShading:true});
      const mesh=new THREE.Mesh(combined,material);combined.computeBoundingBox();
      mesh.castShadow=true;mesh.receiveShadow=true;
      this.fadeMeshes.push({mesh,minY:combined.boundingBox!.min.y,material});
      group.forEach(m=>{m.removeFromParent();m.geometry.dispose();});this.staticRoot.add(mesh);
    }
  }
  update(state:RunState,reducedMotion:boolean):boolean {
    this.state=state;this.reducedMotion=reducedMotion;
    // Record boarding immediately, including a skip before the next animation frame.
    this.lift?.update(state,0,reducedMotion);
    const t=state.ride?this.level.transports.find(t=>t.id===state.ride!.serviceId):undefined;
    const key=t&&(t.kind==='rail'||t.kind==='cableway')?state.generation+':'+state.ride!.id:undefined;
    if(key===this.rideCamera?.key)return false;
    if(this.rideCamera){
      const prior=this.rideCamera;
      this.yaw=prior.saved.yaw;this.baseYaw=prior.saved.baseYaw;this.orbitOffset=prior.saved.offset;
      this.pitch=prior.saved.pitch;this.zoom=prior.saved.zoom;this.manualOrbit=prior.saved.manual;
      this.overview=false;this.rideCamera=undefined;this.rideVehiclePosition=undefined;
      this.cameraTransition=reducedMotion?0:0.75;this.pointerEnd();
      if(state.generation!==prior.generation){this.cameraReady=false;this.manualOrbit=false;this.recenter();}
    }
    if(key&&t){
      this.rideCamera={key,transport:t,generation:state.generation,saved:{yaw:this.yaw,baseYaw:this.baseYaw,offset:this.orbitOffset,pitch:this.pitch,zoom:this.zoom,manual:this.manualOrbit}};
      this.pointerEnd();this.cameraTransition=reducedMotion?0:0.75;
    }
    return true;
  }
  private animate(dt:number):void {
    const s=this.state;if(!s)return;
    this.updateCamera(dt);
    const cutaway=this.forceCutaway;
    for(const entry of this.fadeMeshes){
      const fade=(cutaway&&entry.minY>s.position[1]+0.9)||this.blocking.has(entry.mesh);
      if(entry.material.transparent!==fade){
        entry.material.transparent=fade;entry.material.opacity=fade?0.24:1;entry.material.depthWrite=!fade;entry.material.needsUpdate=true;
      }
    }
    this.renderer.domElement.dataset.cutaway=String(cutaway);
    this.renderer.domElement.dataset.camera=this.viewMode;
    this.renderer.domElement.dataset.cameraYaw=this.movementYaw.toFixed(4);
    this.actor.position.set(...s.position);this.actor.rotation.y=s.facing;
    const transport=s.ride?this.level.transports.find(t=>t.id===s.ride!.serviceId):undefined;
    this.lift?.update(s,dt,this.reducedMotion);this.escalator?.update(s,dt,this.reducedMotion);
    if(transport?.kind==='escalator')this.actor.rotation.y=s.ride!.direction?0:Math.PI;
    this.actor.visible=!transport||!this.passengerVehicles.has(transport.kind);
    for(const[kind,vehicle]of this.passengerVehicles){
      const service=this.level.transports.find(t=>t.kind===kind)!;
      const active=transport?.kind===kind&&s.ride;
      const path=active?(s.ride!.direction?[...service.path].reverse():service.path):this.parkedVehiclePaths.get(kind)??service.path;
      const progress=active?s.ride!.elapsed/s.ride!.duration:this.parkedVehiclePaths.has(kind)?1:0;
      if(active)this.parkedVehiclePaths.set(kind,path);
      const p=active?s.position:samplePath(path,progress),ahead=samplePath(path,Math.min(1,progress+0.01)),behind=samplePath(path,Math.max(0,progress-0.01));
      vehicle.visible=true;vehicle.position.set(...p);
      vehicle.rotation.y=kind==='rail'?Math.atan2(ahead[0]-behind[0],ahead[2]-behind[2])-Math.PI/2:0;
      if(active)this.rideVehiclePosition=[...p];
    }
    this.walker.update(s,dt,this.reducedMotion);
    if(this.contactShadow){
      const surface=this.level.surfaces.find(surface=>surface.id===s.surfaceId),gradient=surface?.gradient??[0,0];
      this.contactShadow.visible=s.phase!=='riding';this.contactShadow.position.set(s.position[0],s.position[1]+0.035,s.position[2]);
      this.contactShadow.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(-gradient[0],1,-gradient[1]).normalize());
    }
    this.environment.update(this.camera,s.paused?0:dt,this.reducedMotion);
    this.updateSigns();
    if(!this.lowQuality&&(this.shadowAnchor.distanceTo(this.actor.position)>6||!Number.isFinite(this.shadowAnchor.x))){
      this.shadowAnchor.copy(this.actor.position);this.sun.target.position.copy(this.shadowAnchor);
      this.sun.position.copy(this.shadowAnchor).add(new THREE.Vector3(-24,38,20));this.sun.shadow.needsUpdate=true;
    }
    for(const[id,g]of this.discs){const rest=this.level.checkpoints.some(cp=>cp.id===id);g.visible=!s.discoveries.includes(id);const used=rest&&s.consumedRests.includes(id);g.scale.setScalar(used?0.65:1);if(!this.reducedMotion&&g.children[1])g.children[1].position.y=(rest?1.45:0.8)+Math.sin(this.elapsed*2)*0.1;}
    for(const v of this.vehicles){
      const t=this.reducedMotion?0.4:(this.elapsed/v.duration+v.offset)%1,p=samplePath(v.path,t),q=samplePath(v.path,Math.min(1,t+0.005));
      v.object.position.set(...p);v.object.rotation.y=Math.atan2(q[0]-p[0],q[2]-p[2])+v.rotation;
    }
    this.renderer.domElement.dataset.drawCalls=String(this.renderer.info.render.calls);this.renderer.domElement.dataset.triangles=String(this.renderer.info.render.triangles);
  }
  private updateSigns():void {
    const candidates:{label:HTMLSpanElement;x:number;y:number;distance:number;position:Vec3}[]=[];
    for(const {object,label}of this.signs){
      label.hidden=true;const p=object.position,distance=p.distanceTo(this.camera.position);
      if(distance>34)continue;
      const projected=this.project(p.toArray() as Vec3,.25),a=this.project([p.x-object.userData.width/2,p.y,p.z]),b=this.project([p.x+object.userData.width/2,p.y,p.z]);
      const projectedWidth=Math.hypot(a.x-b.x,a.y-b.y),angle=Math.abs((this.camera.position.z-p.z)/Math.max(.01,distance));
      const top=this.project([p.x,p.y+object.userData.height/2,p.z]),bottom=this.project([p.x,p.y-object.userData.height/2,p.z]);
      const projectedHeight=Math.hypot(top.x-bottom.x,top.y-bottom.y);
      if(!projected.visible||projected.y<85||projected.y>this.height-140||projected.x<90||projected.x>this.width-90)continue;
      if(projectedHeight<22||projectedWidth<object.userData.text.length*12||angle<.55)candidates.push({label,x:projected.x,y:projected.y,distance,position:p.toArray() as Vec3});
    }
    const occupied:{x:number;y:number}[]=[];
    for(const item of candidates.sort((a,b)=>a.distance-b.distance)){
      if(occupied.length>=2)break;
      if(occupied.some(p=>Math.abs(p.x-item.x)<180&&Math.abs(p.y-item.y)<35))continue;
      if(sweepCamera(this.camera.position.toArray() as Vec3,item.position,this.colliders,0).fraction<.96)continue;
      item.label.hidden=false;item.label.style.left=item.x+'px';item.label.style.top=item.y+'px';occupied.push(item);
    }
  }
  signInfo(){return this.signs.map(({object})=>({...object.userData}));}
  private localYaw():number {
    const state=this.state;if(!state)return this.defaultYaw();
    if(this.level.id==='yangtze-cableway'&&state.surfaceId==='south-steps')return 0;
    if(this.level.id==='crown-escalator'&&state.surfaceId==='lianglukou')return Math.PI;
    if(!this.level.network)return this.defaultYaw();
    const surface=this.level.surfaces.find(s=>s.id===state.surfaceId),id=surface?.roadId;
    const roads=compileRoads(this.level.network).roads;
    const road=roads.find(r=>r.road.id===id);if(!road)return this.baseYaw;
    let nearest=0,distance=Infinity;
    road.points.forEach((p,i)=>{const d=Math.hypot(p[0]-state.position[0],p[2]-state.position[2]);if(d<distance){nearest=i;distance=d;}});
    const a=road.points[Math.max(0,nearest-1)],b=road.points[Math.min(road.points.length-1,nearest+1)];
    let angle=Math.atan2(-(b[0]-a[0]),-(b[2]-a[2]));
    const wrap=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));
    if(Math.abs(wrap(angle+Math.PI-this.baseYaw))<Math.abs(wrap(angle-this.baseYaw)))angle+=Math.PI;
    return this.baseYaw+wrap(angle-this.baseYaw);
  }
  private updateCamera(dt:number):void {
    const s=this.state;if(!s)return;
    if(s.paused)this.pointerEnd();
    if(s.generation!==this.cameraGeneration){this.cameraGeneration=s.generation;this.cameraReady=false;this.parkedVehiclePaths.clear();}
    // Regional framing changes only while the player is standing, keeping held movement axes stable.
    if(!s.moving&&!s.paused&&!this.drag&&!this.overview&&!this.rideCamera&&!this.manualOrbit){
      const next=this.localYaw(),step=this.reducedMotion?1:1-Math.exp(-3*Math.max(0,dt));
      this.baseYaw+=wrapAngle(next-this.baseYaw)*step;
    }
    this.yaw=this.baseYaw+this.orbitOffset;
    let target=this.overview?new THREE.Vector3(...this.level.center).add(new THREE.Vector3(0,1,0)):new THREE.Vector3(...s.position).add(new THREE.Vector3(0,1.22,0));
    let desired:THREE.Vector3;
    this.cameraObstructed=false;
    if(this.rideCamera){
      const t=this.rideCamera.transport;
      const view=t.rideView??{center:this.level.center,distance:35,yaw:-0.2,pitch:0.62};
      target=new THREE.Vector3(...view.center);
      const distance=Math.max(view.distance,view.distance*0.9/(this.width/this.height));
      desired=target.clone().add(new THREE.Vector3(Math.sin(view.yaw)*Math.cos(view.pitch),Math.sin(view.pitch),Math.cos(view.yaw)*Math.cos(view.pitch)).multiplyScalar(distance));
    }else if(this.overview){
      const range=Math.max(this.level.viewSize*1.05,(this.level.network?98:this.level.id==='yangtze-cableway'?55:42)/(this.width/this.height))/this.zoom;
      desired=target.clone().add(new THREE.Vector3(0.56,0.76,0.56).multiplyScalar(range));
      if(this.cameraReady&&!this.reducedMotion)desired.lerpVectors(this.camera.position,desired,1-Math.exp(-10*Math.max(0,dt)));
    }else{
      const range=this.followDistance(s.position)/this.zoom;
      const framing=followOrbit(s.position,this.yaw,this.pitch,range,this.colliders);target.set(...framing.target);
      const offset=new THREE.Vector3(...framing.desired).sub(target);
      const result=resolveFollowCamera(framing.target,framing.desired,this.colliders);
      this.cameraObstructed=result.fraction<1||!!result.occluded;
      desired=new THREE.Vector3(...result.position);
      if(this.cameraReady&&!this.reducedMotion&&this.camera.position.distanceTo(target)<25){
        const blend=1-Math.exp(-12*Math.max(0,dt)),smooth=this.camera.position.clone().lerp(desired,blend);
        const direction=smooth.clone().sub(target),distance=direction.length();
        const pitch=THREE.MathUtils.clamp(Math.asin(direction.y/Math.max(0.01,distance)),CAMERA_PITCH_MIN,CAMERA_PITCH_MAX);
        const yaw=Math.atan2(direction.x,direction.z);
        const candidate=target.clone().add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(distance));
        const direct=resolveFollowCamera(target.toArray() as Vec3,candidate.toArray() as Vec3,this.colliders);
        const travel=sweepCamera(this.camera.position.toArray() as Vec3,direct.position,this.colliders);
        // Never interpolate through a wall. A corrected safe position takes precedence over smoothing.
        desired=travel.fraction===1?new THREE.Vector3(...direct.position):desired;
      }
      if(this.colliders.some(c=>sphereInside(desired.toArray() as Vec3,c))){
        const close=sweepCamera(target.toArray() as Vec3,target.clone().add(offset.clone().multiplyScalar(0.45)).toArray() as Vec3,this.colliders);
        desired.set(...close.position);
      }
    }
    if(this.cameraTransition>0&&this.cameraReady&&!this.reducedMotion){
      const blend=1-Math.exp(-7*Math.max(0,dt)),candidate=this.camera.position.clone().lerp(desired,blend);
      const travel=sweepCamera(this.camera.position.toArray() as Vec3,candidate.toArray() as Vec3,this.colliders);
      if(travel.fraction===1&&!this.colliders.some(c=>sphereInside(candidate.toArray() as Vec3,c))){
        desired=candidate;target=this.cameraTarget.clone().lerp(target,blend);
      }
      this.cameraTransition=Math.max(0,this.cameraTransition-dt);
    }else if(this.reducedMotion)this.cameraTransition=0;
    this.cameraTarget.copy(target);this.camera.position.copy(desired);
    this.camera.lookAt(this.cameraTarget);this.camera.updateMatrixWorld();this.cameraReady=true;this.blocking.clear();
    // Local fading is reserved for a visible obstruction to the body, not whole height layers.
    if(!this.overview&&!this.rideCamera)for(const height of[0.2,0.8,1.35]){
      const body=new THREE.Vector3(...s.position).add(new THREE.Vector3(0,height,0)),line=body.sub(this.camera.position);
      this.raycaster.set(this.camera.position,line.clone().normalize());this.raycaster.far=Math.max(0,line.length()-0.15);
      for(const hit of this.raycaster.intersectObjects(this.staticRoot.children,true))this.blocking.add(hit.object);
    }
    this.renderer.domElement.dataset.cameraBlocked=String(this.cameraObstructed);
  }
  private followDistance(p:Vec3):number {
    return this.level.id==='crown-escalator'&&p[0]>-2.5&&p[0]<6.5&&p[2]>-10.5&&p[2]<8.5?7.8:10.8;
  }
  auditCamera():{samples:number;minimumDistance:number;failures:{position:Vec3;yaw:number;pitch:number;distance:number;inside:string[]}[]} {
    const points:Vec3[]=this.level.network?compileRoads(this.level.network).roads.flatMap(r=>r.points):this.level.surfaces.flatMap(s=>{
      const[x0,x1,z0,z1]=s.bounds;return[[x0+0.65,z0+0.65],[(x0+x1)/2,(z0+z1)/2],[x1-0.65,z1-0.65]].map(([x,z])=>[x,heightAt(s,x,z),z] as Vec3);
    });
    const failures:{position:Vec3;yaw:number;pitch:number;distance:number;inside:string[]}[]=[],angles=Array.from({length:12},(_,i)=>i*30);let minimumDistance=Infinity,samples=0;
    for(const p of points){
      if(bodyBlocked(this.level,p))continue;
      const prepared=this.level.network?compileRoads(this.level.network).roads.find(r=>r.points.includes(p)):undefined;
      const index=prepared?.points.indexOf(p)??0,a=prepared?.points[Math.max(0,index-1)],b=prepared?.points[Math.min(prepared.points.length-1,index+1)];
      const onSouthSteps=this.level.id==='yangtze-cableway'&&this.level.surfaces.some(s=>s.id==='south-steps'&&p[0]>=s.bounds[0]&&p[0]<=s.bounds[1]&&p[2]>=s.bounds[2]&&p[2]<=s.bounds[3]);
      const onCrownUpper=this.level.id==='crown-escalator'&&p[1]===8;
      const base=a&&b?Math.atan2(-(b[0]-a[0]),-(b[2]-a[2])):onSouthSteps?0:onCrownUpper?Math.PI:this.defaultYaw();
      for(const direction of[base])for(const angle of angles)for(const degrees of[-12,0,15,35,55,68]){
        const yaw=direction+angle*Math.PI/180,pitch=degrees*Math.PI/180;
        const{target,desired}=followOrbit(p,yaw,pitch,this.followDistance(p),this.colliders);
        const result=resolveFollowCamera(target,desired,this.colliders),inside=this.colliders.filter(c=>sphereInside(result.position,c)).map(c=>c.id),distance=Math.hypot(...result.position.map((v,i)=>v-target[i]));
        samples++;minimumDistance=Math.min(minimumDistance,distance);
        if(inside.length||distance<1.1)failures.push({position:p,yaw,pitch,distance,inside:inside.length?inside:['close-to:'+result.obstacle]});
      }
    }
    return{samples,minimumDistance,failures};
  }
  project(p:Vec3,height=0):{x:number;y:number;visible:boolean;dx:number;dy:number} {
    const world=new THREE.Vector3(p[0],p[1]+height,p[2]);
    const local=world.clone().applyMatrix4(this.camera.matrixWorldInverse),v=world.project(this.camera);
    const visible=local.z<0&&v.z>=-1&&v.z<=1&&Math.abs(v.x)<0.94&&Math.abs(v.y)<0.94;
    const flip=local.z<0?1:-1;
    return{x:(v.x+1)*this.width/2,y:(1-v.y)*this.height/2,visible,dx:v.x*flip,dy:-v.y*flip};
  }
  setZoom(factor:number):void {if(this.rideCamera)return;this.zoom=Math.max(0.75,Math.min(1.55,factor));this.cameraReady=false;}
  setCutaway(value:boolean):void {this.forceCutaway=value;}
  setQuality(low:boolean):void {
    this.lowQuality=low;this.renderer.shadowMap.enabled=!low;this.sun.shadow.needsUpdate=!low;
    this.environment.setQuality(low);this.renderer.setPixelRatio(Math.min(devicePixelRatio,low?1:matchMedia('(any-pointer:coarse)').matches?1.25:1.6));this.resize();
  }
  private resize():void {
    this.width=Math.max(1,this.host.clientWidth);this.height=Math.max(1,this.host.clientHeight);this.renderer.setSize(this.width,this.height);
    this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();this.cameraReady=false;
  }
  dispose():void {
    this.pointerEnd();
    const canvas=this.renderer.domElement;
    canvas.removeEventListener('pointerdown',this.pointerDown);canvas.removeEventListener('pointermove',this.pointerMove);
    canvas.removeEventListener('pointerup',this.pointerEnd);canvas.removeEventListener('pointercancel',this.pointerEnd);canvas.removeEventListener('lostpointercapture',this.pointerEnd);
    this.disposed=true;cancelAnimationFrame(this.animation);this.observer.disconnect();
    const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    this.scene.traverse(o=>{if(o instanceof THREE.Mesh){geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){mats.add(m);if(m.map)textures.add(m.map);}if(o instanceof THREE.InstancedMesh)o.dispose();}});
    this.materials.forEach(m=>mats.add(m));this.materials.clear();this.sun.shadow.dispose();
    geos.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());mats.forEach(m=>m.dispose());this.renderer.dispose();this.renderer.domElement.remove();this.signLayer.remove();this.scene.clear();
  }
}
