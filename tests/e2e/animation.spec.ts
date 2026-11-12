import { expect, test } from '@playwright/test';

test('walking changes actual limb poses, pauses freeze them, blocked movement and transport do not keep stepping',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?test=1');await page.getByRole('button',{name:/开启山城旅程/}).click();
  await page.getByRole('button',{name:/出发，慢慢走/}).click();
  const actor=()=>page.evaluate(()=>(window as any).__journey.camera().actor);
  await page.keyboard.down('KeyD');await expect.poll(async()=>(await actor()).weight).toBeGreaterThan(.2);
  const first=await actor();await expect.poll(async()=>Math.abs((await actor()).hip[0]-first.hip[0])).toBeGreaterThan(.05);
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toContainText('旅程暂停');
  const frozen=await actor();await page.waitForTimeout(180);expect(await actor()).toEqual(frozen);
  await page.keyboard.up('KeyD');await page.getByRole('button',{name:/继续旅程/}).click();
  await expect.poll(async()=>(await actor()).weight).toBeLessThan(.02);
  await page.evaluate(()=>(window as any).__journey.place('quay',[-31.6,0,10],70));
  await page.keyboard.down('KeyA');await page.waitForTimeout(500);
  const position=await page.evaluate(()=>(window as any).__journey.state().position);
  await page.waitForTimeout(220);expect(await page.evaluate(()=>(window as any).__journey.state().position)).toEqual(position);
  expect((await actor()).weight).toBeLessThan(.03);await page.keyboard.up('KeyA');
  await page.evaluate(()=>(window as any).__journey.place('quay',[-15,0,10],70));await page.keyboard.press('KeyE');
  await expect.poll(async()=>(await actor()).mode).toBe('riding');expect((await actor()).weight).toBe(0);
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('轻量画质',{exact:true}).check();
  expect(await page.evaluate(()=>(window as any).__journey.camera().shadows)).toBe(false);
  await page.getByLabel('轻量画质',{exact:true}).uncheck();
  expect(await page.evaluate(()=>(window as any).__journey.camera().shadows)).toBe(true);
  expect(errors).toEqual([]);
});
