## Error Handling

### Throwing

A public API should never throw. Private API should limit throwing to only where it is strictly necessary (e.g. interacting with third-party libraries).

### Error Result Types

Traceability is important so errors should link together when they cannot be handled by a given codepath. The `Error` type and its siblings in `src/errors.ts` should be used where possible. Usage of a typed `cause` attribute is recommended, but should not be allowed to form deep chains. Ideally a given error should type should only nest 1 level deep, with `unknown` being used to short circuit.

Keeping typed error nesting limited is important for TypeScript performance (type checks can become fragile when nesting becomes deep as TS may bail-out and use `any`) and to keep errors useful when debugging.
