/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@job-aggregator/database",
    "@job-aggregator/shared"
  ]
};

export default nextConfig;
