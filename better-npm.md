@//:node_modules/* (via `npm_link_all_packages` imported from `@npm:defs.bzl`)

Have `@@aspect_rules_js++npm+npm__at_actions_cache__6.3.0_supports-color_7.2.0__links` repos contain normal targets that offer providers, to avoid eager `load`ing of thousands of repos.

`npm_link_all_packages` uses the offered providers in it's own rules, so only the needed repos are loaded (and small dependency chains don't end up paying for large ones).

`deps` and `ref_deps` will need some special handling (they currently take advantage of being used as a macro).
