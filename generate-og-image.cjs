// Script to generate OG image PNG from HTML template
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  await page.setViewport({
    width: 1200,
    height: 630,
    deviceScaleFactor: 2
  });

  const filePath = 'file://' + path.join(__dirname, 'public', 'generate-og-image.html');
  console.log('Loading template from:', filePath);

  await page.goto(filePath, { waitUntil: 'networkidle0' });

  const outputPath = path.join(__dirname, 'public', 'og-image.png');
  await page.screenshot({
    path: outputPath,
    type: 'png'
  });

  await browser.close();
  console.log('✓ OG image generated successfully at public/og-image.png');
})();
