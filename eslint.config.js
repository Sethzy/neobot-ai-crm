import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    '.next/**',
    '.trigger/**',
    '.claude/**',
    'demo-video/**',
    '.agents/skills/**',
    'scripts/spike/**',
    'next-env.d.ts',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: [
      'app/api/**/*.{ts,tsx}',
      'middleware.ts',
      'next.config.ts',
      'src/lib/**/*.{ts,tsx}',
      'src/trigger/**/*.{ts,tsx}',
      'supabase/**/*.{ts,tsx}',
      'tests/**/*.{ts,tsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: [
      'src/components/**/*.{ts,tsx}',
      'src/contexts/**/*.{ts,tsx}',
      'src/hooks/**/*.{ts,tsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
])
