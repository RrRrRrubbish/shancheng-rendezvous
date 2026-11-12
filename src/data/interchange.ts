import { CULTURAL_SOURCES } from './sources';
import type { Level, Road, RoadNode, Vec3 } from '../domain/types';
import { compileRoads } from '../movement/roads';

const node=(id:string,name:string,position:Vec3,tier:number):RoadNode=>({id,name,position,tier});
const nodes:RoadNode[]=[
  node('start','一层西侧出发点',[-22,0,8],1),node('a','一层分流口',[-8,0,8],1),node('c','一层东端',[22,0,8],1),
  node('d','二层南端',[12,5,22],2),node('e','二层接驳口',[12,5,0],2),node('f','二层北端',[12,5,-22],2),
  node('q','二层内匝道口',[4,5,0],2),node('v','二层观景支路',[23,5,2],2),
  node('g','三层东端',[22,10,-8],3),node('h','三层分合流口',[0,10,-8],3),node('i','三层西端',[-22,10,-8],3),
  node('j','四层北端',[-12,15,-22],4),node('k','四层分流口',[-12,15,0],4),node('l','四层南端',[-12,15,22],4),
  node('m','五层西端',[-22,20,20],5),node('n','五层汇入口',[0,20,0],5),node('goal','五层赴约点',[22,20,-20],5),
  node('lookout','五层观景支路',[12,20,10],5),
];
const roads:Road[]=[];
function road(id:string,name:string,from:string,to:string,kind:Road['kind']='main',controls:Vec3[]=[]):void {
  const a=nodes.find(n=>n.id===from)!,b=nodes.find(n=>n.id===to)!;
  roads.push({id,name,from,to,kind,tier:a.tier,width:kind==='main'?4.6:3.8,path:[a.position,...controls,b.position]});
}
road('one-west','一层东西主线','start','a');road('one-east','一层东西主线','a','c');
road('outer-12','东南回转匝道','c','d','ramp',[[31,1,10],[32,2.5,20],[25,4,29],[16,5,29]]);
road('two-south','二层南北主线','d','e');road('two-north','二层南北主线','e','f');
road('outer-23','东北回转匝道','f','g','ramp',[[13,6,-32],[24,7.5,-32],[33,9,-23],[32,10,-12]]);
road('three-east','三层东西主线','g','h');road('three-west','三层东西主线','h','i');
road('outer-34','西北回转匝道','i','j','ramp',[[-32,11,-11],[-33,12.5,-24],[-24,14,-33],[-15,15,-32]]);
road('four-north','四层南北主线','j','k');road('four-south','四层南北主线','k','l');
road('outer-45','西南回转匝道','l','m','ramp',[[-13,16,32],[-24,17.5,35],[-35,19,28],[-33,20,21]]);
road('five-west','五层斜向主线','m','n');road('five-east','五层斜向主线','n','goal');
road('inner-12','内侧上行匝道 · 一至二层','a','q','ramp',[[-7,1,2],[-2,3,1]]);
road('two-link','二层横向接驳','q','e');
road('inner-23','内侧上行匝道 · 二至三层','q','h','ramp',[[6,5,-3],[8,7,-16],[0,9,-18],[0,10,-14]]);
road('inner-34','内侧上行匝道 · 三至四层','h','k','ramp',[[0,11,-1],[-4,13,3],[-8,15,0]]);
road('inner-45','内侧上行匝道 · 四至五层','k','n','ramp',[[-20,15,0],[-23,16,-12],[-12,18,-21],[-3,19,-15],[-3,20,-6]]);
road('view-two','二层观景支路','e','v','scenic',[[18,5,0]]);
road('view-five','五层观景支路','n','lookout','scenic',[[7,20,4]]);

const network={nodes,roads};
const compiled=compileRoads(network);
const place=(id:string)=>({surface:'junction-'+id,position:[...nodes.find(n=>n.id===id)!.position] as Vec3});
const source=CULTURAL_SOURCES.huangjuewan.url;
export const INTERCHANGE:Level={
  id:'huangjuewan',number:4,name:'黄桷湾立交',subtitle:'五层道路，读懂每一次分流',
  intro:'朋友在第五层东侧等你。直接沿主线与匝道行走：内侧短匝道上坡集中，外侧回转路线较长、沿途可歇脚。交叉不等于连通，先认路口与层数，再决定转向。金色观景支路可选。',
  goalName:'五层东侧赴约点',start:place('start'),goal:place('goal'),center:[0,8,0],viewSize:88,accent:'#71849b',
  network,surfaces:compiled.surfaces,transports:[],staminaScale:0.18,
  discoveries:[
    {id:'interchange-west',title:'交叉不等于连通',...place('v'),text:'黄桷湾立交以五层、二十余条匝道的立体交通形态被介绍。在这里，平面上重叠的道路仍属于不同高度，只有真正相接的匝道才能把你带到另一层。',source,mediaId:'huangjuewan'},
    {id:'interchange-east',title:'读懂分流与合流',...place('g'),text:'回转匝道将方向与高度一起改变。游戏保留宽主线、弯匝道与分合流的道路特征，让角色直接在简化后的路面上探索。',source,mediaId:'huangjuewan'},
    {id:'interchange-five',title:'从第五层回望山城',...place('lookout'),text:'从高处回望，层叠的道路不再只是复杂的线条，而是一组各有来处与去向的连接。本关为游戏化步行改编，不代表现实立交允许行人进入。',source,mediaId:'huangjuewan'},
  ],
  checkpoints:[
    {id:'interchange-two',name:'二层南端歇脚点',...place('d'),benchOffset:[1.5,0]},
    {id:'interchange-east-rest',name:'三层东端歇脚点',...place('g'),benchOffset:[0,-1.5]},
    {id:'interchange-four',name:'四层北端歇脚点',...place('j'),benchOffset:[-1.5,0]},
    {id:'interchange-four-inner',name:'四层分流口歇脚点',...place('k'),benchOffset:[1.5,-1.5]},
    {id:'interchange-five-rest',name:'五层西端歇脚点',...place('m'),benchOffset:[1.2,1.2]},
  ],
  source,sourceLabel:'华龙网 · 桥都报道',
  geography:'以黄桷湾立交为原型的游戏化步行改编，不作为现实导航。五层主线与匝道均可行走；形态、比例、坡度和连接为玩法简化，角色直接行走在改编后的机动车道路面上。',
};
