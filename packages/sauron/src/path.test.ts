import test from "ava";
import { isErr, isOk } from "monolithic-git-interop/util/result";
import { p } from "./backend/fake.stub.js";
import { absolutePath, fileName, isWithin, parent } from "./path.js";

test("absolutePath normalises separators, dot segments and trailing slashes", t => {
    t.is<string, string>(p("/a/./b/../c/"), "/a/c");
    t.is<string, string>(p("C:\\repo\\src\\"), "C:/repo/src");
    t.is<string, string>(p("/"), "/");
    t.is<string, string>(p("C:/"), "C:/");
});

test("absolutePath rejects relative paths", t => {
    t.true(isErr(absolutePath("a/b")));
    t.true(isErr(absolutePath("")));
});

test("fileName accepts a single segment only", t => {
    t.true(isOk(fileName(".gitignore")));
    t.true(isErr(fileName("a/b")));
    t.true(isErr(fileName("a\\b")));
    t.true(isErr(fileName("..")));
    t.true(isErr(fileName("")));
});

test("parent walks up to the root and stops", t => {
    t.is(parent(p("/a/b")), p("/a"));
    t.is(parent(p("/a")), p("/"));
    t.is(parent(p("/")), null);
    t.is(parent(p("C:/a")), p("C:/"));
    t.is(parent(p("C:/")), null);
});

test("isWithin is strict and segment aware", t => {
    t.true(isWithin(p("/a/b"), p("/a")));
    t.true(isWithin(p("/a"), p("/")));
    t.false(isWithin(p("/a"), p("/a")));
    t.false(isWithin(p("/ab"), p("/a")));
});
