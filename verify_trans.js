const fs = require('fs');

console.log('=== Translation Verification Summary ===\n');

const langs = ['fa', 'ar', 'es', 'zh', 'ja', 'ko', 'ru', 'pt', 'hi', 'tr', 'vi', 'it', 'id', 'ka', 'fr', 'en'];

langs.forEach(lang => {
  const data = JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}.json`, 'utf8'));
  
  const hasMyLocksTitle = data.myLocks && data.myLocks.title;
  const hasMyLocksSubtitle = data.myLocks && data.myLocks.subtitle;
  const hasMyLocksTotalValue = data.myLocks && data.myLocks.totalLockedValue;
  const hasMyLocksViewAll = data.myLocks && data.myLocks.viewAllForToken;
  const hasBurnOfSupply = data.burn && data.burn.ofSupply;
  
  const allGood = hasMyLocksTitle && hasMyLocksSubtitle && hasMyLocksTotalValue && hasMyLocksViewAll && hasBurnOfSupply;
  
  const status = allGood ? 'OK' : 'MISSING';
  console.log(lang + ' - ' + status);
});

console.log('\n=== Persian Translations ===');
const fa = JSON.parse(fs.readFileSync('src/i18n/locales/fa.json', 'utf8'));
console.log('myLocks.title:', fa.myLocks.title);
console.log('myLocks.subtitle:', fa.myLocks.subtitle);
console.log('myLocks.totalLockedValue:', fa.myLocks.totalLockedValue);
console.log('myLocks.activeLocks:', fa.myLocks.activeLocks);
console.log('burn.ofSupply:', fa.burn.ofSupply);
