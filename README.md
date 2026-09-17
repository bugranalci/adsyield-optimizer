This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Cloudflare Access (MFA)

Wizard is served at `wizard.ops-adsyield.com` behind Cloudflare Access — the same
Google Workspace login, operator allowlist and WebAuthn MFA as `portal.ops-adsyield.com`
(see the `adsyield-access-portal` repo, `docs/CLOUDFLARE_SETUP.md`). The Wizard
sign-in stays as a second layer.

`src/middleware.ts` verifies the `Cf-Access-Jwt-Assertion` JWT (issuer, audience, signature)
on every request, so the Vercel origin cannot be reached around Access: requests to any
other hostname (`wizard.adsyield.com`, `*.vercel.app`) are redirected to
`wizard.ops-adsyield.com`, and requests on that hostname without a valid token get 403.
Two paths stay outside the gate: the Limelight IVT pixel `/api/ivt/pixel`
(fired from outside, keeps working on `wizard.adsyield.com` without redirect) and Vercel
cron calls that carry `Authorization: Bearer $CRON_SECRET` (`CRON_SECRET` must be set in
Vercel, or the nightly crons are blocked). The gate is off when all three `CF_ACCESS_*` variables are unset, and fails closed (503)
when only some are set.

Setup order (the gate must be switched on last, or Wizard locks everyone out):

1. Vercel → Domains → add `wizard.ops-adsyield.com`. In the Cloudflare `ops-adsyield.com`
   zone add the CNAME Vercel shows, **DNS only** until Vercel shows the domain valid with a
   certificate, then switch it to **Proxied**. Zone SSL/TLS mode must be **Full (strict)**.
2. Zero Trust → Access → Applications → Self-hosted: `wizard`, hostname
   `wizard.ops-adsyield.com`, policy `Allow approved Adsyield privileged operators`,
   Google Workspace login only, MFA = Biometrics + Security key, authentication duration
   `0m`. Copy the Application Audience (AUD) tag. Add a second self-hosted app
   `WIZARD ACME CHALLENGE` on `wizard.ops-adsyield.com/.well-known/acme-challenge`
   with a **Bypass / Everyone** policy so Vercel can renew the certificate.
3. Vercel env (Production + Preview): `CF_ACCESS_TEAM_DOMAIN=https://adsyield.cloudflareaccess.com`,
   `CF_ACCESS_AUD=<AUD tag>`, `CF_ACCESS_APP_HOST=wizard.ops-adsyield.com` → redeploy.
