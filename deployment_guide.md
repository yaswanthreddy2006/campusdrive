# KARE Campus Shuttle Pooling App - Production Deployment Guide

Guide for deploying the Kalasalingam Academy Campus Shuttle Pooling application built with Next.js 14 App Router, Prisma ORM, and Neon PostgreSQL to **Vercel**.

---

## 1. Required Environment Variables

Configure the following environment variables in your Vercel Project Settings (**Settings > Environment Variables**):

| Variable Name | Description | Example / Required Value |
| :--- | :--- | :--- |
| `DATABASE_URL` | Neon PostgreSQL pooled connection string | `postgresql://neondb_owner:pass@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require` |
| `NEXTAUTH_SECRET` | Cryptographically random string for session encryption | Run `openssl rand -base64 32` or set a long secret key |
| `NEXTAUTH_URL` | Canonical URL of your Vercel production domain | `https://kare-shuttle.vercel.app` (or custom domain) |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID for student login | `123456789-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | `GOCSPX-xyz123abc` |

---

## 2. Prisma Database Schema Migration Commands

Before or during your initial Vercel deployment, synchronize your Prisma database schema with Neon PostgreSQL:

### Command to Push Schema directly to Neon DB:
```bash
npx prisma db push
```

### Command to Seed Initial KARE Campus Locations:
Run the built-in seed route after initial deployment or locally:
```bash
curl -X POST https://kare-shuttle.vercel.app/api/locations/seed
```

---

## 3. Vercel Build Settings & Commands

Configure Vercel project build parameters in Vercel Dashboard (**Settings > Build & Development Settings**):

- **Framework Preset**: `Next.js`
- **Build Command**:
  ```bash
  npx prisma generate && next build
  ```
- **Output Directory**: `.next` (default)
- **Install Command**:
  ```bash
  npm install
  ```

---

## 4. Step-by-Step Vercel Deployment Instructions

1. **Push Codebase to GitHub/GitLab**:
   Ensure all project files, `prisma/schema.prisma`, and `package.json` are committed to your Git repository.

2. **Import Project to Vercel**:
   - Log into [Vercel Console](https://vercel.com).
   - Click **Add New > Project** and select your `mainproject` repository.

3. **Configure Environment Variables**:
   Add `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` under Vercel environment settings.

4. **Deploy**:
   Click **Deploy**. Vercel will run `npx prisma generate && next build` and generate your production application edge deployment.

5. **Configure Google OAuth Authorized Redirect URI**:
   In Google Cloud Console under APIs & Services > Credentials:
   Add Authorized Redirect URI: `https://kare-shuttle.vercel.app/api/auth/callback/google`.
