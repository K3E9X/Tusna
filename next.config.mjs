/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // jimp (avatar perceptual hashing) is a server-only dep — keep it external
  // so it isn't bundled/transformed into the serverless function output.
  experimental: {
    serverComponentsExternalPackages: ["jimp"],
  },
};

export default nextConfig;
