// ESLint ловит ошибки хуков React и явные баги, а не навязывает стиль.
// npm run lint: ошибки валят CI, предупреждения — повод поправить при случае.
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["dist/**", "dist.next/**", "server/public/**", "output/**", "uploads/**", "mobile/**", "script/.tmp/**"],
  },
  {
    files: ["client/src/**/*.{ts,tsx}", "server/**/*.ts", "shared/**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Хуки вне компонента или под условием ломают состояние React — это всегда ошибка.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // any в коде принят (≈200 мест); ужесточать по мере правок модулей.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true },
      ],
      // declare global { namespace Express … } — штатное расширение типов Express.
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
      // Неразрывные пробелы в суммах («1 000 ₽») стоят в строках намеренно.
      "no-irregular-whitespace": ["error", { skipStrings: true, skipTemplates: true, skipRegExps: true }],
      // Стиль, а не баги: показываем, но не валим проверку.
      "no-useless-assignment": "warn",
      "no-extra-boolean-cast": "warn",
      "no-useless-escape": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/no-require-imports": "warn",
    },
  },
);
