# Social Media Sharing - McFun Thumbnail

## Current Status: ✅ FIXED - PNG VERSION DEPLOYED

Your site now uses a **PNG image** (instead of SVG) which is properly supported by all social media platforms including Telegram.

### What's Set Up:

1. **Meta Tags** - All Open Graph and Twitter Card tags with absolute URLs
2. **OG Image** - High-quality PNG (611KB, 2400x1260 retina) with MF logo
3. **Format** - PNG instead of SVG (works with all platforms including Telegram)
4. **URLs** - Absolute URLs (https://mcfun.io/og-image.png) for better compatibility

## 🔴 TELEGRAM USERS - READ THIS FIRST

Telegram caches link previews **aggressively**. To see the new McFun thumbnail:

### Method 1: Force New Cache (Recommended)
Share the link with a version parameter:
```
https://mcfun.io?v=2026
```
Telegram treats this as a new URL and fetches fresh metadata.

### Method 2: Use Telegram's WebPageBot
1. Message: [@WebPageBot](https://t.me/webpagebot)
2. Send: `https://mcfun.io`
3. The bot will refresh the cached preview

### Method 3: Wait
Telegram's cache expires after 24-48 hours (sometimes longer).

---

## Clear Cache On Other Platforms

If you're still seeing the old thumbnail on other platforms:

### Facebook / LinkedIn
1. Go to: https://developers.facebook.com/tools/debug/
2. Enter your URL: `https://mcfun.io`
3. Click "Debug" then click "Scrape Again"
4. This forces Facebook/LinkedIn to fetch the new thumbnail

### Twitter / X
1. Go to: https://cards-dev.twitter.com/validator
   - Note: You may need to apply for access if you haven't already
2. Enter your URL: `https://mcfun.io`
3. Click "Preview card"
4. Alternatively, just wait 7 days as Twitter's cache expires automatically

### Discord
Discord is tricky - their cache can persist for weeks:
1. Add a query parameter when sharing: `https://mcfun.io?v=2`
2. Discord will treat this as a new URL and fetch fresh data

### Telegram
1. Use: https://t.me/webpagebot
2. Send your URL to the bot
3. It will refresh the cached preview

### WhatsApp
WhatsApp cache is difficult to clear manually. Options:
1. Wait 7-30 days for automatic refresh
2. Add query parameter: `https://mcfun.io?v=2`

## Testing Your Setup

After clearing caches, test by sharing your link. You should see:
- **Title**: "McFun: Launch Your Token"
- **Image**: White MF logo on dark gradient background
- **Description**: "Launch and trade tokens on Ethereum with McFun..."

## Alternative: Force Immediate Update

If you need the new thumbnail to appear immediately:

1. Add a version parameter to your URL when sharing:
   - `https://mcfun.io?v=2`
   - Social platforms treat this as a new URL

2. Or temporarily add `?t=TIMESTAMP` to the og-image URL in index.html:
   ```html
   <meta property="og:image" content="/og-image.svg?t=1706461200">
   ```

## Verification

The meta tags are correctly configured:
- Open Graph image: `https://mcfun.io/og-image.png` (PNG, 1200x630, retina quality)
- Absolute URLs (not relative) for maximum compatibility
- Twitter Card: `summary_large_image`
- Image type explicitly set: `image/png`
- No references to bolt.new remain in the codebase

Once caches are cleared, all shares will show McFun branding with the MF logo.

## Technical Details

- Image format: PNG (not SVG) for universal support
- Resolution: 2400x1260 (2x retina) for crisp display
- File size: 611KB
- Generated using Puppeteer from HTML template
- To regenerate: `node generate-og-image.cjs`
