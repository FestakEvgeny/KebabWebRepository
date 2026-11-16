import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'data'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['frontend/**/*.js'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Modular monolith boundaries (see README, "Module boundaries"):
  // - composition (app.ts, server.ts, api/, database/) may use everything;
  // - every module builds on the shared kernel;
  // - cross-module use goes one way and only via the target's public API
  //   (modules/<name>/index.ts): rating -> shop, admin -> shop + rating.
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      // Let the boundaries rules resolve extensionless TypeScript imports.
      'import/resolver': { typescript: { alwaysTryTypes: true } },
      // Elements must be disjoint; src root files (app.ts, server.ts) are
      // covered by the composition-root file category below. Patterns match
      // folders, so every file inside is part of the same element instance.
      'boundaries/elements': [
        { type: 'module', pattern: 'src/modules/*', capture: ['moduleName'] },
        { type: 'shared', pattern: 'src/shared' },
        { type: 'composition', pattern: ['src/api', 'src/database'] },
      ],
      'boundaries/files': [{ pattern: 'src/*.ts', category: 'composition-root' }],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            // The composition layer (app.ts, server.ts, api/, database/) wires
            // everything together.
            {
              from: { element: { type: 'composition' } },
              allow: {
                to: [
                  { element: { type: 'shared' } },
                  { element: { type: 'composition' } },
                  { element: { type: 'module' } },
                  { file: { categories: 'composition-root' } },
                ],
              },
            },
            {
              from: { file: { categories: 'composition-root' } },
              allow: {
                to: [
                  { element: { type: 'shared' } },
                  { element: { type: 'composition' } },
                  { element: { type: 'module' } },
                  { file: { categories: 'composition-root' } },
                ],
              },
            },
            // Every module builds on the shared kernel.
            {
              from: { element: { type: 'module' } },
              allow: { to: { element: { type: 'shared' } } },
            },
            {
              from: { element: { type: 'module', captured: { moduleName: 'rating' } } },
              to: { element: { type: 'module', captured: { moduleName: 'shop' } } },
              allow: { to: { element: { fileInternalPath: 'index.ts' } } },
              message:
                'The rating module may use the shop module only via its public API (modules/shop/index.ts).',
            },
            {
              // Nest DI wiring only: ShopModule imports RatingModule (as a
              // forwardRef pair) so the ratings-reader port can be provided to
              // the shop module by the container. Services themselves stay
              // one-way through the ports.
              from: {
                element: {
                  type: 'module',
                  captured: { moduleName: 'shop' },
                  fileInternalPath: 'shop.module.ts',
                },
              },
              to: { element: { type: 'module', captured: { moduleName: 'rating' } } },
              allow: { to: { element: { fileInternalPath: 'index.ts' } } },
              message:
                'The shop module wiring (shop.module.ts) may use the rating module only via its public API (modules/rating/index.ts).',
            },
            {
              from: { element: { type: 'module', captured: { moduleName: 'admin' } } },
              to: { element: { type: 'module', captured: { moduleName: ['shop', 'rating'] } } },
              allow: { to: { element: { fileInternalPath: 'index.ts' } } },
              message:
                'The admin module may orchestrate the {{ to.element.captured.moduleName }} module only via its public API (modules/<name>/index.ts).',
            },
          ],
        },
      ],
    },
  },
);
