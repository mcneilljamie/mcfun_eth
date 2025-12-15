const fs = require('fs');
const path = require('path');

// Read English reference file
const enPath = './src/i18n/locales/en.json';
const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// Get all keys from nested object
function getAllKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys.push(...getAllKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// Get reference keys from English
const referenceKeys = getAllKeys(enData).sort();
console.log(`English (en.json) has ${referenceKeys.length} keys`);

// Languages to check
const languages = ['ar', 'es', 'fa', 'fr', 'hi', 'id', 'it', 'ja', 'ka', 'ko', 'pt', 'ru', 'tr', 'vi', 'zh'];

const results = {};

for (const lang of languages) {
  const langPath = `./src/i18n/locales/${lang}.json`;
  const langData = JSON.parse(fs.readFileSync(langPath, 'utf8'));
  const langKeys = getAllKeys(langData).sort();

  // Find missing keys
  const missingKeys = referenceKeys.filter(key => !langKeys.includes(key));

  // Find extra keys (keys in translation but not in English)
  const extraKeys = langKeys.filter(key => !referenceKeys.includes(key));

  results[lang] = {
    totalKeys: langKeys.length,
    missingKeys,
    extraKeys
  };
}

// Generate report
console.log('\n' + '='.repeat(80));
console.log('TRANSLATION KEY VERIFICATION REPORT');
console.log('='.repeat(80));
console.log(`\nReference: English (en.json) - ${referenceKeys.length} keys`);
console.log('\n' + '-'.repeat(80));

let allComplete = true;

for (const [lang, data] of Object.entries(results)) {
  const status = data.missingKeys.length === 0 && data.extraKeys.length === 0 ? '✓ COMPLETE' : '✗ INCOMPLETE';

  if (data.missingKeys.length > 0 || data.extraKeys.length > 0) {
    allComplete = false;
  }

  console.log(`\n${lang}.json: ${status}`);
  console.log(`  Total keys: ${data.totalKeys}`);

  if (data.missingKeys.length > 0) {
    console.log(`  Missing keys: ${data.missingKeys.length}`);
    console.log(`  Missing:`);
    data.missingKeys.slice(0, 20).forEach(key => {
      console.log(`    - ${key}`);
    });
    if (data.missingKeys.length > 20) {
      console.log(`    ... and ${data.missingKeys.length - 20} more`);
    }
  }

  if (data.extraKeys.length > 0) {
    console.log(`  Extra keys (not in en.json): ${data.extraKeys.length}`);
    data.extraKeys.slice(0, 10).forEach(key => {
      console.log(`    + ${key}`);
    });
    if (data.extraKeys.length > 10) {
      console.log(`    ... and ${data.extraKeys.length - 10} more`);
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));

if (allComplete) {
  console.log('\nAll translation files are complete!');
  console.log('All language files have the same keys as en.json.');
} else {
  const incompleteFiles = Object.entries(results)
    .filter(([_, data]) => data.missingKeys.length > 0 || data.extraKeys.length > 0)
    .map(([lang, _]) => lang);

  console.log(`\n${incompleteFiles.length} translation file(s) have issues:`);
  incompleteFiles.forEach(lang => {
    const data = results[lang];
    console.log(`  - ${lang}.json: ${data.missingKeys.length} missing, ${data.extraKeys.length} extra`);
  });
}

console.log('\n');
