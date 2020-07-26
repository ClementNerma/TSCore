# Results

The [`Result<T, E>`](../src/result.ts) type allows to represent failable values. It aims to get rid of `Error` while providing a more powerful way of handling failures.

## Usage

A result is a [matchable](match.md) with two possible states:

-   `Ok(T)` which represents a success
-   `Err(E)` which represents a failure

It can be use this way:

```typescript
const result: Result<number, string> = Math.random() > 0.5 ? Ok(2) : Err("random number is too low")

// Pattern-match the result
result.match({
    Ok: (num: number) => println("Found: Ok({})", num),
    Err: (err: any) => println!("Found: Err({})", err),
})

// Check if the result is a success
if (result.isOk()) {
    // We get access to `result.data` here, which is a `number`
} else {
    // Here we know `result` is a failure, so we get access to its inner error `result.err`
}

// Get the result's value with a fallback in case it's a failure
const numOrFallback = result.unwrapOr(4) // number
const numOrFallbackFn = result.unwrapOrElse((err) => 4) // number

// Perform a treatment if the result is a success
const resultSquared = result.map((num) => num * num)

// Unwrap the result - if it occurs to be a failure at runtime, the program will panic
const num = result.unwrap() // number

// Unwrap the result - if it occurs to be a failure at runtime, the program will panic with a custom message
result.expect("This was a None :(") // number

// Convert the result to an option
const success = result.maybeOk() // Option<number>
const error = result.maybeErr() // Option<string>
```

You can find many additional methods like `.andThen()` or `.extend()` in `Result<T, E>`'s type documentation.
