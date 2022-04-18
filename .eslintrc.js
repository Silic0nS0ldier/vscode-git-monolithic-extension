module.exports = {
    "env": {
        "browser": true,
        "es2021": true,
    },
    "extends": [
        "plugin:ava/recommended",
    ],
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "ecmaVersion": 13,
        "sourceType": "module",
    },
    "plugins": [
        "@typescript-eslint",
    ],
    "rules": {
        "@typescript-eslint/explicit-function-return-type": ["warn"],
        "class-methods-use-this": ["error"],
        "no-param-reassign": ["error"],
        "sort-keys": ["error"],
    },
};
