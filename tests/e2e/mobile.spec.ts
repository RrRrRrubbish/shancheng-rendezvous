import { expect, test, type CDPSession, type Page } from '@playwright/test';

test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
test.beforeEach(({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  (page as Page & {runtimeErrors:string[]}).runtimeErrors=errors;
});
test.afterEach(({page})=>{expect((page as Page & {runtimeErrors:string[]}).runtimeErrors).toEqual([]);});
const state=(page:Page)=>page.evaluate(()=>(window as any).__journey.state());
const camera=(page:Page)=>page.evaluate(()=>(window as any).__journey.camera());
async function start(page:Page){
  await page.goto('/?test=1');await page.getByRole('button',{name:/开启山城旅程/}).tap();
  await page.getByRole('button',{name:/出发，慢慢走/}).tap();
  await expect(page.locator('#move-stick')).toHaveAttribute('aria-disabled','false');
}
type Finger={x:number;y:number;id:number};
async function send(cdp:CDPSession,type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',touchPoints:Finger[]){
  await cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
}

test('mobile landscape and portrait fit the viewport, while two fingers move and look independently',async({page,context})=>{
  await start(page);await expect(page.locator('#move-stick')).toBeInViewport();await expect(page.locator('.game-toolbar')).toBeInViewport();
  expect(await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}))).toEqual({w:844,h:390});
  const cdp=await context.newCDPSession(page),pad=(await page.locator('#move-stick').boundingBox())!,canvas=(await page.locator('canvas').boundingBox())!;
  const move={id:1,x:pad.x+pad.width/2+pad.width*.31,y:pad.y+pad.height/2};
  await send(cdp,'touchStart',[move]);const before=await state(page),view=await camera(page);
  await expect.poll(async()=>(await state(page)).position[0]).toBeGreaterThan(before.position[0]+0.2);
  const look={id:2,x:canvas.x+canvas.width*.7,y:canvas.y+canvas.height*.55};
  await send(cdp,'touchStart',[move,look]);
  await send(cdp,'touchMove',[move,{...look,x:look.x-110,y:look.y-80}]);
  expect(Math.abs((await camera(page)).yaw-view.yaw)).toBeGreaterThan(.3);
  await send(cdp,'touchEnd',[move]);
  await expect.poll(async()=>(await state(page)).stamina).toBeLessThan(before.stamina);
  await send(cdp,'touchEnd',[]);
  const stopped=await state(page);await page.waitForTimeout(200);expect((await state(page)).position).toEqual(stopped.position);
  expect((await camera(page)).inside).toEqual([]);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#move-stick')).toBeInViewport();await expect(page.locator('.game-toolbar')).toBeInViewport();
  expect(await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}))).toEqual({w:390,h:844});
  await page.screenshot({path:'artifacts/v0.7/mobile-portrait.png'});
});

test('thumbstick clears on cancellation, pause, resize and page blur; reduced motion retains readable walking',async({page,context})=>{
  await start(page);const cdp=await context.newCDPSession(page),pad=(await page.locator('#move-stick').boundingBox())!;
  const finger={id:1,x:pad.x+pad.width*.79,y:pad.y+pad.height/2};
  await send(cdp,'touchStart',[finger]);await expect.poll(async()=>(await camera(page)).actor.weight).toBeGreaterThan(.1);
  await send(cdp,'touchCancel',[]);let stopped=await state(page);await page.waitForTimeout(160);expect((await state(page)).position).toEqual(stopped.position);
  await page.getByRole('button',{name:'设置',exact:true}).tap();await page.getByLabel('减少动态效果',{exact:true}).check();await page.getByRole('button',{name:'保存并返回'}).tap();
  await send(cdp,'touchStart',[finger]);await expect.poll(async()=>(await camera(page)).actor.weight).toBeGreaterThan(.1);
  const pose=await camera(page);expect(Math.max(...pose.actor.hip.map(Math.abs))).toBeGreaterThan(.01);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('dialog')).toBeVisible();expect((await state(page)).paused).toBe(true);
  await send(cdp,'touchEnd',[]);await page.getByRole('button',{name:/继续旅程/}).tap();
  stopped=await state(page);await page.waitForTimeout(160);expect((await state(page)).position).toEqual(stopped.position);
  await send(cdp,'touchStart',[finger]);await page.setViewportSize({width:852,height:393});await send(cdp,'touchEnd',[]);
  stopped=await state(page);await page.waitForTimeout(160);expect((await state(page)).position).toEqual(stopped.position);
});

test('a complete Liziba trip uses actual thumbstick touches and on-screen transport buttons',async({page,context})=>{
  test.setTimeout(150_000);await start(page);const cdp=await context.newCDPSession(page);
  const walk=async(target:number[])=>{
    const pad=(await page.locator('#move-stick').boundingBox())!,center={x:pad.x+pad.width/2,y:pad.y+pad.height/2},radius=pad.width*.31;
    let held=false,previous=Infinity,stuck=0;
    for(let attempt=0;attempt<300;attempt++){
      const s=await state(page),dx=target[0]-s.position[0],dz=target[2]-s.position[2],distance=Math.hypot(dx,dz);
      if(distance<.55||s.phase==='success')break;
      if(Math.abs(distance-previous)<.001)stuck++;else stuck=0;
      expect(stuck,'thumbstick route blocked at '+s.position).toBeLessThan(25);previous=distance;
      const yaw=(await camera(page)).yaw,c=Math.cos(yaw),sin=Math.sin(yaw),strength=Math.min(1,distance/2);
      const finger={id:1,x:center.x+(dx*c-dz*sin)/distance*radius*(.14+.86*strength),y:center.y+(dx*sin+dz*c)/distance*radius*(.14+.86*strength)};
      await send(cdp,held?'touchMove':'touchStart',[finger]);held=true;
      await page.waitForTimeout(65);
    }
    if(held)await send(cdp,'touchEnd',[]);
    const s=await state(page);expect(s.phase==='success'||Math.hypot(target[0]-s.position[0],target[2]-s.position[2])<.9,'touch waypoint '+target+' reached '+s.position).toBe(true);
  };
  await walk([-27,0,7]);await walk([-27,6,-5]);await walk([-24,6,-5]);
  const saved=(await camera(page)).pitch;
  const button=await page.locator('#interaction button').elementHandle();await page.waitForTimeout(160);
  expect(await button!.evaluate(el=>el===document.querySelector('#interaction button'))).toBe(true);
  await page.locator('#interaction button').tap();
  await expect(page.locator('canvas')).toHaveAttribute('data-camera','ride-overview');
  await expect(page.locator('#move-stick')).toHaveAttribute('aria-disabled','true');
  await page.screenshot({path:'artifacts/v0.7/mobile-rail.png'});
  await expect.poll(async()=>(await state(page)).phase,{timeout:20000}).toBe('exploring');
  expect((await camera(page)).pitch).toBeCloseTo(saved);await walk([19,6,-4]);await walk([19,0,12]);await walk([12,0,14]);
  await expect(page.getByRole('dialog')).toContainText('赴约成功');await page.screenshot({path:'artifacts/v0.7/mobile-success.png'});
});

test('mobile recovery and discovery can both be seen and expanded without blocking the stick',async({page})=>{
  await start(page);await page.evaluate(async()=>{const api=(window as any).__journey;api.unlockAll();await api.load('huangjuewan');});
  await page.getByRole('button',{name:/出发，慢慢走/}).tap();
  await page.evaluate(()=>(window as any).__journey.place('junction-g',[22,10,-8],92));
  await expect(page.locator('.event-rest')).toContainText('体力 +8');await expect(page.locator('.event-discovery')).toBeVisible();
  await expect(page.locator('#move-stick')).toHaveAttribute('aria-disabled','false');
  await page.screenshot({path:'artifacts/v0.7/mobile-feedback.png'});
  await page.getByRole('button',{name:/展开地点行记/}).tap();expect((await state(page)).paused).toBe(true);
  await expect(page.getByRole('link',{name:'查看地标实景资料 ↗'})).toHaveAttribute('href',/^https:\/\/(www\.cqnews\.net|www\.cq\.gov\.cn|whlyw\.cq\.gov\.cn|dfz\.cq\.gov\.cn)\//);
});
