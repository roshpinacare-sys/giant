// Module-local eslint (giant trunk has no root node_modules — standalone units
// lint themselves; core typescript-eslint rules mirror the trunk's intent).
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  { ignores: ["node_modules/**", "state/**"] },
);
