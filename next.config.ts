import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required by DevOps for Cloud Run light-shell Docker images
  output: "standalone",
  serverExternalPackages: ["pdfkit", "docx"],
};

export default nextConfig;
