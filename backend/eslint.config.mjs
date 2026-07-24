import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Backend ESLint (flat config).
 *
 * The backend's primary static-analysis gate is strict `tsc` (`npm run
 * typecheck`); this adds lint coverage on top. Rules that conflict with
 * long-standing, intentional patterns in this codebase are relaxed rather than
 * triggering a codebase-wide refactor:
 *   - `no-explicit-any`: used deliberately for the `Express.Request.user`
 *     augmentation and the in-memory Prisma test doubles.
 *   - `no-require-imports`: the integration tests swap the Prisma singleton via
 *     `require.cache`, and the JS runner/scripts are CommonJS.
 *   - unused vars prefixed with `_` are intentional (ignored args).
 *   - empty `catch {}` blocks are an intentional "skip and continue" pattern in
 *     the savings compute paths.
 */
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      // The `Express.Request` augmentation legitimately uses `namespace` — the
      // standard way to extend Express's request typing.
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // The JS tooling scripts are plain CommonJS Node files.
    files: ['scripts/**/*.js', '*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
);
