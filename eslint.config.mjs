import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Règles de sécurité du plan (section « Sécurité applicative »)
  {
    rules: {
      "no-restricted-properties": [
        "error",
        { property: "$queryRawUnsafe", message: "Interdit : utilise $queryRaw en template balisé." },
        { property: "$executeRawUnsafe", message: "Interdit : utilise $executeRaw en template balisé." },
      ],
      "react/no-danger": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^NEXT_PUBLIC_/]",
          message: "Aucune variable NEXT_PUBLIC_ : les secrets restent côté serveur.",
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "reports/**", "next-env.d.ts", "generated/**"]),
]);

export default eslintConfig;
