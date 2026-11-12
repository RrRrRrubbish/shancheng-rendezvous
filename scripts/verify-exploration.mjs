import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

await mkdir('artifacts/v0.6',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
  await page.goto('http://127.0.0.1:5173/?test=1');await page.waitForFunction(()=>window.__journey);
  await page.evaluate(()=>{window.__journey.unlockAll();return window.__journey.load('huangjuewan');});
  await page.getByRole('button',{name:/出发，慢慢走/}).click();
  const route=['one-west','inner-12','inner-23','inner-34','inner-45','five-east'];
  let held=new Set(),samples=0,minimumCameraDistance=Infinity,minimumStamina=100;
  const cameraFailures=[],nodes=[];
  const setKeys=async codes=>{
    const next=new Set(codes);
    for(const code of held)if(!next.has(code))await page.keyboard.up(code);
    for(const code of next)if(!held.has(code))await page.keyboard.down(code);
    held=next;
  };
  const walk=async point=>{
    const deadline=Date.now()+18000;let best=Infinity,lastProgress=Date.now();
    while(Date.now()<deadline){
      const {state:s,camera:c}=await page.evaluate(()=>({state:window.__journey.state(),camera:window.__journey.camera()}));
      if(s.phase==='success')return;
      const dx=point[0]-s.position[0],dz=point[2]-s.position[2],distance=Math.hypot(dx,dz);
      if(distance<0.18)return;
      if(distance<best-0.025){best=distance;lastProgress=Date.now();}
      if(s.phase!=='exploring'||Date.now()-lastProgress>4000)throw new Error('Keyboard route stopped at '+s.surfaceId+' '+JSON.stringify(s.position)+' toward '+point.join(','));
      if(c.inside.length)cameraFailures.push({position:s.position,inside:c.inside});
      minimumCameraDistance=Math.min(minimumCameraDistance,Math.hypot(...c.position.map((v,i)=>v-c.target[i])));
      minimumStamina=Math.min(minimumStamina,s.stamina);samples++;
      const x=dx*Math.cos(c.yaw)-dz*Math.sin(c.yaw),y=dx*Math.sin(c.yaw)+dz*Math.cos(c.yaw),angle=Math.atan2(y,x);
      const octant=Math.round(angle/(Math.PI/4));
      const direction=[Math.round(Math.cos(octant*Math.PI/4)),Math.round(Math.sin(octant*Math.PI/4))];
      const codes=[];if(direction[0])codes.push(direction[0]>0?'KeyD':'KeyA');if(direction[1])codes.push(direction[1]>0?'KeyS':'KeyW');
      await setKeys(codes);await page.waitForTimeout(35);
    }
    throw new Error('Keyboard waypoint timed out '+point.join(','));
  };
  for(const id of route){
    const data=await page.evaluate(id=>{const api=window.__journey,n=api.network(),road=n.roads.find(r=>r.id===id);return{points:api.road(id),end:n.nodes.find(n=>n.id===road.to).position};},id);
    for(const p of data.points)await walk(p);await walk(data.end);await setKeys([]);
    await page.waitForTimeout(100);const state=await page.evaluate(()=>window.__journey.state());
    nodes.push({road:id,position:state.position,stamina:state.stamina});
  }
  await setKeys([]);await expect(page.getByRole('dialog')).toContainText('赴约成功');
  expect(cameraFailures).toEqual([]);expect(errors).toEqual([]);
  const final=await page.evaluate(()=>window.__journey.state());
  const report={date:new Date().toISOString(),version:browser.version(),route,mode:'follow throughout; actual Playwright keyboard events; no position fixtures',nodes,samples,minimumCameraDistance,minimumStamina,finalStamina:final.stamina,distance:final.distance,cameraFailures,errors};
  await page.screenshot({path:'artifacts/v0.6/huangjuewan-keyboard-success.png',fullPage:true});
  await writeFile('artifacts/v0.6/keyboard-route.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
