import test from "ava";
import { GitErrorCodes } from "../api/git.js";
import { getGitErrorCode } from "./error.js";

const IDENTITY_HINT = [
    "Author identity unknown",
    "",
    "*** Please tell me who you are.",
    "",
    "Run",
    "",
    "  git config --global user.email \"you@example.com\"",
    "  git config --global user.name \"Your Name\"",
    "",
    "to set your account's default identity.",
    "Omit --global to set the identity only in this repository.",
    "",
].join("\n");

test("reports an unknown identity whether git wanted the name or the email", t => {
    for (
        const reason of [
            "fatal: no email was given and auto-detection is disabled",
            "fatal: unable to auto-detect email address (got 'me@host.(none)')",
            "fatal: no name was given and auto-detection is disabled",
            "fatal: empty ident name (for <me@example.com>) not allowed",
        ]
    ) {
        t.is(getGitErrorCode(`${IDENTITY_HINT}${reason}\n`), GitErrorCodes.IdentityUnknown, reason);
    }
});

test("leaves a hook failure unclassified", t => {
    t.is(getGitErrorCode("Commit rejected by the test hook\n"), undefined);
});
