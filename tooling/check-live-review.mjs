import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const account=JSON.parse(await readFile('.cache/review-account.json','utf8'));
const evidence=JSON.parse(await readFile('.cache/podcast-generation-smoke.json','utf8'));
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
  const auth=await context.request.post('http://127.0.0.1:5173/api/v1/auth/login',{data:account});assert(auth.ok());
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const id=evidence.podcasts[0].project_id;
  await page.goto(`http://127.0.0.1:5173/projects/${id}/shorts`);
  await page.getByText('THE STORY IN THIS CUT',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
  assert((await page.locator('video').evaluate(v=>v.duration))>10);
  if(await page.getByRole('switch').isChecked()) await page.getByRole('switch').click();await page.getByText('Captions off',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Save changes'}).click();await page.getByRole('button',{name:'Saved',exact:true}).waitFor();
  await page.reload();await page.getByText('Captions off',{exact:true}).waitFor();
  await page.getByRole('button',{name:/Edit cover/}).click();await page.getByText('Give your story a cover.',{exact:true}).waitFor();
  await page.getByLabel('Cover text').fill('A clearer story');await page.getByLabel('Text style').selectOption('clean');await page.getByRole('button',{name:'Save cover'}).click();await page.getByText('Cover saved.',{exact:true}).waitFor();
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download JPG'}).click()]);assert((await download.suggestedFilename()).endsWith('.jpg'));
  await page.screenshot({path:'.cache/thumbnail-review.png',fullPage:true});
  await page.getByRole('button',{name:'Back to your shorts'}).click();await page.screenshot({path:'.cache/shorts-review.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.equal(errors.length,0,errors.join('\n'));console.log('Live browser: video, captions persistence, cover editing/download, responsive results: passed.');
} finally {await browser.close();}
