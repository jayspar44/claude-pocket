import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
      },
      sourceType: 'commonjs',
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Allow control characters in regex - needed for ANSI escape code stripping
      'no-control-regex': 'off',
    },
  },
  {
    ignores: ['node_modules/**'],
  },
];
