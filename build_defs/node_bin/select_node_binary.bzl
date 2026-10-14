"""
Exposes the Node.js binary as a regular Bazel target.
"""

load("@rules_nodejs//nodejs:toolchain.bzl", _NodeInfo = "NodeInfo")

# Workaround for "local symbol 'NodeInfo' cannot be used as a type"
type NodeInfo = _NodeInfo

def _select_node_binary_impl(ctx: Ctx) -> list[struct]:
    # The type checker does not yet know that `ToolchainContext` is indexable.
    toolchains: Any = ctx.toolchains
    nodeinfo: NodeInfo = toolchains["@rules_nodejs//nodejs:toolchain_type"].nodeinfo
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
    doc = "Symlinks the resolved Node.js toolchain's `node` binary as this target's executable.",
)
