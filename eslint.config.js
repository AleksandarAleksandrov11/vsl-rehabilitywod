import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/',
      '.vercel/',
      '.astro/',
      'node_modules/',
      'qa/',
      'test-results/',
      'playwright-report/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['apps-script/**/*.gs', 'apps-script/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        SpreadsheetApp: 'readonly',
        PropertiesService: 'readonly',
        LockService: 'readonly',
        ContentService: 'readonly',
        MailApp: 'readonly',
        Utilities: 'readonly',
        Session: 'readonly',
        Logger: 'readonly',
      },
    },
    // doPost, doGet y testLead los invoca Google (no el propio archivo); la regex de control es
    // intencionada (limpia caracteres de control).
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-control-regex': 'off',
    },
  },
];
