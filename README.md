# TS-Core

[![npm version](https://badge.fury.io/js/typescript-core.svg)](https://badge.fury.io/js/typescript-core)

This library aims to provide powerful pattern-matching to TypeScript, as well as some useful types & tools for handling repetitive or complex scenarios.
This project was originally inspired by the [Rust programming language](https://www.rust-lang.org/).
If you are familiar this Rust, you will be able to use functional types (at least) very quickly.

**WARNING: This library is NOT READY for production yet as it does not have any test and does not follow semantic versioning. A stable version will ship soon.**

## Concept of matchables

A **matchable** is a value that can has a specific _state_ among a list of possible states. For instance, futures which allow to deal with promises are matchables that have at a T instant one state between `pending`, `fulfilled` or `failed`. A state can either be valueless (only a name) like `pending`, or carry a value, like `fulfilled` which carries the success value and `failed` which carries the error value.

Matchables are dealt with using the pattern-matching `match` function:

```ts
import { Future, match } from "ts-core"

// Create a future that resolves instantly
let future = Future.resolve(2)

// Match the future's state
match(future, {
    Pending: () => console.log("The future is pending..."),
    Fulfilled: (data) => console.info("The future is fulfilled!", data),
    Failed: (err) => console.error("The future has failed :(", err),
})
```

Matching is exhaustive, meaning that if you omit to match any of the matchable's state, you will get an error:

```ts
// ERROR: Pattern 'Failed' is not covered
match(future, {
    Pending: () => console.log("The future is pending..."),
    Fulfilled: (data) => console.info("The future is fulfilled!", data),
})
```

Most code editors will also feature code completion, meaning that if you ask your editor to autocomplete the results in the matching object, you should see the list of all possible states for a given matchable.

Note that you can also match objects using the postfix method:

```ts
future.match({
    Pending: () => console.log("The future is pending..."),
    Fulfilled: (data) => console.info("The future is fulfilled!", data),
    Failed: (err) => console.error("The future has failed :(", err),
})
```

The point of pattern-matching is to deal with all cases at once, as well as to prevent forgetting one of the states - you must deal with all them. If you only want to take a look at one specific state for instance, the matchable's class should provide you additional methods fulfilling this purpose.

## Examples

You can also take a look at the [examples](examples/).

## Documentation

Types documentation can be got by running `yarn docs`. HTML files will be put in the `docs/` folder.

## License

This project is released under the terms of license Apache 2.0.
