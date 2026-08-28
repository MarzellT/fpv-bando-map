import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  // Type-aware linting: rules that need the type checker, not just the syntax tree.
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Spot descriptions in bandos.json carry hand-written HTML (links, <strong>),
      // rendered through innerHTML by design. The data is authored in this repo,
      // never user input, so the sink is trusted.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // Interpolating a number into a string is unambiguous and used throughout
      // for coordinates and distances.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  // This config file is plain JS run by ESLint itself, so it sits outside the
  // app's tsconfig and can't be type-checked against it. Kept as its own entry
  // so disableTypeChecked's parserOptions reset isn't overwritten below.
  { files: ['**/*.js'], ...tseslint.configs.disableTypeChecked },
  { files: ['**/*.js'], languageOptions: { globals: globals.node } },
  prettier,
);
