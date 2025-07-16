import js from '@eslint/js';

export default [
  js.configs.recommended,

  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
      },
    },
  },

  // Jest globals for test files
  {
    files: ['tests/**/*.js', '**/*.test.js', '**/__mocks__/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        jest: 'readonly',        // ✅ Add this line
        beforeEach: 'readonly',  // optional if you use these
        afterEach: 'readonly',
      },
    },
  },

  // Add this block for your prismaClient.js mock too
  {
    files: ['src/prismaClient.js'], // or wherever the mock file is
    languageOptions: {
      globals: {
        jest: 'readonly', // ✅ Add this for mock usage
      },
    },
  },
];
