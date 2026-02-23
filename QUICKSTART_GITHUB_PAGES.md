# 🚀 GitHub Pages Deployment - Quick Start

## What's Been Prepared

✅ **next.config.js** - Configured for static export  
✅ **package.json** - Added export and deploy scripts  
✅ **.github/workflows/deploy.yml** - Automatic CI/CD pipeline  
✅ **DEPLOYMENT.md** - Detailed deployment guide  

## 5-Minute Setup

### Step 1: Initialize Git (if not already done)
```bash
cd travel-planner
git init
```

### Step 2: Create GitHub Repository
- Go to https://github.com/new
- Repository name: `travel-planner`
- Make it **Public**
- Click "Create repository"

### Step 3: Push Your Code
```bash
git add .
git commit -m "Initial commit: Travel Planner"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/travel-planner.git
git push -u origin main
```

### Step 4: Enable GitHub Pages
1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Under "Build and deployment", select **GitHub Actions**
4. Click **Save**

### Step 5: Done! 🎉
- Wait 1-2 minutes for deployment
- Your site is at: `https://YOUR_USERNAME.github.io/travel-planner`
- Check **Actions** tab to monitor progress

## After Deployment

- **Make changes** → `git add .` → `git commit -m "message"` → `git push`
- **Automatic deployment** happens on every push
- **Check Actions tab** to verify deployment succeeded

## Testing Locally Before Deploy

```bash
# Build static export
npm run export

# This creates an 'out' folder with your static site
# You can open out/index.html in browser to test
```

## Key Files Modified

| File | Purpose |
|------|---------|
| `next.config.js` | Static export configuration |
| `package.json` | Export and deploy scripts |
| `.github/workflows/deploy.yml` | Automatic GitHub Actions |
| `DEPLOYMENT.md` | Detailed deployment guide |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Actions fail | Check npm versions in workflow |
| 404 errors | Clear cache, wait for rebuild |
| Data not showing | Data is browser-local, check IndexedDB |
| Site blank | Check Actions logs for build errors |

---

**Need help?** See [DEPLOYMENT.md](./DEPLOYMENT.md) for full details.
