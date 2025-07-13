"""
Exposes NodeJS binary as a regular Bazel target.
"""

load("@rules_nodejs//nodejs:toolchain.bzl", "NodeInfo")

def _select_node_binary_impl(ctx):
    # type: (ctx) -> Unknown
    nodeinfo = ctx.toolchains["@rules_nodejs//nodejs:toolchain_type"].nodeinfo  # type: NodeInfo
    node_binary = nodeinfo.node

    # Bazel requires that executable outputs be created by the originating rule
    out_node_binary = ctx.actions.declare_file(ctx.label.name)
    ctx.actions.symlink(
        output = out_node_binary,
        target_file = node_binary,
        is_executable = True,
    )

    return [DefaultInfo(executable = out_node_binary)]

select_node_binary = rule(
    implementation = _select_node_binary_impl,
    executable = True,
    toolchains = ["@rules_nodejs//nodejs:toolchain_type"],
)
