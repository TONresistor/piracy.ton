export default [
    {
        "ignores": [
            "node_modules/**",
            "dist/**",
            ".cache/**",
            "public/js/*.min.js"
        ]
    },
    {
        "files": [
            "**/*.js",
            "**/*.mjs"
        ],
        "languageOptions": {
            "ecmaVersion": 2022,
            "sourceType": "module",
            "globals": {
                "getComputedStyle": "readonly",
                "location": "readonly",
                "window": "readonly",
                "fetch": "readonly",
                "setTimeout": "readonly",
                "clearTimeout": "readonly",
                "setImmediate": "readonly",
                "process": "readonly",
                "matchMedia": "readonly",
                "AbortSignal": "readonly",
                "clearInterval": "readonly",
                "setInterval": "readonly",
                "URL": "readonly",
                "navigator": "readonly",
                "localStorage": "readonly",
                "TextEncoder": "readonly",
                "document": "readonly",
                "CustomEvent": "readonly",
                "console": "readonly",
                "Buffer": "readonly",
                "URLSearchParams": "readonly",
                "structuredClone": "readonly",
                "Response": "readonly",
                "AbortController": "readonly",
                "TextDecoder": "readonly",
                "globalThis": "readonly"
            }
        },
        "rules": {
            "no-undef": "error",
            "no-unused-vars": [
                "error",
                {
                    "argsIgnorePattern": "^_",
                    "caughtErrors": "none",
                    "varsIgnorePattern": "^_"
                }
            ],
            "no-unreachable": "error",
            "no-constant-condition": "error",
            "no-dupe-args": "error",
            "no-dupe-keys": "error",
            "no-duplicate-case": "error",
            "valid-typeof": "error",
            "constructor-super": "error",
            "no-async-promise-executor": "error"
        }
    }
];
