# Travel Planner - GitHub Pages Deployment Guide

## Prerequisites
- Git installed on your machine
- GitHub account
- Node.js 18+ installed

## Deployment Steps

### Option 1: Automatic Deployment (Recommended)

1. **Create a GitHub Repository**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Travel Planner App"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/travel-planner.git
   git push -u origin main
   ```

2. **Enable GitHub Pages**
   - Go to your repository on GitHub
   - Click **Settings** → **Pages**
   - Under "Build and deployment":
     - Source: Select "GitHub Actions"
     - Click Save

3. **The workflow will automatically deploy**
   - Every push to `main` branch triggers automatic deployment
   - Check the "Actions" tab to see deployment progress
   - Your site will be live at: `https://YOUR_USERNAME.github.io/travel-planner`

### Option 2: Manual Deployment

1. **Build the static site locally**
   ```bash
   npm run export
   ```

2. **Create a `gh-pages` branch**
   ```bash
   git checkout --orphan gh-pages
   git reset --hard
   ```

3. **Copy the build output**
   ```bash
   git checkout main
   cp -r out/* .
   git add .
   git commit -m "Deploy to GitHub Pages"
   git push origin gh-pages
   ```

4. **Enable GitHub Pages on gh-pages branch**
   - Go to your repository on GitHub
   - Click **Settings** → **Pages**
   - Under "Build and deployment":
     - Source: Select "Deploy from a branch"
     - Branch: Select `gh-pages`
     - Click Save

## Verification

1. Go to your repository **Actions** tab to monitor deployment status
2. Once green checkmark appears, your site is live at:
   - `https://YOUR_USERNAME.github.io/travel-planner`

## Important Notes

- **Local Data Storage**: The app uses IndexedDB to store all data locally in the browser. Each user's browser has its own database.
- **Data Persistence**: Data persists across sessions within the same browser/device
- **Export/Import**: Use the backup feature to export trips and import them on different devices
- **No Server Backend**: This is a fully client-side application

## Troubleshooting

### Site not showing up?
- Wait 5-10 minutes for GitHub Pages to build
- Clear browser cache (Ctrl+Shift+Delete)
- Check Actions tab for build errors

### 404 errors on other pages?
- This is expected with GitHub Pages URL structure
- The app uses client-side routing which handles this automatically

### Data not showing after deployment?
- Check browser's IndexedDB in DevTools
- Data is browser-specific and won't sync across devices
- Use export/import feature to sync between devices

## Updating Your Deployment

Simply commit and push changes to the `main` branch:
```bash
git add .
git commit -m "Your message"
git push origin main
```

The GitHub Actions workflow will automatically rebuild and deploy.

## Custom Domain (Optional)

To use a custom domain:
1. Add a `CNAME` file in the root with your domain
2. Update your domain's DNS settings (see GitHub Pages docs)

---

For more help, see [GitHub Pages Documentation](https://docs.github.com/en/pages)
