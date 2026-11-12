import { expect,test,type Page } from '@playwright/test';

const runtimeErrors=new WeakMap<Page,string[]>();
test.beforeEach(({page})=>{const errors:string[]=[];runtimeErrors.set(page,errors);page.on('pageerror',error=>errors.push(String(error)));});
test.afterEach(({page})=>{expect(runtimeErrors.get(page)??[],'uncaught browser errors').toEqual([]);});

async function load(page:Page,id='huangjuewan'){
  await page.goto('/?test=1');await expect(page.getByRole('button',{name:/开启山城旅程/})).toBeVisible();await page.evaluate(()=>{(window as any).__journey.unlockAll();});
  await page.evaluate(id=>(window as any).__journey.load(id),id);
  await page.getByRole('button',{name:/出发，慢慢走/}).click();
  await expect(page.locator('canvas')).toHaveAttribute('data-camera','follow');
}
const inner=['one-west','inner-12','inner-23','inner-34','inner-45','five-east'];
const outer=['one-west','one-east','outer-12','two-south','two-north','outer-23','three-east','three-west','outer-34','four-north','four-south','outer-45','five-west','five-east'];
test('five playable layers have complete inner and outer routes and successful arrival',async({page})=>{
  for(const route of[inner,outer]){
    await load(page);
    const levels=new Set();
    for(const id of route){
      const height=await page.evaluate(id=>{
        const api=(window as any).__journey,network=api.network(),road=network.roads.find((r:any)=>r.id===id);
        for(const p of api.road(id))api.walkTo(p);api.walkTo(network.nodes.find((n:any)=>n.id===road.to).position);
        return api.state().position[1];
      },id);levels.add(Math.round(height/5)+1);
    }
    expect([...levels].sort()).toEqual([1,2,3,4,5]);
    await expect(page.getByRole('dialog')).toContainText('赴约成功');
    const state=await page.evaluate(()=>(window as any).__journey.state());expect(state.stamina).toBeGreaterThan(0);
  }
});
test('rest and optional discovery events remain visible together and show actual capped recovery',async({page})=>{
  await load(page);
  await page.evaluate(()=>(window as any).__journey.place('junction-g',[22,10,-8],92));
  await expect(page.locator('.event-rest')).toContainText('体力 +8');
  await expect(page.locator('.event-discovery')).toContainText('沿途发现 · 可选');
  await expect(page.locator('#discovery-card')).toBeVisible();
  await expect(page.locator('.stamina-box')).toHaveClass(/stamina-restored/);
  await expect(page.locator('[data-rest="interchange-east-rest"]')).toContainText('本次已歇脚');
  expect((await page.evaluate(()=>(window as any).__journey.state())).paused).toBe(false);
  await page.evaluate(()=>(window as any).__journey.place('junction-j',[-12,15,-22],100));
  await expect(page.locator('.event-rest').filter({hasText:'体力已满'})).toHaveCount(1);
});
test('full horizontal orbit and limited pitch keep the follow camera out of buildings and decks',async({page})=>{
  await load(page);
  const cases:[string,number[]][]=[['junction-a',[-8,0,8]],['junction-e',[12,5,0]],['junction-h',[0,10,-8]],['junction-k',[-12,15,0]],['junction-n',[0,20,0]]];
  for(const[surface,position]of cases){
    await page.evaluate(({surface,position})=>(window as any).__journey.place(surface,position,70),{surface,position});
    for(const[dx,dy]of [[1400,-1000],[-1800,1800],[1400,-1000]]){
      const bounds=(await page.locator('canvas').boundingBox())!;
      await page.mouse.move(bounds.x+700,bounds.y+370);await page.mouse.down();await page.mouse.move(bounds.x+700+dx,bounds.y+370+dy,{steps:5});await page.mouse.up();
      await expect.poll(()=>page.evaluate(()=>(window as any).__journey.camera().inside)).toEqual([]);
      const camera=await page.evaluate(()=>(window as any).__journey.camera());
      expect(Math.abs(camera.offset)).toBeLessThanOrEqual(Math.PI+1e-5);
      expect(camera.pitch).toBeGreaterThanOrEqual(-12*Math.PI/180-1e-5);expect(camera.pitch).toBeLessThanOrEqual(68*Math.PI/180+1e-5);
      expect(Math.hypot(...camera.position.map((v:number,i:number)=>v-camera.target[i]))).toBeGreaterThan(0.3);
    }
  }
});
test('Crown entrance starts outside the building and follows a real keyboard approach',async({page})=>{
  await load(page,'crown-escalator');
  await expect.poll(()=>page.evaluate(()=>(window as any).__journey.camera().inside)).toEqual([]);
  const initial=await page.evaluate(()=>(window as any).__journey.camera());
  expect(Math.hypot(...initial.position.map((v:number,i:number)=>v-initial.target[i]))).toBeGreaterThan(4);
  await page.keyboard.down('KeyW');await page.waitForTimeout(650);await page.keyboard.up('KeyW');
  await expect.poll(()=>page.evaluate(()=>(window as any).__journey.camera().inside)).toEqual([]);
});
test('all road control samples and the three other levels survive a grid of allowed follow angles',async({page})=>{
  for(const id of['liziba','crown-escalator','yangtze-cableway','huangjuewan']){
    await load(page,id);const result=await page.evaluate(()=>(window as any).__journey.auditCamera());
    expect(result.failures.slice(0,5),id+' camera audit').toEqual([]);expect(result.samples).toBeGreaterThan(20);
  }
});
test('the other three landmarks retain complete walking and transport routes with runtime obstacles',async({page})=>{
  const walk=async(point:number[])=>page.evaluate(p=>(window as any).__journey.walkTo(p),point);
  const ride=async()=>{await page.keyboard.press('KeyE');await page.evaluate(()=>(window as any).__journey.advance(12));};
  for(const useLift of[false,true]){
    await load(page,'liziba');
    if(useLift){await walk([-15,0,10]);await ride();await walk([-15,6,-5]);}else{await walk([-27,0,7]);await walk([-27,6,-5]);}
    await walk([-24,6,-5]);await ride();await walk([19,6,-4]);await walk([19,0,12]);await walk([12,0,14]);await expect(page.getByRole('dialog')).toContainText('赴约成功');
  }
  for(const route of['escalator','short','fold']){
    await load(page,'crown-escalator');
    if(route==='escalator'){await walk([2,0,7]);await ride();await walk([2,8,-12]);}
    else{
      await walk([-14,0,7]);await walk([-14,3,-1]);await walk([-17,3,-1]);await walk([-6,3,-1]);await walk([-17,3,-1]);
      if(route==='short'){await walk([-11,3,-1]);await walk([-11,8,-10]);}
      else{await walk([-23,3,-1]);await walk([-23,5.5,7]);await walk([-27,5.5,7]);await walk([-27,8,-10]);}
    }
    await walk([8,8,-12]);await walk([8,8,-10]);await expect(page.getByRole('dialog')).toContainText('赴约成功');
    if(route!=='escalator')expect((await page.evaluate(()=>(window as any).__journey.state())).discoveries).toContain('crown-height');
    if(route==='fold')expect((await page.evaluate(()=>(window as any).__journey.state())).discoveries).toContain('crown-lanes');
  }
  await load(page,'yangtze-cableway');await walk([-8,2,5]);await walk([1,6,5]);await walk([1,6,7]);await ride();await walk([17,6,7.5]);await walk([18,6,4]);await walk([25,2,4]);await walk([25,2,-1]);
  await expect(page.getByRole('dialog')).toContainText('赴约成功');
});

test('rail and cableway use automatic overview and restore the saved orbit after arrival, skip and retry',async({page})=>{
  for(const id of['liziba','yangtze-cableway']){
    await load(page,id);
    const stop=id==='liziba'?{surface:'terrace',position:[-24,6,-5]}:{surface:'north-station',position:[1,6,7]};
    await page.evaluate(stop=>(window as any).__journey.place(stop.surface,stop.position,55),stop);
    const box=(await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x+400,box.y+300);await page.mouse.down();await page.mouse.move(box.x+600,box.y+340,{steps:8});await page.mouse.up();
    const saved=await page.evaluate(()=>(window as any).__journey.camera());
    await page.keyboard.press('KeyE');
    await expect(page.locator('canvas')).toHaveAttribute('data-camera','ride-overview');
    await expect(page.getByRole('button',{name:'乘坐总览',exact:true})).toBeDisabled();
    await page.evaluate(()=>(window as any).__journey.advance(3));await page.waitForTimeout(900);
    const midway=await page.evaluate(()=>({state:(window as any).__journey.state(),camera:(window as any).__journey.camera()}));
    expect(midway.camera.inside).toEqual([]);expect(midway.camera.vehiclePosition).toEqual(midway.state.position);
    expect(Math.hypot(...midway.camera.position.map((v:number,i:number)=>v-midway.state.position[i]))).toBeGreaterThan(12);
    await page.keyboard.press('KeyR');await page.keyboard.press('KeyV');await expect(page.locator('canvas')).toHaveAttribute('data-camera','ride-overview');
    await page.evaluate(()=>(window as any).__journey.advance(12));await expect(page.locator('canvas')).toHaveAttribute('data-camera','follow');
    const after=await page.evaluate(()=>(window as any).__journey.camera());
    expect(after.pitch).toBeCloseTo(saved.pitch);expect(after.offset).toBeCloseTo(saved.offset);
    expect((await page.evaluate(()=>(window as any).__journey.state())).stamina).toBe(id==='liziba'?75:55);
    await page.keyboard.press('KeyE');await expect(page.locator('canvas')).toHaveAttribute('data-camera','ride-overview');
    await page.getByRole('button',{name:'略过乘坐片段',exact:true}).click();await expect(page.locator('canvas')).toHaveAttribute('data-camera','follow');
    await page.keyboard.press('KeyE');await expect(page.locator('canvas')).toHaveAttribute('data-camera','ride-overview');
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'重新开始本关',exact:true}).click();
    await expect(page.locator('canvas')).toHaveAttribute('data-camera','follow');
    expect((await page.evaluate(()=>(window as any).__journey.state())).rides).toBe(0);
  }
});

test('manual orbit can look behind the player and remains there after stopping',async({page})=>{
  await load(page);await page.evaluate(()=>(window as any).__journey.place('junction-n',[0,20,0],70));
  const initial=await page.evaluate(()=>(window as any).__journey.camera()),bounds=(await page.locator('canvas').boundingBox())!;
  await page.mouse.move(bounds.x+200,bounds.y+300);await page.mouse.down();await page.mouse.move(bounds.x+830,bounds.y+300,{steps:15});await page.mouse.up();
  const turned=await page.evaluate(()=>(window as any).__journey.camera());
  expect(Math.cos(turned.yaw-initial.yaw)).toBeLessThan(-0.99);
  await page.waitForTimeout(1100);
  const settled=await page.evaluate(()=>(window as any).__journey.camera());
  expect(settled.yaw).toBeCloseTo(turned.yaw,4);expect(settled.inside).toEqual([]);
  await page.keyboard.press('KeyR');
  expect(Math.abs((await page.evaluate(()=>(window as any).__journey.camera())).offset)).toBeLessThan(1e-5);
});
