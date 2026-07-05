/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@job-scraper/database",
    "@job-scraper/shared"
  ]
};

export default nextConfig;
