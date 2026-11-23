import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        files: ['extension/**/*.js', 'tests/headless/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                console: 'readonly',
                global: 'readonly',
                log: 'readonly',
                logError: 'readonly',
            },
        },
    },
];
