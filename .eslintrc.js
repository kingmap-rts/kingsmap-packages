// The lockstep simulation must compute bit-identical results in every JS engine (V8, SpiderMonkey,
// JavaScriptCore). The spec leaves these Math functions implementation-approximated; use the
// helpers in kingsmap-core `sim/util/geometry.ts` (detSin, detCos, detAtan2, vecLen, sq) and
// `sim/util/rng.ts` (rand, randomInt) instead.
const NONDET =
  'engine-dependent result: use detSin/detCos/detAtan2/vecLen/sq (sim/util/geometry) or rand() (sim/util/rng)';

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ['**/lib/**', '**/dist/**', 'node_modules/**', '.yarn/**'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    // readable code: one declaration and one statement per line
    'one-var': ['error', 'never'],
    'max-statements-per-line': ['error', { max: 1 }],
    'no-sequences': 'error',
  },
  overrides: [
    {
      // everything in kingsmap-core's src computes or feeds the game state
      files: ['packages/kingsmap-core/src/**/*.ts'],
      rules: {
        'no-restricted-properties': [
          'error',
          { object: 'Math', property: 'sin', message: NONDET },
          { object: 'Math', property: 'cos', message: NONDET },
          { object: 'Math', property: 'tan', message: NONDET },
          { object: 'Math', property: 'asin', message: NONDET },
          { object: 'Math', property: 'acos', message: NONDET },
          { object: 'Math', property: 'atan', message: NONDET },
          { object: 'Math', property: 'atan2', message: NONDET },
          { object: 'Math', property: 'sinh', message: NONDET },
          { object: 'Math', property: 'cosh', message: NONDET },
          { object: 'Math', property: 'tanh', message: NONDET },
          { object: 'Math', property: 'asinh', message: NONDET },
          { object: 'Math', property: 'acosh', message: NONDET },
          { object: 'Math', property: 'atanh', message: NONDET },
          { object: 'Math', property: 'hypot', message: NONDET },
          { object: 'Math', property: 'exp', message: NONDET },
          { object: 'Math', property: 'expm1', message: NONDET },
          { object: 'Math', property: 'log', message: NONDET },
          { object: 'Math', property: 'log1p', message: NONDET },
          { object: 'Math', property: 'log2', message: NONDET },
          { object: 'Math', property: 'log10', message: NONDET },
          { object: 'Math', property: 'pow', message: NONDET },
          { object: 'Math', property: 'cbrt', message: NONDET },
          { object: 'Math', property: 'random', message: NONDET },
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
  ],
};
