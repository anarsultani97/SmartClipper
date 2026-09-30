import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors = [];
  page.on('pageerror',e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button').filter({hasText:'floss-761.mp4'}).last().click();
  const video = page.getByLabel('Video preview');
  await video.waitFor();
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
  const duration = await video.evaluate(v => v.duration);
  assert(duration > 11 && duration < 13);
  await page.getByLabel('Selection start seconds').fill('2');
  await page.getByLabel('Selection end seconds').fill('8');
  await page.getByRole('button',{name:'Save selection'}).click();
  await page.getByRole('button',{name:'Selection saved'}).waitFor();
  await page.screenshot({path:'.cache/editor-review.png',fullPage:true});
  await page.reload();
  await page.getByRole('button').filter({hasText:'floss-761.mp4'}).last().click();
  await page.getByLabel('Video preview').waitFor();
  assert.equal(await page.getByLabel('Selection start seconds').inputValue(),'2');
  assert.equal(await page.getByLabel('Selection end seconds').inputValue(),'8');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Real browser video metadata, selection save, reload persistence: passed.');
} finally { await browser.close(); }
