import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The lockstep simulation must compute bit-identical results in every JS engine (V8, SpiderMonkey,
// JavaScriptCore). The spec leaves these Math functions implementation-approximated; use the
// helpers in kingsmap-core `sim/util/geometry.ts` (detSin, detCos, detAtan2, vecLen, sq) and
// `sim/util/rng.ts` (rand, randomInt) instead.
const NONDET =
  'engine-dependent result: use detSin/detCos/detAtan2/vecLen/sq (sim/util/geometry) or rand() (sim/util/rng)';

const NONDET_MATH = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'hypot',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'cbrt',
  'random',
];

export default tseslint.config(
  {
    ignores: [
      '**/lib/**',
      '**/dist/**',
      '**/out/**',
      '**/node_modules/**',
      '.yarn/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      // readable code: one declaration and one statement per line
      'one-var': ['error', 'never'],
      'max-statements-per-line': ['error', { max: 1 }],
      'no-sequences': 'error',
    },
  },
  {
    // everything in kingsmap-core's src computes or feeds the game state
    files: ['packages/kingsmap-core/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...NONDET_MATH.map(property => ({
          object: 'Math',
          property,
          message: NONDET,
        })),
        { object: 'Date', property: 'now', message: NONDET },
        { object: 'performance', property: 'now', message: NONDET },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: NONDET },
        { name: 'performance', message: NONDET },
        { name: 'crypto', message: NONDET },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='**']",
          message: NONDET,
        },
        {
          selector: "AssignmentExpression[operator='**=']",
          message: NONDET,
        },
        {
          selector: "CallExpression[callee.property.name='localeCompare']",
          message: 'locale-dependent result',
        },
      ],
    },
  },
  prettier,
);
