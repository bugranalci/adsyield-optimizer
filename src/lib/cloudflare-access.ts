import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/**
 * Cloudflare Access gate. Access (Google Workspace + WebAuthn MFA) sits in front of
 * the Access hostname and forwards a signed JWT in `Cf-Access-Jwt-Assertion`. Verifying
 * it here closes the bypass through hostnames Cloudflare does not proxy
 * (wizard.adsyield.com, *.vercel.app, or a spoofed Host header straight to Vercel).
 */
export type AccessConfig = {
  /** e.g. https://adsyield.cloudflareaccess.com — also the JWT issuer. */
  teamDomain: string;
  /** Application Audience (AUD) tag of the Wizard Access application. */
  aud: string;
  /** Hostname protected by Access, e.g. wizard.ops-adsyield.com. */
  appHost: string;
};

export type AccessIdentity = { email: string };

export const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

/**
 * `null` when none of the variables are set (local development, gate off).
 * `"misconfigured"` when only some are set or values are invalid — callers must fail closed.
 */
export function accessConfig(
  env: Record<string, string | undefined> = process.env
): AccessConfig | null | "misconfigured" {
  const { CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD, CF_ACCESS_APP_HOST } = env;
  if (!CF_ACCESS_TEAM_DOMAIN && !CF_ACCESS_AUD && !CF_ACCESS_APP_HOST) return null;
  if (!CF_ACCESS_TEAM_DOMAIN || !CF_ACCESS_AUD || !CF_ACCESS_APP_HOST) return "misconfigured";
  let teamDomain: URL;
  try {
    teamDomain = new URL(CF_ACCESS_TEAM_DOMAIN);
  } catch {
    return "misconfigured";
  }
  if (teamDomain.protocol !== "https:" || !/^[a-z0-9.-]+$/i.test(CF_ACCESS_APP_HOST)) {
    return "misconfigured";
  }
  return {
    teamDomain: CF_ACCESS_TEAM_DOMAIN.replace(/\/+$/, ""),
    aud: CF_ACCESS_AUD,
    appHost: CF_ACCESS_APP_HOST.toLowerCase(),
  };
}

const jwksCache = new Map<string, JWTVerifyGetKey>();

function remoteKeys(teamDomain: string): JWTVerifyGetKey {
  let keys = jwksCache.get(teamDomain);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, keys);
  }
  return keys;
}

/** Returns the authenticated identity, or null for a missing/invalid/expired token. */
export async function verifyAccessJwt(
  token: string | null | undefined,
  config: AccessConfig,
  keys: JWTVerifyGetKey = remoteKeys(config.teamDomain)
): Promise<AccessIdentity | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: config.teamDomain,
      audience: config.aud,
      algorithms: ["RS256"],
    });
    // User logins carry `email`; Access service tokens carry `common_name` instead.
    const email = payload.email ?? payload.common_name;
    return typeof email === "string" && email ? { email } : null;
  } catch {
    return null;
  }
}
