import importPlugin from 'eslint-plugin-import'

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/order': 'warn',
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'AD-1: domain/ is a pure leaf - no browser globals' },
        { name: 'document', message: 'AD-1: domain/ is a pure leaf - no DOM access' },
        { name: 'showDirectoryPicker', message: 'AD-1: domain/ must not use the File System Access API' },
        { name: 'showOpenFilePicker', message: 'AD-1: domain/ must not use the File System Access API' },
        { name: 'showSaveFilePicker', message: 'AD-1: domain/ must not use the File System Access API' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(?:^|/|(?:\\.\\./)+)(?:src/)?(?:parse|write|fs|state|ui|worker|ai)(?:/|$)',
              message: 'AD-1: domain/ is a pure leaf - may not import parse/, write/, fs/, state/, ui/, worker/ or ai/',
            },
          ],
        },
      ],
    },
  },
]
