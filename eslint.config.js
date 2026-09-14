import js from '@eslint/js';
import ts from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default ts.config(
  { ignores: ['dist', 'node_modules', 'supabase/functions'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    // The service worker is not page code: it has its own globals and its own
    // lifecycle, and linting it as a browser script reported every one of them
    // as undefined.
    files: ['public/sw.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.serviceworker } },
    rules: {
      // a catch that deliberately ignores the error is how a worker survives
      // a file it cannot fetch
      '@typescript-eslint/no-unused-vars': ['warn', { caughtErrorsIgnorePattern: '^_' }],
      'no-useless-assignment': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // vibe-coded pragmatics — relax the noisiest rules, keep the ones that catch real bugs
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
