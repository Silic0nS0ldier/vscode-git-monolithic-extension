"""
Rollup bundle rule.
"""

load("@aspect_rules_js//js:defs.bzl", "js_run_binary")

def vsce_package(name, srcs, in_dir):
    # type: (string, list[string], string) -> None
    """
    Create a Visual studio Code extension package.

    Args:
        name: The name of the target.
        srcs: A list of source files to bundle.
        in_dir: The directory containing the extension to package.
    """
    args = [
        "--in-dir", in_dir,
        "--out-file", "%s.vsix" % name,
    ]
    outs = ["%s.vsix" % name]

    js_run_binary(
        name = name,
        tool = "//build_defs/vsce_package:bin",
        args = args,
        srcs = srcs,
        outs = outs,
        chdir = native.package_name(),
        mnemonic = "VscePackage",
        stamp = -1,
    )
