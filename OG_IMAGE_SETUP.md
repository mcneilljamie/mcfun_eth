# Social Sharing (OG Image) Setup

The site now displays McFun branding when shared on social media platforms.

## What Was Changed

1. **index.html** - Updated meta tags for social sharing:
   - Open Graph tags (Facebook, LinkedIn, etc.)
   - Twitter Card tags
   - Added proper title, description, and image references

2. **public/og-image.svg** - Created McFun branded image with:
   - MF logo on dark gradient background
   - "McFun" title
   - "Launch Your Token" tagline
   - Dimensions: 1200x630 (standard OG image size)

3. **public/generate-og-image.html** - HTML template for generating PNG version

## Current Status

✅ The SVG image works with most modern social platforms (Twitter, LinkedIn, Facebook)
✅ All meta tags are properly configured
✅ Build includes all necessary files

## Optional: Create PNG Version

While the SVG works well, if you need a PNG version for maximum compatibility:

### Option 1: Screenshot Method
1. Open `public/generate-og-image.html` in your browser
2. Take a screenshot at exactly 1200x630 pixels
3. Save as `public/og-image.png`
4. Update meta tags in `index.html` to reference `.png` instead of `.svg`

### Option 2: Automated (requires puppeteer)
1. Install puppeteer: `npm install --save-dev puppeteer`
2. Edit `generate-og-image.js` and uncomment the code
3. Run: `node generate-og-image.js`
4. Update meta tags in `index.html` to reference `.png` instead of `.svg`

## Testing

Test your social sharing at:
- Twitter: Share your URL and check the preview
- Facebook: Use their [Sharing Debugger](https://developers.facebook.com/tools/debug/)
- LinkedIn: Use their [Post Inspector](https://www.linkedin.com/post-inspector/)

Note: After making changes, you may need to clear the cache on these platforms using their debugging tools.
