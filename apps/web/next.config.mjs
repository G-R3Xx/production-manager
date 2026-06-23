/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "60mb",
      allowedOrigins: [
        "localhost:3000",
        "production-manager-web.vercel.app"
      ]
    }
  }
};

export default nextConfig;
