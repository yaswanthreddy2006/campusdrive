# KARE Campus Shuttle Pooling App - Vercel Deployment Guide

This project uses Next.js 14, Prisma, and PostgreSQL. Vercel detects the Next.js app automatically; no custom output directory or `vercel.json` is needed.

## 1. Required Environment Variables

Add these under **Project Settings > Environment Variables** in Vercel. Apply them to the appropriate environments (Production, Preview, and Development).

| Variable Name | Description | Example / Required Value |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string from your database provider | Use the provider's connection string; prefer its pooled/serverless URL for application traffic |
| `NEXTAUTH_SECRET` | Secret used to encrypt NextAuth sessions | Generate a unique secret, for example with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Canonical URL of the deployed app | `https://your-project.vercel.app` (or your custom domain) |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID for student login | `123456789-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | `GOCSPX-xyz123abc` |

Do not use the sample values from `.env.example` in production. Keep database and OAuth credentials out of source control.

## 2. Initialize the Database

The repository currently has a Prisma schema but no checked-in migration history. Before the first deployment, set `DATABASE_URL` locally to the production database and apply the current schema:

```bash
npx prisma db push
```

After deployment, initialize campus locations using the seed endpoint if needed:

```bash
curl -X POST https://your-project.vercel.app/api/locations/seed
```

For subsequent schema changes, create and commit Prisma migrations and use `prisma migrate deploy` rather than relying on repeated production `db push` runs.

## 3. Vercel Project Settings

Import the repository into Vercel and keep the detected **Next.js** framework preset and default build settings. The `npm run build` script generates Prisma Client and runs `next build`; Vercel uses this script automatically. Leave the output directory at its default.

## 4. Google OAuth

In Google Cloud Console, add the deployed domain's callback URL under **Authorized redirect URIs**:

```text
https://your-project.vercel.app/api/auth/callback/google
```

Add the equivalent callback URL for any custom domain and ensure the OAuth consent screen is configured for the intended users.

## 5. Realtime Deployment Note

Realtime updates currently use a process-local in-memory event bus and a Server-Sent Events endpoint. Vercel may run API requests in separate serverless instances, so events emitted by one request are not guaranteed to reach clients connected to another instance; streaming connections are also subject to the function duration limits of the selected Vercel plan. Use a shared realtime provider or a polling fallback before relying on realtime updates in production.
