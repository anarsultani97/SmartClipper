import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const dir = 'docs/design/screenshots';
await mkdir(dir,{recursive:true});
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  // Capture deterministic empty states; network/processing is checked separately.
  await page.route('**/api/v1/projects', route => route.fulfill({json:[]}));
  for(const direction of ['guided','library','studio']){
    await page.goto('http://127.0.0.1:5173/?design='+direction);
    await page.getByRole('button',{name:'Choose video'}).waitFor();
    await page.locator('.status-dot.online').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({path:dir+'/'+direction+'.png',fullPage:true});
  }
  await page.goto('http://127.0.0.1:5173/?review');
  await page.getByText('Three ways to find your next short.').waitFor();
  await page.screenshot({path:dir+'/directions.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button',{name:'Choose video'}).waitFor();
  await page.screenshot({path:dir+'/guided-mobile.png',fullPage:true});
  console.log('Saved three directions, comparison, and mobile screenshots.');
} finally { await browser.close(); }
