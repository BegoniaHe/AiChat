const js = require('@eslint/js');
const globals = require('globals');
const svelte = require('eslint-plugin-svelte');

module.exports = [
  js.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      // General JavaScript rules
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'warn',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'prefer-const': 'warn', // 降级为警告，Svelte 5 props 可能看起来像未重新赋值
      'no-var': 'error',
      'no-empty': ['warn', { allowEmptyCatch: true }], // 允许空 catch 块
      'no-undef': 'error',
      'no-control-regex': 'warn',

      // Svelte specific rules
      'svelte/valid-compile': 'warn', // 降级为警告，包括 a11y 问题
      'svelte/no-at-html-tags': 'off', // 关闭 @html 警告，由开发者判断
      'svelte/no-unused-svelte-ignore': 'warn',
      'svelte/require-store-reactive-access': 'warn',
      'svelte/require-each-key': 'warn', // 降级为警告
      'svelte/prefer-svelte-reactivity': 'off', // 关闭 Map/Set 警告
      'svelte/prefer-writable-derived': 'off', // 关闭 derived 建议
      'svelte/no-object-in-text-mustaches': 'warn',

      // Svelte 5 runes support
      'svelte/no-reactive-reassign': 'off', // 允许 runes 重新赋值
    },
  },
  {
    // Ignore patterns
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'src-tauri/target/**',
      '.svelte-kit/**',
      'package/**',
      '*.config.js',
      '*.config.cjs',
    ],
  },
];
