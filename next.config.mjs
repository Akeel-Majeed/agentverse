/** @type {import('next').NextConfig} */
const nextConfig = {
  // postgres.js (agent store, risk_agent role) must stay a Node require: webpack can't bundle it.
  experimental: { serverComponentsExternalPackages: ["postgres"] },
};

export default nextConfig;
