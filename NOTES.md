only run status commands during idle
abort existing command if high rate of change detected

## V8 Considerations

### `Promise.race`

Methods like `Promise.race` can be a source of memory leaks when a promise is being reused. This is due to the callbacks array for `then` not clearing.

This issue can be trivially worked around by not recycling promises for a long time (e.g. using a singleton promise which may never resolve).
