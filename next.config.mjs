// Khi deploy lên GitHub Pages dạng https://<user>.github.io/<repo>/,
// workflow sẽ đặt NEXT_PUBLIC_BASE_PATH="/<repo>".
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
};

export default nextConfig;
