"""
Rollup bundle rule.
"""

load("@aspect_rules_js//js:defs.bzl", "js_run_binary")

def rollup_bundle(name, srcs, entry_points, external_modules, visibility):
    # type: (string, list[string], list[string], list[string], list[string]) -> None
    """
    Create a JS bundle using an opinionated Rollup configuration.

    Args:
        name: The name of the target.
        srcs: Source files to be considered for bundle inclusion.
        entry_points: Roots from which to start bundling.
        external_modules: Modules which should not (or can not) be bundled.
        visibility: List of targets that can depend on this target.
    """
    args = ["--out-dir", name]
    outs = []
    
    # Handle entry points
    for entry_point in entry_points:
        args.append("--entry-point")
        args.append(entry_point)
        # TODO This is hacky
        outs.append("%s/%s" % (name, entry_point.replace("dist/", "")))
    
    # Handle external modules
    for external_module in external_modules:
        args.append("--external-module")
        args.append(external_module)

    js_run_binary(
        name = name,
        tool = "//build_defs/rollup_bundle:bin",
        args = args,
        srcs = srcs,
        outs = outs,
        out_dirs = ["%s/chunks" % name],
        chdir = native.package_name(),
        mnemonic = "RollupBundle",
        visibility = visibility,
    )
