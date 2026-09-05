import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist ships a worker that must not be bundled for the server build.
  serverExternalPackages: ["pdfjs-dist", "tesseract.js", "@napi-rs/canvas"],
  // Externalizing pdfjs-dist (above) keeps webpack/Turbopack from touching it,
  // but Vercel's separate file-tracer (@vercel/nft) decides what actually
  // ships in the deployed function by statically following imports — and
  // pdf.mjs loads its own worker (pdf.worker.mjs) via a dynamic import nft
  // can't see. Without this, the worker file is silently missing in
  // production, and every upload fails with "Setting up fake worker failed:
  // Cannot find module '.../pdf.worker.mjs'" even though it works locally.
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/pdfjs-dist/legacy/build/**",
      "./node_modules/pdfjs-dist/standard_fonts/**",
    ],
  },
};

export default nextConfig;
