/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // postgres.js (agent store, risk_agent role) must stay a Node require: webpack can't bundle it.
    serverComponentsExternalPackages: ["postgres"],
    // addDemoDocument reads data/demo at runtime; ship those files with the page that calls it on Vercel.
    outputFileTracingIncludes: { "/documents": ["./data/demo/**"] },
  },
};

export default nextConfig;
