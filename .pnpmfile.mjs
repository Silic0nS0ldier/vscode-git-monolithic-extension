function readPackage(pkg, context) {
    if (pkg.name?.includes("typescript-eslint") && pkg.peerDependencies?.typescript) {
        // TODO Remove once typescript-eslint supports TypeScript 7
        delete pkg.peerDependencies.typescript;
        context.log(`Overriding typescript peer dependency for ${pkg.name}`);
        if (pkg.dependencies == null) {
            pkg.dependencies = {};
        }
        pkg.dependencies.typescript = "^6.0.2";
    }

    return pkg;
}

export const hooks = {
    readPackage,
};
