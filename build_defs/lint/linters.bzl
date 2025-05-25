"Define linter aspects"

load("@aspect_rules_lint//lint:eslint.bzl", "lint_eslint_aspect")
load("@aspect_rules_lint//lint:lint_test.bzl", "lint_test")
load("@aspect_rules_lint//lint:shellcheck.bzl", "lint_shellcheck_aspect")

eslint = lint_eslint_aspect(
    binary = Label("@//build_defs/lint:eslint"),
    configs = [
        Label("@//:eslintrc"),
    ],
)

eslint_test = lint_test(aspect = eslint)

shellcheck = lint_shellcheck_aspect(
    binary = "@multitool//tools/shellcheck:shellcheck",
    config = Label("@//:.shellcheckrc"),
)

shellcheck_test = lint_test(aspect = shellcheck)

