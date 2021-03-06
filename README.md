# TS-Core

[![npm version](https://badge.fury.io/js/tscore.svg)](https://badge.fury.io/js/tscore)

TS-Core is a library that provides replacement types for some basic structures of TypeScript, like `undefined`, `null` or `Array<T>`. It also provides a pattern-matching system capable to pseudo-emulate a simple algebraic data type system.

This project was originally inspired by the [Rust programming language](https://www.rust-lang.org/). If you are familiar this Rust, you should be able to use functional types very quickly.

## Concept of matchables

A **matchable** is a value that can has a specific _state_ among a list of possible states. For instance, futures which allow to deal with promises are matchables that have at a T instant one state between `pending`, `fulfilled` or `failed`. A state can either be valueless (only a name) like `pending`, or carry a value, like `fulfilled` which carries the success value and `failed` which carries the error value.

Matchables are dealt with using the pattern-matching `match` function:

```ts
import { Option, Some, match } from "typescript-core"

const message = Some("Hello world!")

// Match the future's state
match(message, {
    Some: (message) => println("Message: {}", message),
    None: () => println("No message to display :(")
})
```

Matching is exhaustive, meaning that if you omit to match any of the matchable's state, you will get an error:

```ts
// ERROR: Pattern 'None' is not covered
match(future, {
    Some: (message) => println("Message: {}", message)
})
```

Most code editors will also feature code completion, meaning that if you ask your editor to autocomplete the results in the matching object, you should see the list of all possible states for a given matchable.

Note that you can also match objects using the postfix method:

```ts
message.match({
    Some: (message) => println("Message: {}", message),
    None: () => println("No message to display :(")
})
```

The point of pattern-matching is to deal with all cases at once, as well as to prevent forgetting one of the states - you must deal with all them. If you only want to take a look at one specific state for instance, the matchable's class should provide you additional methods fulfilling this purpose.

## Examples

You can also take a look at the [examples](examples/README.md).

## Documentation

The documentation can be found in the [`docs`](docs/README.md) folder.

Types documentation can be got by running `yarn docs`. HTML files will be put in the [`docs/types`](docs/types/README.md) folder.

## License

This project is released under the terms of license Apache 2.0.
