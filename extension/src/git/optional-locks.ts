/**
 * Whether `env` turns off git's optional locks, which keeps `git status` from saving its untracked cache. git reads
 * the variable as a boolean: `false`, `no`, `off`, a zero or an empty value turn them off.
 */
export function optionalLocksDisabled(env: { readonly [key: string]: string | undefined }): boolean {
    const value = env["GIT_OPTIONAL_LOCKS"];
    return value !== undefined && /^(?:false|no|off|0*)$/iu.test(value.trim());
}
