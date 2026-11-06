/**
 * Creates file system entries Node has no API for (FIFOs, device nodes, extended attributes) through `node:ffi`
 * and glibc, so tests need no tools beyond Node. Each returns `null` on success, otherwise why it is unsupported
 * here, for the test to skip with.
 */
import net from "node:net";
import os from "node:os";
import path from "node:path";

type Libc = {
    mkfifo(path: string, mode: number): number;
    mknod(path: string, mode: number, dev: bigint): number;
    lsetxattr(path: string, name: string, value: Buffer, size: number, flags: number): number;
    lremovexattr(path: string, name: string): number;
    __errno_location(): bigint;
};

type Ffi = {
    dlopen(
        library: string,
        symbols: Record<keyof Libc, { readonly return: string; readonly arguments: readonly string[] }>,
    ): { readonly functions: unknown };
    getInt32(pointer: bigint, offset: number): number;
};

const S_IFCHR = 0o020000;
const S_IFBLK = 0o060000;

function load(): { readonly libc: Libc; readonly errno: () => string } | string {
    if (process.platform !== "linux") {
        return `needs Linux, not ${process.platform}`;
    }
    const ffi = process.getBuiltinModule("node:ffi") as Ffi | undefined;
    if (ffi === undefined) {
        return "this Node.js build has no node:ffi";
    }
    try {
        const { functions } = ffi.dlopen("libc.so.6", {
            mkfifo: { return: "int32", arguments: ["string", "uint32"] },
            mknod: { return: "int32", arguments: ["string", "uint32", "uint64"] },
            lsetxattr: { return: "int32", arguments: ["string", "string", "buffer", "uint64", "int32"] },
            lremovexattr: { return: "int32", arguments: ["string", "string"] },
            __errno_location: { return: "pointer", arguments: [] },
        });
        const libc = functions as Libc;
        const names = new Map(Object.entries(os.constants.errno).map(([name, code]) => [code, name]));
        return {
            libc,
            errno: () => {
                const code = ffi.getInt32(libc.__errno_location(), 0);
                return names.get(code) ?? `errno ${code}`;
            },
        };
    } catch (cause) {
        return `glibc is unavailable: ${String(cause)}`;
    }
}

let loaded: ReturnType<typeof load> | undefined;

function call(invoke: (libc: Libc) => number): string | null {
    loaded ??= load();
    if (typeof loaded === "string") {
        return loaded;
    }
    return invoke(loaded.libc) === 0 ? null : loaded.errno();
}

export function mkfifo(target: string): string | null {
    return call(libc => libc.mkfifo(target, 0o644));
}

function makedev(major: number, minor: number): bigint {
    const ma = BigInt(major);
    const mi = BigInt(minor);
    return ((ma & 0xfffn) << 8n) | ((ma & ~0xfffn) << 32n) | (mi & 0xffn) | ((mi & ~0xffn) << 12n);
}

/**
 * Device nodes need `CAP_MKNOD`, except a character device 0:0 (an overlayfs "whiteout"), which Linux lets
 * anyone create on file systems that support it (e.g. ext4, but not overlayfs itself).
 */
export function mknod(target: string, type: "character" | "block", major: number, minor: number): string | null {
    const mode = (type === "character" ? S_IFCHR : S_IFBLK) | 0o644;
    const result = call(libc => libc.mknod(target, mode, makedev(major, minor)));
    return result === "EPERM" ? `creating a ${type} device ${major}:${minor} needs CAP_MKNOD here` : result;
}

/** Does not follow symlinks. */
export function setXattr(target: string, name: string, value: string): string | null {
    const buffer = Buffer.from(value);
    return call(libc => libc.lsetxattr(target, name, buffer, buffer.length, 0));
}

/** Does not follow symlinks. */
export function removeXattr(target: string, name: string): string | null {
    return call(libc => libc.lremovexattr(target, name));
}

/** A Unix socket bound at `target`, which exists until the server closes. */
export async function listenSocket(target: string): Promise<net.Server> {
    const server = net.createServer();
    const listening = new Promise<void>((resolve, reject) => {
        server.once("listening", resolve).once("error", reject);
    });
    // Binding by relative path avoids the ~108 byte limit on socket paths, which test directories can exceed.
    // `listen` binds synchronously, so nothing else runs in the changed directory.
    const cwd = process.cwd();
    process.chdir(path.dirname(target));
    try {
        server.listen(path.basename(target));
    } finally {
        process.chdir(cwd);
    }
    await listening;
    return server;
}
