import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist ships a worker that must not be bundled for the server build.
  serverExternalPackages: ["pdfjs-dist", "tesseract.js", "@napi-rs/canvas"],
};

export default nextConfig;
