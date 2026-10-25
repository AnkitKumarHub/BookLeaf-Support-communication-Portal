// Demo-only UI, off unless the env says "true". Written out in full so Next.js
// inlines them at build time. The API has its own matching switches.
export const DEMO_LOGINS = process.env.NEXT_PUBLIC_DEMO_LOGINS === "true";
export const DEMO_SELF_SERVICE = process.env.NEXT_PUBLIC_DEMO_SELF_SERVICE === "true";
