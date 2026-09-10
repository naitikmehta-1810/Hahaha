import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Minimal backend lint — catch obvious issues without blocking on style. */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**", "scripts/**", "tmp-*.txt"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "off",
      "prefer-const": "warn",
    },
  }
);
