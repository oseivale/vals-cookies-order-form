import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Next.js 16 removed the `next lint` command in favor of the plain ESLint
// CLI (`npx eslint .` / `npm run lint`), which requires this flat-config
// file instead of the old .eslintrc.json format.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // We use plain <img> tags for the logo (a small local SVG) rather
      // than next/image, which is unnecessary overhead for a static
      // vector icon — this rule exists to flag unoptimized raster photos.
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
