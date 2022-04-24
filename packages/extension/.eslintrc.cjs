const base = require("../build-tools/eslintrc-base.cjs");

module.exports = {
    ...base,
    "parserOptions": {
        "project": "./tsconfig.json",
        ...base.parserOptions,
    },
};
