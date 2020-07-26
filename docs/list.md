# Lists

The [`Dictionary<T>`](../src/list.ts) type provides a replacement for arrays and `Set`.

## Overview

```typescript
// Before:
const arr: string[] = []
arr.push("hello") // number
arr.pop() // string | undefined
// no direct way to check if an index exists
// no direct way to insert a value at a given position (requires to use `.splice()`)
// no direct way to remove an index (requires to use `.splice()`)
// no direct way to clear the array (requires to use `.splice()` on constants)

// Sometimes polluted by ".length"
const keys = arr.keys() // IterableIterator<number>
const vals = arr.values() // IterableIterator<string>
const entries = arr.entries() // IterableIterator<[number, string]>

// After:
const list = new List<string>()
list.push("hello") // number
list.pop() // Option<string>
list.has(3) // boolean
list.insert(1, "world") // List<T>
list.removeAt(1) // boolean
list.clear() // List<string>

const keys = dict.keys() // Iter<number>
const vals = dict.values() // Iter<string>
const entries = dict.entries() // Iter<[number, string]>
```

`List` is mostly API-compliant with `Array` so you can quite easily replace the latter by the former. The main difference is that `.get()` will return an [`Option<V>`](option.md) instead of a `V | undefined`.

Also, iterators are returned as [`Iter<T>`](iter.md), which is also mostly API-compliant with `IterableIterator<T>`.

-   Many methods to treat and analyze the list's content
-   Strict typing when reading from the list
-   Contiguous indexes (no gap like in `new Array(xx)`)
-   Usage of `Option` and `Result`, allowing to chain processes

## Creating a list

The List constructor accepts:

-   Empty values to create a new, empty list
-   Arrays of values (`Array<T>`)
-   Existing sets (`Set<T>`)
-   Existing lists (`List<T>`)

## Using a dictionary

```typescript
// Create a list
const list = new Dictionary<number, string>()

// Push a value
dict.push("Hello world!")

// Remove a value by index
dict.removeAt(0)

// Remove a value by value
dict.remove("Hello world!")

// Get a value by index
dict.get(0) // Option<string>

// Check if an index exists
dict.has(0) // boolean
```

There are a lot of other methods you can find in the type's documentation.

## Conversions

Converting a list to an `Array<T>`:

```typescript
const arr = list.toArray()
// Or:
const arr = [...list]
```
