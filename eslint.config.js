import typescript from '@typescript-eslint/eslint-plugin'
import typescriptParser from '@typescript-eslint/parser'

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': typescript
    },
    languageOptions: {
      parser: typescriptParser
    },
    rules: {
      ...typescript.configs['recommended'].rules
    }
  }
]