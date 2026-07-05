/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // self-contained server bundle → tiny Docker image, runs anywhere (Linux/Windows,
  // Docker, Kubernetes) with just `node server.js`. No effect on Vercel.
  output: "standalone",
  // jimp (avatar perceptual hashing) is a server-only dep — keep it external
  // so it isn't bundled/transformed into the serverless function output.
  experimental: {
    serverComponentsExternalPackages: ["jimp"],
  },
};

export default nextConfig;
