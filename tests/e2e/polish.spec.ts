import { expect, test } from '@playwright/test';

async function start(page:import('@playwright/test').Page){
  await page.goto('/?test=1');await page.getByRole('button',{name:/开启山城旅程/}).click();
  await page.getByRole('button',{name:/出发，慢慢走/}).click();
}
test('shipped cover and four local illustrations load with consistent square icons and sign texels',async({page,request})=>{
  await page.goto('/?test=1');
  await expect.poll(()=>page.locator('.cover-illustration').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  for(const image of['cover/shancheng-cover','media/liziba','media/crown','media/cableway','media/huangjuewan']){
    const response=await request.get('/'+image+'.webp');expect(response.ok()).toBe(true);expect(response.headers()['content-type']).toContain('image/webp');
  }
  const gear=page.locator('[data-action=settings] svg');await expect(gear).toHaveAttribute('data-icon','settings');
  const size=await gear.boundingBox();expect(size!.width).toBe(20);expect(size!.height).toBe(20);
  await page.getByRole('button',{name:/开启山城旅程/}).click();await page.getByRole('button',{name:/出发，慢慢走/}).click();
  const signs=await page.evaluate(()=>(window as any).__journey.signs());
  for(const sign of signs){expect(sign.textureWidth/sign.textureHeight).toBeCloseTo(sign.width/sign.height,1);expect(sign.anisotropy).toBeGreaterThanOrEqual(1);}
  await page.evaluate(()=>(window as any).__journey.place('quay',[-20,0,12],70));
  await expect(page.locator('#discovery-card img')).toBeVisible();await expect(page.locator('#discovery-card figcaption')).toContainText('AI 场景示意 · 非实景照片');
});

test('lift cabin carries the visible player, aligns with its shaft and lands in both directions without stamina cost',async({page})=>{
  await start(page);await page.evaluate(()=>(window as any).__journey.place('quay',[-15,0,10],64));
  await page.keyboard.press('KeyE');await page.evaluate(()=>(window as any).__journey.advance(1));
  await expect.poll(()=>page.evaluate(()=>(window as any).__journey.camera().lift?.riding)).toBe(true);
  const middle=await page.evaluate(()=>({camera:(window as any).__journey.camera(),state:(window as any).__journey.state()}));
  expect(middle.camera.actorVisible).toBe(true);
  expect(middle.camera.lift.cabin[0]).toBe(middle.camera.lift.shaft[0]);
  expect(middle.camera.lift.cabin[2]).toBe(middle.camera.lift.shaft[2]);
  expect(middle.camera.lift.cabin[1]).toBeGreaterThan(0);expect(middle.camera.lift.cabin[1]).toBeLessThan(6);
  expect(middle.camera.inside).toEqual([]);expect(middle.state.stamina).toBe(64);
  await page.evaluate(()=>(window as any).__journey.advance(4));
  await expect.poll(()=>page.evaluate(()=>(window as any).__journey.camera().lift.cabin[1])).toBe(6);
  await expect.poll(()=>page.evaluate(()=>(window as any).__journey.camera().lift.doors[1])).toBeGreaterThan(.95);
  await page.keyboard.press('KeyE');await page.evaluate(()=>(window as any).__journey.advance(4));
  await expect.poll(()=>page.evaluate(()=>(window as any).__journey.camera().lift.cabin[1])).toBe(0);
  expect(await page.evaluate(()=>(window as any).__journey.state().stamina)).toBe(64);
});

test('escalator steps circulate, freeze when paused, carry a visible standing rider and preserve the ride rules',async({page})=>{
  await start(page);await page.evaluate(async()=>{(window as any).__journey.unlockAll();await (window as any).__journey.load('crown-escalator');});
  await page.getByRole('button',{name:/出发，慢慢走/}).click();
  const before=await page.evaluate(()=>(window as any).__journey.camera().escalator.phase);
  await expect.poll(()=>page.evaluate(()=>(window as any).__journey.camera().escalator.phase)).not.toBe(before);
  await page.getByRole('button',{name:'暂停旅程',exact:true}).click();
  const frozen=await page.evaluate(()=>(window as any).__journey.camera().escalator.phase);
  await page.waitForTimeout(180);expect(await page.evaluate(()=>(window as any).__journey.camera().escalator.phase)).toBe(frozen);
  await page.getByRole('button',{name:/继续旅程/}).click();
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('减少动态效果',{exact:true}).check();await page.getByRole('button',{name:'保存并返回'}).click();
  const quiet=await page.evaluate(()=>(window as any).__journey.camera().escalator.phase);
  await page.waitForTimeout(150);expect(await page.evaluate(()=>(window as any).__journey.camera().escalator.phase)).toBe(quiet);
  await page.evaluate(()=>(window as any).__journey.place('caiyuanba',[2,0,7],61));
  await page.keyboard.press('KeyE');await page.evaluate(()=>(window as any).__journey.advance(3));
  await expect.poll(()=>page.evaluate(()=>(window as any).__journey.camera().actor.mode)).toBe('riding');
  // advance() changes simulation time synchronously; compare after a rendered pose catches up.
  await expect.poll(()=>page.evaluate(()=>{
    const api=(window as any).__journey,p=api.state().position,step=api.camera().escalator.step;
    return Math.max(...step.map((v:number,i:number)=>Math.abs(v-p[i])));
  })).toBeLessThan(1e-6);
  const mid=await page.evaluate(()=>({camera:(window as any).__journey.camera(),state:(window as any).__journey.state()}));
  expect(mid.camera.escalator.vehicle).toBe(false);expect(mid.camera.actorVisible).toBe(true);expect(mid.state.phase).toBe('riding');expect(mid.state.stamina).toBe(61);
  mid.camera.escalator.step.forEach((v:number,i:number)=>expect(v).toBeCloseTo(mid.state.position[i],6));
  await page.evaluate(()=>(window as any).__journey.advance(8));
  expect(await page.evaluate(()=>(window as any).__journey.state().surfaceId)).toBe('lianglukou');
  expect(await page.evaluate(()=>(window as any).__journey.state().stamina)).toBe(61);
});

test.describe('portrait display entry',()=>{
  test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});
  test('fullscreen and orientation rejection leave portrait playable with no overlay trap',async({page})=>{
    await page.addInitScript(()=>{
      Object.defineProperty(Element.prototype,'requestFullscreen',{value:()=>Promise.reject(new Error('not supported')),configurable:true});
      Object.defineProperty(screen,'orientation',{value:{lock:()=>Promise.reject(new Error('not supported'))},configurable:true});
    });
    await page.goto('/?test=1');await expect(page.locator('#landscape-entry')).toBeVisible();
    await page.locator('#landscape-entry [data-action=display]').click();
    await expect(page.locator('#landscape-entry')).toContainText('可手动旋转手机');
    await page.getByRole('button',{name:'继续竖屏',exact:true}).click();await expect(page.locator('#landscape-entry')).toBeHidden();
    await page.getByRole('button',{name:/开启山城旅程/}).click();await page.getByRole('button',{name:/出发，慢慢走/}).click();
    await expect(page.locator('.city-canvas')).toBeVisible();await expect(page.locator('#move-stick')).toBeInViewport();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    const stick=(await page.locator('#move-stick').boundingBox())!;
    await page.dispatchEvent('#move-stick','pointerdown',{pointerId:11,pointerType:'touch',clientX:stick.x+66,clientY:stick.y+66,button:0});
    await page.dispatchEvent('#move-stick','pointermove',{pointerId:11,pointerType:'touch',clientX:stick.x+105,clientY:stick.y+66});
    await expect.poll(()=>page.evaluate(()=>(window as any).__journey.state().distance)).toBeGreaterThan(.2);
    await page.dispatchEvent('#move-stick','pointerup',{pointerId:11,pointerType:'touch'});
  });
  test('successful fullscreen and landscape APIs are called only from the display button',async({page})=>{
    await page.addInitScript(()=>{
      (window as any).__displayCalls=[];
      Object.defineProperty(Element.prototype,'requestFullscreen',{value:async()=>{(window as any).__displayCalls.push('fullscreen');Object.defineProperty(document,'fullscreenElement',{value:document.documentElement,configurable:true});},configurable:true});
      Object.defineProperty(screen,'orientation',{value:{lock:async(value:string)=>{(window as any).__displayCalls.push(value);}},configurable:true});
    });
    await page.goto('/?test=1');expect(await page.evaluate(()=>(window as any).__displayCalls)).toEqual([]);
    await page.locator('#landscape-entry [data-action=display]').click();
    await expect.poll(()=>page.evaluate(()=>(window as any).__displayCalls)).toEqual(['fullscreen','landscape']);
    await page.setViewportSize({width:844,height:390});await expect(page.locator('#landscape-entry')).toBeHidden();
    await page.getByRole('button',{name:/开启山城旅程/}).click();await page.getByRole('button',{name:/出发，慢慢走/}).click();
    await expect(page.locator('#move-stick')).toBeInViewport();await expect(page.locator('.city-canvas')).toBeInViewport();
  });
});
