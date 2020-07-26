# Dictionaries

The [`Dictionary<K, V>`](../src/dictionary.ts) type provides a replacement for collections (JSON objects) and `Map`.

## Overview

```typescript
// Before:
const map = new Map<number, string>()
map.set(2, "Two") // Map<number, string>
map.set(3, "Three") // Map<number, string>
map.delete(3) // boolean
map.clear()

const keys = map.keys() // IterableIterator<number>
const vals = map.values() // IterableIterator<string>
const entries = map.entries() // IterableIterator<[number, string]>

// After:
const dict = new Dictionary<number, string>()
dict.set(2, "Two") // Dictionary<number, string>
dict.set(3, "Three") // Dictionary<number, string>
dict.delete(3) // boolean
dict.clear()

const keys = dict.keys() // Iter<number>
const vals = dict.values() // Iter<string>
const entries = dict.entries() // Iter<[number, string]>
```

`Dictionary` is mostly API-compliant with `Map` so you can quite easily replace the latter by the former. The main difference is that `.get()` will return an [`Option<V>`](option.md) instead of a `V | undefined`.

Also, iterators are returned as [`Iter<T>`](iter.md), which is also mostly API-compliant with `IterableIterator<T>`.

The main advantages of `Dictionary` are:

-   Many methods to treat and analyze the dictionary's content
-   Methods to convert the dictionary to a collection (native JSON object)
-   Usage of `Option` and `Result`, allowing to chain processes
-   Strict typing, even if the TypeScript compiler is not in strict mode

## Creating a dictionary

The Dictionary constructor accepts:

-   Empty values to create a new, empty dictionary
-   Arrays of key/value pairs (`Array<[K, V]>`)
-   Existing maps (`Map<K, V>`)
-   Existing dictionaries (`Dictionary<K, V>`)

## Using a dictionary

```typescript
// Create a dictionary
const dict = new Dictionary<number, string>()

// Set a value
dict.set(2, "Two")

// Remove a value
dict.delete(2)

// Get a value
dict.get(2) // Option<string>

// Check if a key exists
dict.has(2) // boolean
```

There are a lot of other methods you can find in the type's documentation.

## Conversions

Converting a dictionary to a `Map<K, V>`:

```typescript
const map = dict.inner()
```

Converting a dictionary to a `Collection<V>` (JSON object):

```typescript
const coll = dict.mapKeysToCollection((key) => key.toString())
```

## Record dictionaries

_Record_ dictionaries are dictionaries with `string` keys:

```typescript
const dict = new Dictionary<string, string>()
const record = Record.cast(dict) // Record<string>
```

They get a few additional features, like `.toCollection()` which can convert them to a collection without any conversion required for the keys.
