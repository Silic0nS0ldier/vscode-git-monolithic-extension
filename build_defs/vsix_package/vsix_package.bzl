"""
VSIX package rule.
"""

load("@aspect_bazel_lib//lib:copy_to_directory.bzl", "copy_to_directory_bin_action")

def _vscode_ext_transition_impl(_settings, _attr):
    return {
        "//command_line_option:platforms": str(Label(":vscode_ext")),
    }

_vscode_ext_transition = transition(
    implementation = _vscode_ext_transition_impl,
    inputs = [],
    outputs = ["//command_line_option:platforms"],
)

def _vsix_package_impl(ctx):
    # type: (ctx) -> None
    inputs_dir = ctx.actions.declare_directory(ctx.label.name + "_inputs_dir")
    copy_to_directory_bin = ctx.toolchains["@aspect_bazel_lib//lib:copy_to_directory_toolchain_type"].copy_to_directory_info.bin
    copy_to_directory_bin_action(
        ctx,
        name = ctx.label.name,
        dst = inputs_dir,
        files = ctx.files.srcs,
        copy_to_directory_bin = copy_to_directory_bin,
    )

    out = ctx.actions.declare_file("%s.vsix" % ctx.label.name)
    ctx.actions.run(
        executable = ctx.executable._packaging_tool,
        arguments = [
            "--in-dir",
            inputs_dir.path,
            "--out-file",
            out.path,
        ],
        env = {
            "BAZEL_BINDIR": ctx.bin_dir.path,
        },
        inputs = [inputs_dir],
        outputs = [out],
        mnemonic = "VsixPackage",
    )
    return [DefaultInfo(files = depset([out]))]

vsix_package = rule(
    implementation = _vsix_package_impl,
    attrs = {
        "srcs": attr.label_list(
            mandatory = True,
            allow_files = True,
            doc = "A list of source files to bundle.",
        ),
        "in_dir": attr.string(
            mandatory = True,
            doc = "The directory containing the extension to package.",
        ),
        "_packaging_tool": attr.label(
            default = Label(":bin"),
            executable = True,
            cfg = "exec",
        ),
    },
    toolchains = ["@aspect_bazel_lib//lib:copy_to_directory_toolchain_type"],
    cfg = _vscode_ext_transition,
    doc = """
        Create a Visual Studio Code extension package.
    """,
)
