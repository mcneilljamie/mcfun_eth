# Social Media Sharing - McFun Thumbnail

## Current Status: ✅ CONFIGURED

Your site is now properly configured to show McFun branding (MF logo) when shared on social media platforms instead of Bolt's thumbnail.

### What's Set Up:

1. **Meta Tags** - All Open Graph and Twitter Card tags point to `/og-image.svg`
2. **OG Image** - Custom 1200x630 image with MF logo, McFun branding
3. **Build** - Image included in production build

## IMPORTANT: Clear Social Media Cache

Social media platforms cache thumbnails for **24-48 hours** or longer. If you're still seeing Bolt's thumbnail, you need to **clear the cache** on each platform:

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
- Open Graph image: `/og-image.svg` (1200x630)
- Twitter Card: `summary_large_image`
- No references to bolt.new remain in the codebase

Once caches are cleared, all shares will show McFun branding.
