"""Declares the browser-driven integration test suites.
"""

load("@aspect_rules_js//js:defs.bzl", "js_test")
load("@rules_itest//:itest.bzl", "itest_service", "itest_task", "service_test")
load("//build_defs/lint:linters.bzl", "eslint_test")

# The services bind to the host loopback (`runc_binary` containers share the host network
# namespace), so every suite is Linux-only.
LINUX_ONLY = ["@platforms//os:linux"]

# browserless generates one if unset, and the test needs to know it up front.
BROWSERLESS_TOKEN = "git-monolithic-itest"

def _scm_itest_impl(name, visibility, fixture, lib, entry_point, package_json, size, untrusted):
    workspace_subdir = "git-monolithic-itest-" + name

    eslint_test(
        name = name + "_eslint",
        srcs = [lib],
        size = "small",
    )

    itest_task(
        name = name + "_fixture_task",
        args = [
            "$(rootpath //build_defs/git_bin:git)",
            workspace_subdir,
            "$(rootpath %s)" % fixture,
        ],
        data = [
            fixture,
            "//build_defs/git_bin:git",
        ],
        exe = ":workspace_fixture",
        hygienic = False,
    )

    service_test(
        name = name + "_fixture_task_hygiene_test",
        size = "small",
        services = [":" + name + "_fixture_task"],
        test = "@rules_itest//:exit0",
    )

    itest_service(
        name = name + "_code_server_service",
        args = [
            "$(rootpath :code_server_binary)",
            "$(rootpath //extension/vsix:git_monolithic)",
            "$${PORT}",
            "untrusted" if untrusted else "trusted",
        ],
        autoassign_port = True,
        data = [
            ":code_server_binary",
            "//extension/vsix:git_monolithic",
        ],
        expected_start_duration = "5s",
        exe = ":code_server",
        http_health_check_address = "http://127.0.0.1:$${PORT}/healthz",
        target_compatible_with = LINUX_ONLY,
        deps = [":" + name + "_fixture_task"],
        hygienic = False,
    )

    service_test(
        name = name + "_code_server_service_hygiene_test",
        size = "small",
        services = [":" + name + "_code_server_service"],
        test = "@rules_itest//:exit0",
    )

    js_test(
        name = name + "_test_bin",
        data = [
            package_json,
            lib,
        ],
        entry_point = entry_point,
        tags = ["manual"],
        target_compatible_with = LINUX_ONLY,
    )

    service_test(
        name = name + "_test",
        size = size,
        env = {
            "BROWSERLESS_TOKEN": BROWSERLESS_TOKEN,
            "ITEST_WORKSPACE_SUBDIR": workspace_subdir,
        },
        services = [
            ":browserless_chromium_service",
            ":" + name + "_code_server_service",
        ],
        target_compatible_with = LINUX_ONLY,
        test = ":" + name + "_test_bin",
        visibility = visibility,
        tags = [
            # chromium image extraction heavily saturates disk I/O, so we reserve 100% of bandwidth.
            # TODO: Each chromium service instance has the exact same image, find a way to amortise
            # the extraction cost across all suites _without_ introducing hermeticity violations.
            "resources:disk_io:100",
        ],
    )

scm_itest = macro(
    doc = """Declares one browser-driven suite: its repository, its editor and its test.

Each suite gets its own repository and its own code-server instance, so suites cannot
observe each other's git state. The suite itself runs as `<name>_test`.
""",
    implementation = _scm_itest_impl,
    attrs = {
        "entry_point": attr.label(
            doc = "Compiled test entry point, produced by `lib`.",
            mandatory = True,
        ),
        "fixture": attr.label(
            allow_single_file = True,
            configurable = False,
            doc = "Script shaping the suite's repository. Run with the git binary and the " +
                  "workspace directory as arguments, once `workspace-fixture.sh` has " +
                  "initialised the repository.",
            mandatory = True,
        ),
        "lib": attr.label(
            configurable = False,
            doc = "The suite's own compiled test file. Kept out of this macro because a " +
                  "symbolic macro may not declare `dist/*.js` outputs.",
            mandatory = True,
        ),
        "package_json": attr.label(
            allow_single_file = True,
            configurable = False,
            default = "package.json",
            doc = "Manifest anchoring the test's `node_modules` resolution.",
        ),
        "size": attr.string(
            configurable = False,
            default = "small",
            doc = "Size of the generated `service_test`.",
        ),
        "untrusted": attr.bool(
            configurable = False,
            default = False,
            doc = "Opens the workspace in Restricted Mode, for suites covering the " +
                  "discovery path the extension takes when `workspace.isTrusted` is false.",
        ),
    },
)
