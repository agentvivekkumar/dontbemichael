import reactHooks from 'eslint-plugin-react-hooks';
import { parser as tsParser, plugin as tsPlugin } from 'typescript-eslint';

/**
 * ESLint grows one rule at a time. The integration started with no rules;
 * everything below is a rule that already passed on the whole tree before it
 * was turned on. That keeps `npm run lint` green from the first commit and
 * means enabling a rule never drags a cleanup into an unrelated change.
 *
 * To find the next rule to enable, run `npm run lint:rules`. It lints the tree
 * with every usable rule turned on and reports which ones report zero problems.
 * Add a clean rule to the `rules` blocks below. A rule that still reports
 * problems, or that only passes because an `eslint-disable` comment hides it,
 * stays off until the cleanup lands in a change that is only about that rule.
 *
 * Type-aware rules are not in the report yet: they need parser services, which
 * means adding `parserOptions.projectService` to the TypeScript block first.
 *
 * Formatting is intentionally not part of this file: the project has no
 * formatter and CONTRIBUTING.md asks reviewers to reject whitespace churn.
 *
 * The first batch below was enabled on 2026-10-20 after `npm run lint:rules`
 * showed every one of them clean.
 */

const SOURCE_FILES = ['**/*.{js,mjs,cjs,ts,tsx}'];
const TS_FILES = ['**/*.{ts,tsx}'];

export default [
  {
    // Generated output, vendored assets, and separate projects with their own
    // toolchains. `blog` and `landing-remotion` each have a package.json and are
    // built on their own; `prototypes` is scratch code that is not shipped.
    ignores: [
      'node_modules/**',
      'out/**',
      'dist/**',
      'docs/**',
      'branding/**',
      'prototypes/**',
      'blog/**',
      'landing-remotion/**'
    ]
  },
  {
    files: SOURCE_FILES,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    // Registering a plugin does not enable its rules. It makes the
    // `eslint-disable` directives already in the tree resolvable; a directive
    // that names an unregistered plugin is a lint error.
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks
    },
    linterOptions: {
      // Every directive is "unused" while the rules they name are off. Turn
      // this back on once the enabled set covers the directives in the tree.
      reportUnusedDisableDirectives: 'off'
    },
    rules: {
      // Mistakes the parser cannot catch.
      'array-callback-return': 'error',
      'constructor-super': 'error',
      'for-direction': 'error',
      'getter-return': 'error',
      'guard-for-in': 'error',
      'no-async-promise-executor': 'error',
      'no-case-declarations': 'error',
      'no-class-assign': 'error',
      'no-compare-neg-zero': 'error',
      'no-cond-assign': 'error',
      'no-const-assign': 'error',
      'no-constant-binary-expression': 'error',
      'no-constant-condition': 'error',
      'no-constructor-return': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-else-if': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty-character-class': 'error',
      'no-empty-pattern': 'error',
      'no-empty-static-block': 'error',
      'no-ex-assign': 'error',
      'no-fallthrough': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-invalid-regexp': 'error',
      'no-iterator': 'error',
      'no-loss-of-precision': 'error',
      'no-misleading-character-class': 'error',
      'no-new-native-nonconstructor': 'error',
      'no-nonoctal-decimal-escape': 'error',
      'no-obj-calls': 'error',
      'no-octal': 'error',
      'no-octal-escape': 'error',
      'no-redeclare': 'error',
      'no-self-compare': 'error',
      'no-setter-return': 'error',
      'no-shadow-restricted-names': 'error',
      'no-sparse-arrays': 'error',
      'no-this-before-super': 'error',
      'no-unassigned-vars': 'error',
      'no-unexpected-multiline': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable': 'error',
      'no-unreachable-loop': 'error',
      'no-unsafe-finally': 'error',
      'no-unsafe-negation': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-unused-labels': 'error',
      'no-unused-private-class-members': 'error',
      'no-useless-backreference': 'error',
      'preserve-caught-error': 'error',
      'require-yield': 'error',
      'symbol-description': 'error',
      'unicode-bom': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',

      // Constructs that are almost always a bug or a security problem.
      'no-caller': 'error',
      'no-debugger': 'error',
      'no-delete-var': 'error',
      'no-eval': 'error',
      'no-extend-native': 'error',
      'no-global-assign': 'error',
      'no-implicit-globals': 'error',
      'no-implied-eval': 'error',
      'no-new-wrappers': 'error',
      'no-object-constructor': 'error',
      'no-proto': 'error',
      'no-prototype-builtins': 'error',
      'no-throw-literal': 'error',
      'no-with': 'error',
      radix: 'error',

      // Simpler form of the same code, already used throughout the tree.
      'no-array-constructor': 'error',
      'no-else-return': 'error',
      'no-extra-bind': 'error',
      'no-extra-boolean-cast': 'error',
      'no-lone-blocks': 'error',
      'no-lonely-if': 'error',
      'no-return-assign': 'error',
      'no-sequences': 'error',
      'no-undef-init': 'error',
      'no-unneeded-ternary': 'error',
      'no-unused-expressions': 'error',
      'no-useless-call': 'error',
      'no-useless-catch': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-constructor': 'error',
      'no-useless-rename': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-numeric-literals': 'error',
      'prefer-object-spread': 'error',
      'prefer-promise-reject-errors': 'error',
      'prefer-regex-literals': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error'
    }
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs'
    }
  },
  {
    files: TS_FILES,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    rules: {
      // The TypeScript versions understand type syntax; the core rules do not.
      'no-array-constructor': 'off',
      'no-dupe-class-members': 'off',
      'no-redeclare': 'off',
      'no-unused-expressions': 'off',
      'no-useless-constructor': 'off',

      '@typescript-eslint/adjacent-overload-signatures': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/ban-tslint-comment': 'error',
      '@typescript-eslint/consistent-type-assertions': 'error',
      '@typescript-eslint/default-param-last': 'error',
      '@typescript-eslint/no-array-constructor': 'error',
      '@typescript-eslint/no-confusing-non-null-assertion': 'error',
      '@typescript-eslint/no-dupe-class-members': 'error',
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-extra-non-null-assertion': 'error',
      '@typescript-eslint/no-extraneous-class': 'error',
      '@typescript-eslint/no-invalid-this': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-namespace': 'error',
      '@typescript-eslint/no-non-null-asserted-nullish-coalescing': 'error',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
      '@typescript-eslint/no-redeclare': 'error',
      '@typescript-eslint/no-this-alias': 'error',
      '@typescript-eslint/no-unnecessary-parameter-property-assignment': 'error',
      '@typescript-eslint/no-unnecessary-type-constraint': 'error',
      '@typescript-eslint/no-unsafe-declaration-merging': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-unused-expressions': 'error',
      '@typescript-eslint/no-useless-constructor': 'error',
      '@typescript-eslint/no-useless-empty-export': 'error',
      '@typescript-eslint/no-wrapper-object-types': 'error',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/triple-slash-reference': 'error',
      '@typescript-eslint/unified-signatures': 'error'
    }
  },
  {
    files: TS_FILES,
    rules: {
      'react-hooks/rules-of-hooks': 'error'
    }
  }
];
