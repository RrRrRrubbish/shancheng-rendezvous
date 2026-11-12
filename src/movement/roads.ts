import type { Point, Road, RoadNetwork, Surface, Vec3 } from '../domain/types';

export const DECK_THICKNESS = 0.48;
const JOIN_LENGTH = 3.2;
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => a.map((v, i) => v + (b[i] - v) * t) as Vec3;
const length = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[2] - a[2]);
export const cross = (a: Point, b: Point, c: Point) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function polygonArea(points: Point[]): number {
  return points.reduce((sum, p, i) => { const q=points[(i+1)%points.length]; return sum+p[0]*q[1]-q[0]*p[1]; },0)/2;
}
function hull(points: Point[]): Point[] {
  const sorted=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const half=(list:Point[])=>{const out:Point[]=[];for(const p of list){while(out.length>1&&cross(out.at(-2)!,out.at(-1)!,p)<=1e-7)out.pop();out.push(p);}return out;};
  return [...half(sorted).slice(0,-1),...half(sorted.reverse()).slice(0,-1)];
}
function intersects(a:Point[],b:Point[]):boolean {
  for(const polygon of[a,b])for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],nx=-(q[1]-p[1]),nz=q[0]-p[0];
    const pa=a.map(p=>p[0]*nx+p[1]*nz),pb=b.map(p=>p[0]*nx+p[1]*nz);
    if(Math.max(...pa)<Math.min(...pb)-1e-6||Math.max(...pb)<Math.min(...pa)-1e-6)return false;
  }
  return true;
}
function smooth(path: Vec3[]): Vec3[] {
  let points=path.map(p=>[...p] as Vec3);
  // Chaikin subdivision preserves the convex hull, so ramps cannot overshoot their controls.
  for(let iteration=0;iteration<3;iteration++){
    const next:Vec3[]=[points[0]];
    for(let i=1;i<points.length;i++)next.push(mix(points[i-1],points[i],0.25),mix(points[i-1],points[i],0.75));
    next.push(points.at(-1)!);points=next;
  }
  return points;
}
function trim(points:Vec3[],amount:number):Vec3[]{
  let remaining=amount;
  for(let i=1;i<points.length;i++){
    const d=length(points[i-1],points[i]);
    if(d>=remaining)return[mix(points[i-1],points[i],remaining/d),...points.slice(i)];
    remaining-=d;
  }
  throw new Error('道路短于路口接缝');
}
function triangle(id:string,vertices:Vec3[],road:Road,network:RoadNetwork):Surface {
  const [a,b,c]=vertices,dx1=b[0]-a[0],dz1=b[2]-a[2],dx2=c[0]-a[0],dz2=c[2]-a[2];
  const determinant=dx1*dz2-dx2*dz1;
  if(Math.abs(determinant)<1e-8)throw new Error('道路三角形退化 '+id);
  const gradient:Point=[((b[1]-a[1])*dz2-(c[1]-a[1])*dz1)/determinant,(dx1*(c[1]-a[1])-dx2*(b[1]-a[1]))/determinant];
  const polygon=vertices.map(p=>[p[0],p[2]] as Point);if(polygonArea(polygon)<0)polygon.reverse();
  const from=network.nodes.find(n=>n.id===road.from)!,to=network.nodes.find(n=>n.id===road.to)!;
  return {id,name:road.name,layer:from.tier===to.tier?`第 ${from.tier} 层 · ${road.kind==='main'?'主线':'支路'}`:`第 ${from.tier} → ${to.tier} 层 · 匝道`,
    bounds:[Math.min(...polygon.map(p=>p[0])),Math.max(...polygon.map(p=>p[0])),Math.min(...polygon.map(p=>p[1])),Math.max(...polygon.map(p=>p[1]))],
    origin:[...a],gradient,terrain:Math.hypot(...gradient)>0.01?'slope':'flat',neighbors:[],polygon,roadId:road.id,tier:road.tier,thickness:DECK_THICKNESS};
}
export interface PreparedRoad { road:Road; points:Vec3[]; left:Vec3[]; right:Vec3[]; surfaces:Surface[] }
export interface CompiledRoads { surfaces:Surface[]; roads:PreparedRoad[] }
const cache=new WeakMap<RoadNetwork,CompiledRoads>();
export function compileRoads(network:RoadNetwork):CompiledRoads {
  const cached=cache.get(network);if(cached)return cached;
  const surfaces:Surface[]=[],roads:PreparedRoad[]=[],ends=new Map<string,{edge:Vec3[];surfaces:Surface[]}[]>();
  const connect=(a:Surface,b:Surface)=>{if(!a.neighbors.includes(b.id))a.neighbors.push(b.id);if(!b.neighbors.includes(a.id))b.neighbors.push(a.id);};
  for(const road of network.roads){
    const raw=smooth(road.path);
    // Flat collars and a smooth elevation profile avoid cutting through the merging deck.
    const arc=[0];for(let i=1;i<raw.length;i++)arc.push(arc.at(-1)!+length(raw[i-1],raw[i]));
    const collar=JOIN_LENGTH+0.8,total=arc.at(-1)!;
    raw.forEach((p,i)=>{const t=Math.max(0,Math.min(1,(arc[i]-collar)/(total-collar*2)));p[1]=road.path[0][1]+(road.path.at(-1)![1]-road.path[0][1])*t*t*(3-2*t);});
    const points=trim(trim(raw,JOIN_LENGTH).reverse(),JOIN_LENGTH).reverse();
    const left:Vec3[]=[],right:Vec3[]=[];
    for(let i=0;i<points.length;i++){
      const normal=(a:Vec3,b:Vec3):Point=>{const d=length(a,b)||1;return[-(b[2]-a[2])/d,(b[0]-a[0])/d];};
      const before=normal(points[Math.max(0,i-1)],points[i===0?1:i]),after=normal(points[i],points[Math.min(points.length-1,i+1)]??points[i]);
      const n=i===0?before:i===points.length-1?before:after;
      let nx=n[0],nz=n[1],scale=road.width/2;
      if(i>0&&i<points.length-1){const d=Math.hypot(before[0]+after[0],before[1]+after[1]);nx=(before[0]+after[0])/d;nz=(before[1]+after[1])/d;scale/=Math.max(0.6,nx*after[0]+nz*after[1]);}
      left.push([points[i][0]+nx*scale,points[i][1],points[i][2]+nz*scale]);right.push([points[i][0]-nx*scale,points[i][1],points[i][2]-nz*scale]);
    }
    const pieces:Surface[]=[];
    for(let i=0;i<points.length-1;i++){
      const a=triangle(`${road.id}-${i}a`,[left[i],right[i],right[i+1]],road,network),b=triangle(`${road.id}-${i}b`,[left[i],right[i+1],left[i+1]],road,network);
      connect(a,b);for(const previous of pieces.slice(-2)){connect(previous,a);connect(previous,b);}pieces.push(a,b);
    }
    for(const [id,edge,part]of [[road.from,[left[0],right[0]],pieces.slice(0,2)],[road.to,[left.at(-1)!,right.at(-1)!],pieces.slice(-2)]] as const){
      if(!ends.has(id))ends.set(id,[]);ends.get(id)!.push({edge:[...edge],surfaces:[...part]});
    }
    surfaces.push(...pieces);roads.push({road,points,left,right,surfaces:pieces});
  }
  for(const node of network.nodes){
    const connections=ends.get(node.id);if(!connections)throw new Error('孤立路口 '+node.id);
    const polygon=hull(connections.flatMap(c=>c.edge.map(p=>[p[0],p[2]] as Point)).concat([
      [node.position[0]-1.3,node.position[2]-1.3],[node.position[0]+1.3,node.position[2]-1.3],
      [node.position[0]+1.3,node.position[2]+1.3],[node.position[0]-1.3,node.position[2]+1.3],
    ]));
    const junction:Surface={id:'junction-'+node.id,name:node.name,layer:`第 ${node.tier} 层 · 路口`,
      bounds:[Math.min(...polygon.map(p=>p[0])),Math.max(...polygon.map(p=>p[0])),Math.min(...polygon.map(p=>p[1])),Math.max(...polygon.map(p=>p[1]))],
      polygon,origin:[...node.position],gradient:[0,0],terrain:'flat',neighbors:[],tier:node.tier,thickness:DECK_THICKNESS};
    for(const c of connections)for(const s of c.surfaces)connect(junction,s);surfaces.push(junction);
    const incident=roads.filter(r=>r.road.from===node.id||r.road.to===node.id);
    const collars=incident.flatMap(r=>r.surfaces.filter(s=>s.polygon!.every(p=>Math.abs(s.origin[1]+(p[0]-s.origin[0])*s.gradient[0]+(p[1]-s.origin[2])*s.gradient[1]-node.position[1])<1e-5)));
    for(const s of collars)if(intersects(junction.polygon!,s.polygon!))connect(junction,s);
    // Coplanar merging collars form a single drivable/walkable junction, including overlap beyond its hull.
    for(let i=0;i<collars.length;i++)for(let j=i+1;j<collars.length;j++)if(collars[i].roadId!==collars[j].roadId&&intersects(collars[i].polygon!,collars[j].polygon!))connect(collars[i],collars[j]);
  }
  const result={surfaces,roads};cache.set(network,result);return result;
}
