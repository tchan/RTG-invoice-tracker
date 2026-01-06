# RTG Invoice Tracker

A web application for uploading and managing Excel invoice spreadsheets with distance calculation features.

## Features

- Upload multiple Excel invoice files
- Combine and filter invoices by Lesson Date and Client Name
- Calculate total amounts from merged cells
- Calculate kilometers driven using OpenRouteService API
- Manage home and client addresses
- Filter and sort invoice data

## Deployment to Vercel

### Quick Deploy

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Link to existing project or create new
   - Confirm project settings
   - Deploy!

3. **For production deployment**:
   ```bash
   vercel --prod
   ```

### Alternative: Deploy via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New Project"
3. Import your Git repository (GitHub, GitLab, or Bitbucket)
4. Vercel will auto-detect Next.js and configure it
5. Click "Deploy"

## Environment Variables

No environment variables are required. The OpenRouteService API key is stored in browser localStorage and set via the Settings page.

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build

```bash
npm run build
npm start
```
