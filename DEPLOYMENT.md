# 🚀 BEME Agency - Deployment Guide

## Current Setup
- **Repository:** Github (beme-agency)
- **Hosting:** Netlify (https://bemeagency.netlify.app)
- **CI/CD:** Automatic on each push to `main` branch

## Local Development

### Prerequisites
- Git installed
- Node.js (for Netlify Functions if needed)
- Github account
- Netlify account connected to Github

### Getting Started
```bash
# Clone the repository
git clone https://github.com/tu-usuario/beme-agency.git
cd beme-agency

# No build step needed - just open index.html locally
# Or use VS Code Live Server extension
```

## Making Changes

### Workflow
1. Create a feature branch (optional but recommended)
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes to HTML/CSS/JS files

3. Test locally using Live Server or opening HTML files directly

4. Commit your changes
   ```bash
   git add .
   git commit -m "Description of changes"
   ```

5. Push to Github
   ```bash
   git push origin main  # or git push origin feature/your-feature-name
   ```

6. If you pushed to a feature branch, create a Pull Request on Github

7. **Netlify automatically deploys the `main` branch** - your changes go live within 1-2 minutes!

## Environment Variables

### Local Development
Create a `.env.local` file (not tracked by Git):
```
APIFY_TOKEN=your_token_here
SUPABASE_URL=https://ngstqwbzvnpggpklifat.supabase.co
SUPABASE_ANON_KEY=sb_publishable_1E2K-9D-KzOSVCgROnfa-g_-WCnWCDb
```

### Production (Netlify)
Set in **Netlify Dashboard** → **Site Settings** → **Build & deploy** → **Environment**:
- `APIFY_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Viewing Deploys

### Netlify Dashboard
1. Go to https://app.netlify.com
2. Select the `beme-agency` site
3. View deployment history, logs, and status

### Live Site
- Production: https://bemeagency.netlify.app
- Preview URLs available for each deploy

## Netlify Functions

API endpoints are in `netlify/functions/`:
- `apify-scraper.js` - TikTok/Instagram scraping
- `fetch-profile-photo.js` - Profile photo retrieval

These are automatically deployed with the site. Access via:
```
https://bemeagency.netlify.app/.netlify/functions/function-name
```

## Troubleshooting

### Deploy failed?
1. Check Netlify build logs: Site → Deploys → Recent deploy → Deploy log
2. Common issues:
   - Missing environment variables
   - Netlify Functions syntax errors
   - Storage bucket configuration in Supabase

### Changes not live?
1. Wait 1-2 minutes for deployment to complete
2. Hard refresh browser (Cmd+Shift+R on Mac)
3. Check Netlify Dashboard for active deployments

### Local testing before pushing
- Open HTML files directly with Live Server
- Test all features in browser dev tools
- Check console for errors

## Git Best Practices

### Before pushing to main
```bash
git status          # See what changed
git diff            # Review exact changes
git log -n 5        # See recent commits
```

### Branch management
```bash
git branch -a       # List all branches
git checkout -b new-feature  # Create feature branch
git checkout main   # Switch back to main
git branch -d old-feature    # Delete branch
```

### If you mess up
```bash
git reset --hard HEAD~1  # Undo last commit (careful!)
git revert HEAD          # Create new commit that undoes changes (safer)
```

## Deployment Checklist

- [ ] Changes tested locally
- [ ] `.env` file NOT committed (use `.env.example` for reference)
- [ ] No console errors in browser DevTools
- [ ] Netlify.toml is correct
- [ ] All images/assets exist
- [ ] Supabase RLS policies allow expected access
- [ ] Commit message is descriptive
- [ ] Ready to `git push`

---

**Questions?** Check CLAUDE.md for project overview and API details.
