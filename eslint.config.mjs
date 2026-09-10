import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "backend/**",
      "notification-services/**",
      "node_modules/**",
      "next-env.d.ts",
      "eslint-report.json",
    ],
  },
  {
    rules: {
      // Pre-existing <img> usage across the catalog UI — don't block CI.
      "@next/next/no-img-element": "off",
      // react-hooks v7 flag; widespread in auth/session bootstrap. Treat as warn
      // until those flows are refactored off sync setState-in-effect.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
