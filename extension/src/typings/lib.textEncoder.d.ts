// Define TextEncoder + TextDecoder globals for both browser and node runtimes
//
// Proper fix: https://github.com/microsoft/TypeScript/issues/31535

declare var TextDecoder: typeof import("util").TextDecoder;
declare var TextEncoder: typeof import("util").TextEncoder;
