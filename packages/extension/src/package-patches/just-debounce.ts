import badDebounce from "just-debounce";

export const debounce: typeof badDebounce.default = badDebounce as any;
