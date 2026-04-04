const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('__SEQ__')) {
       console.log(text);
    }
  });

  await page.goto('file://' + process.cwd() + '/client/benchmark_db.html');
  await page.waitForTimeout(2000);
  await browser.close();
})();
