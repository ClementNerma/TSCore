# Options

The [`Option<T>`](../src/option.ts) type allows to represent optional values. It aims to get rid of `null` and `undefined` while providing a more powerful way of checking values.

## Usage

An option is a [matchable](match.md) with two possible states:

-   `Some(T)` which represents a _concrete value_
-   `None()` which represents the absence of value

It can be use this way:

```typescript
const option = Some(2) // Option<number>

// Pattern-match the option
option.match({
    Some: (num: number) => println("Found: Some({})", num),
    None: () => println!("Found: None()"),
})

// Check if the option is a Some()
if (option.isSome()) {
    // We get access to `option.inner` here, which is a `number`
} else {
    // Here we know `option` is a None(), so we don't get access to its inner data because it doesn't exist
}

// Get the option's value with a fallback in case it's a None()
const numOrFallback = option.unwrapOr(4) // number
const numOrFallbackFn = option.unwrapOrElse(() => 4) // number

// Perform a treatment if the option is a Some()
const optionSquared = option.map((num) => num * num)

// Unwrap the option - if it occurs to be a None() at runtime, the program will panic
const num = option.unwrap() // number

// Unwrap the option - if it occurs to be a None() at runtime, the program will panic with a custom message
option.expect("This was a None :(") // number

// Convert the option to a result
const result = option.okOr("That's a None") // Result<number, string>
const resultFn = option.okOrElse(() => "That's a None") // Result<number, string>
```

You can find many additional methods like `.andThen()` or `.extend()` in `Option<T>`'s type documentation.

## Conversions

It's possible to create an `Option<T>` from a `T | null` or a `T | undefined` value:

```typescript
const value: number | null = 0

const option = Option.maybe(value) // Option<number>
option.unwrap() // works fine
```
