/** @type {import('next').NextConfig} */
const nextConfig = {
  // GitHub Pages only serves static files, so the site is exported to ./out.
  output: 'export',
  // Emits /out-of-work/index.html so directory URLs resolve without a rewrite,
  // which is what Pages needs (it has no Next.js server to fall back on).
  trailingSlash: true,
  images: {
    // next/image optimisation needs a running server; export has none.
    unoptimized: true,
  },
  // There is another lockfile further up the directory tree; pin the workspace
  // root so the build always resolves modules from this project.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
