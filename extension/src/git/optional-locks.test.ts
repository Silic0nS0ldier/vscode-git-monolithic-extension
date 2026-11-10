import test from "ava";
import { optionalLocksDisabled } from "./optional-locks.js";

test("Reads GIT_OPTIONAL_LOCKS as git reads a boolean", t => {
    for (const value of ["0", "00", "false", "FALSE", "no", "off", ""]) {
        t.true(optionalLocksDisabled({ GIT_OPTIONAL_LOCKS: value }), JSON.stringify(value));
    }
    for (const value of ["1", "true", "yes", "on"]) {
        t.false(optionalLocksDisabled({ GIT_OPTIONAL_LOCKS: value }), value);
    }
});

test("Optional locks are on when GIT_OPTIONAL_LOCKS is unset", t => {
    t.false(optionalLocksDisabled({}));
});
