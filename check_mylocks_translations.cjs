const fs = require('fs');

// Extract all myLocks keys recursively
function extractKeys(obj, prefix = '') {
  const keys = [];
  for (const key in obj) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      keys.push(...extractKeys(obj[key], path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

const en = JSON.parse(fs.readFileSync('/tmp/cc-agent/61154910/project/src/i18n/locales/en.json', 'utf8'));
const enKeys = new Set(extractKeys(en.myLocks, 'myLocks'));

const langs = ['ar', 'es', 'fa', 'fr', 'hi', 'id', 'it', 'ja', 'ka', 'ko', 'pt', 'ru', 'tr', 'vi', 'zh'];

let allComplete = true;

for (const lang of langs) {
  const langData = JSON.parse(fs.readFileSync(`/tmp/cc-agent/61154910/project/src/i18n/locales/${lang}.json`, 'utf8'));
  const langKeys = new Set(extractKeys(langData.myLocks, 'myLocks'));

  const missing = [...enKeys].filter(k => !langKeys.has(k));
  const extra = [...langKeys].filter(k => !enKeys.has(k));

  if (missing.length > 0 || extra.length > 0) {
    allComplete = false;
    console.log(`\n${lang.toUpperCase()}:`);
    if (missing.length > 0) {
      console.log(`  Missing keys (${missing.length}):`);
      missing.forEach(k => console.log(`    - ${k}`));
    }
    if (extra.length > 0) {
      console.log(`  Extra keys (${extra.length}):`);
      extra.forEach(k => console.log(`    + ${k}`));
    }
  } else {
    console.log(`${lang.toUpperCase()}: ✓ All ${enKeys.size} keys present`);
  }
}

if (allComplete) {
  console.log('\n✓ All language files have complete myLocks translations!');
}
