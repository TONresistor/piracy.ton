export default [
    {
        "ignores": [
            "node_modules/**",
            "js/*.bundle.js",
            "js/*.min.js",
            "v3-sdk.cjs"
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
                "URLSearchParams": "readonly",
                "structuredClone": "readonly",
                "fetch": "readonly",
                "setTimeout": "readonly",
                "setInterval": "readonly",
                "clearInterval": "readonly",
                "clearTimeout": "readonly",
                "Response": "readonly",
                "URL": "readonly",
                "TextEncoder": "readonly",
                "setImmediate": "readonly",
                "process": "readonly",
                "AbortController": "readonly",
                "TextDecoder": "readonly",
                "console": "readonly",
                "AbortSignal": "readonly",
                "Buffer": "readonly"
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
