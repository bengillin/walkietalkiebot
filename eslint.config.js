import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  // Ignore generated output, deps, build artifacts, and the marketing site
  // (the site has its own tooling).
  {
    ignores: [
      'dist/',
      'node_modules/',
      'mcp-server/node_modules/',
      'mcp-server/dist/',
      // server/**/*.js and *.test.js are compiled from TS by build:server
      'server/**/*.js',
      'site/',
      'coverage/',
      'test-results/',
      'playwright-report/',
      '**/*.config.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  // Shared TS rules. Unused vars are downgraded to warnings and allow the
  // conventional leading-underscore opt-out; tsc already enforces noUnusedLocals.
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Frontend: browser globals + React fast-refresh/hooks rules.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Server, MCP server, scripts, bin: Node globals.
  {
    files: [
      'server/**/*.ts',
      'mcp-server/**/*.ts',
      'scripts/**/*.js',
      'bin/**/*.js',
      'e2e/**/*.ts',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
)
