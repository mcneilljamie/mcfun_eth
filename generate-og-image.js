// Script to generate OG image PNG from HTML template
// Run this once to create the og-image.png file

// This requires puppeteer to be installed:
// npm install --save-dev puppeteer

// Uncomment and run if you want to generate PNG:
/*
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setViewport({
    width: 1200,
    height: 630,
    deviceScaleFactor: 2
  });

  const filePath = 'file://' + path.join(__dirname, 'public', 'generate-og-image.html');
  await page.goto(filePath, { waitUntil: 'networkidle0' });

  await page.screenshot({
    path: path.join(__dirname, 'public', 'og-image.png'),
    type: 'png'
  });

  await browser.close();
  console.log('OG image generated successfully at public/og-image.png');
})();
*/

console.log('To generate a PNG version of the OG image:');
console.log('1. Install puppeteer: npm install --save-dev puppeteer');
console.log('2. Uncomment the code in this file');
console.log('3. Run: node generate-og-image.js');
console.log('');
console.log('Alternative: Open public/generate-og-image.html in a browser');
console.log('and take a screenshot at 1200x630 resolution.');
console.log('');
console.log('The SVG version will work for most social platforms.');
