/**
 * @file Type-safe arrays with functional and iterable capabilities
 */

import { panic } from "./env"
import { Iter } from "./iter"
import { O } from "./objects"
import { None, Option, Some } from "./option"
import { Err, Ok, Result } from "./result"

export class List<T> implements Iterable<T> {
  private _content: T[]

  /**
   * Create a new list
   * @param content (Optional) Existing array of set
   */
  constructor(content?: ListLike<T>) {
    if (!content) {
      content = []
    } else if (content instanceof List) {
      content = content._content.slice()
    } else if (content instanceof Set) {
      content = Array.from(content.values())
    } else {
      content = content.slice()
    }

    // Detect non-contiguous arrays
    // e.g. `const arr = []; arr[3] = "Hello!";`
    // Such an array will contain 'empty' elements which will have the 'undefined' value
    if ((content as Array<T | undefined>).includes(undefined)) {
      if (content.find((item) => item !== undefined)) {
        panic("Lists can only be created from contiguous arrays")
      }
    }

    this._content = content
  }

  /**
   * (Internal) Get the value at a specified index without checking its type
   * Meant to be used *after* the index has proven to be existing in the content array
   */
  private _raw(index: number): T {
    return this._content[index] as T
  }

  /**
   * Get the list's number of items
   */
  get length(): number {
    return this._content.length
  }

  /**
   * Check if the list is empty
   */
  empty(): boolean {
    return this._content.length === 0
  }

  /**
   * Check if an item with a given index exists
   * @param index
   */
  has(index: number): boolean {
    return this._content.hasOwnProperty(index)
  }

  /**
   * Get the item at a given index
   * @param index
   */
  get(index: number): Option<T> {
    return this.has(index) ? Some(this._raw(index)) : None()
  }

  /**
   * Get the item at a given index and expect it to exist
   * @param index
   */
  getUnwrap(index: number): T {
    return this.get(index).unwrap()
  }

  /**
   * Set an index's value
   * Will panic if the index is out-of-bounds
   * @param index
   * @param value
   */
  set(index: number, value: T): void {
    if (!this.has(index)) {
      panic("Out-of-bound index {} in list with length of {}", index, this.length)
    }

    this._content[index] = value
  }

  /**
   * Get the first element of the list
   */
  first(): Option<T> {
    return this.get(0)
  }

  /**
   * Get the first elements of the list
   * @param size The number of elements to get
   */
  firstOnes(size: number): List<T> {
    return this.slice(0, size)
  }

  /**
   * Get the last element of the list
   */
  last(): Option<T> {
    return this.get(this.length - 1)
  }

  /**
   * Get the last elements of the list
   * @param size The number of elements to get
   */
  lastOnes(size: number): List<T> {
    return this.length < size ? new List() : this.slice(-size)
  }

  /**
   * Get the index of an item
   * @param item
   * @param fromIndex
   */
  indexOf(item: T, fromIndex?: number): number {
    return this._content.indexOf(item, fromIndex)
  }

  /**
   * Get the last index of an item
   * @param item
   * @param fromIndex
   */
  lastIndexOf(item: T, fromIndex?: number): number {
    return this._content.lastIndexOf(item, fromIndex)
  }

  /**
   * Check if an item is present in the list
   * @param item
   */
  includes(item: T): boolean {
    return this._content.includes(item)
  }

  /**
   * Count the number of times an item is present in the list
   * @param item
   */
  count(item: T): number {
    let counter = 0

    for (const value of this._content) {
      if (value === item) {
        counter++
      }
    }

    return counter
  }

  /**
   * Count the number of items matching a predicate
   * @param predicate
   * @param stopAt Stop once a given number of items has been found
   */
  countWith(
    predicate: (value: T, index: number, list: this) => boolean,
    stopAt = Infinity
  ): number {
    let counter = 0

    for (let i = 0; i < this._content.length; i++) {
      if (predicate(this._raw(i) as T, i, this)) {
        counter++

        if (counter === stopAt) {
          return counter
        }
      }
    }

    return counter
  }

  /**
   * Get a slice of the list
   * @param startAt
   * @param endAt
   */
  slice(startAt: number, endAt?: number): List<T> {
    return List.raw(this._content.slice(startAt, endAt))
  }

  /**
   * Get a slice of the list without the last elements
   * @param count The number of end elements to exclude from the slice (default: 1)
   * @example new List([ 'a', 'b', 'c' ]).withoutLast() // List [ 'a', 'b' ]
   * @example new List([ 'a', 'b', 'c' ]).withoutLast(2) // List [ 'a' ]
   */
  withoutLast(count?: number): List<T> {
    return List.raw(this._content.slice(0, this._content.length - (count ?? 1)))
  }

  /**
   * Concatenate this list to other ones
   * @param list
   * @param lists
   */
  concatHead(list: ListLike<T>, ...lists: Array<ListLike<T>>): List<T> {
    return List.raw(
      List.toArray(list)
        .concat(...lists.map((list) => List.toArray(list)))
        .concat(this._content)
    )
  }

  /**
   * Concatenate this list to other ones if they are concrete values
   * @param list
   * @param lists
   */
  concatHeadMaybe(list: Option<ListLike<T>>, ...lists: Array<Option<ListLike<T>>>): List<T> {
    const concat = this.clone()

    for (const list of lists.reverse()) {
      if (list.isSome()) {
        concat.unshift(...list.data)
      }
    }

    if (list.isSome()) {
      concat.unshift(...list.data)
    }

    return concat
  }

  /**
   * Concatenate this list with other ones
   * @param list
   * @param lists
   */
  concat(list: ListLike<T>, ...lists: Array<ListLike<T>>): List<T> {
    return List.raw(
      this._content.concat(List.toArray(list)).concat(...lists.map((list) => List.toArray(list)))
    )
  }

  /**
   * Concatenate this list with other ones if they are concrete values
   * @param list
   * @param lists
   */
  concatMaybe(list: Option<ListLike<T>>, ...lists: Array<Option<ListLike<T>>>): List<T> {
    const concat = this.clone()

    if (list.isSome()) {
      concat.push(...list.data)
    }

    for (const list of lists) {
      if (list.isSome()) {
        concat.push(...list.data)
      }
    }

    return concat
  }

  /**
   * Join this list as a string
   * @param separator
   */
  join(separator?: string): string {
    return this._content.join(separator)
  }

  /**
   * Run a callback for each item
   * @param callback
   */
  forEach(callback: (value: T, index: number, list: this) => void): void {
    this._content.forEach((value, index) => callback(value, index, this))
  }

  /**
   * Check if every item matches a predicate
   * @param predicate
   */
  every(predicate: (value: T, index: number, list: this) => boolean): boolean {
    return this._content.every((value, index) => predicate(value, index, this))
  }

  /**
   * Check if any item matches a predicate
   * @param predicate
   */
  some(predicate: (value: T, index: number, list: this) => boolean): boolean {
    return this._content.some((value, index) => predicate(value, index, this))
  }

  /**
   * Find the first element matching a predicate
   * @param predicate
   */
  find(predicate: (value: T, index: number, list: this) => boolean): Option<T> {
    for (let i = 0; i < this._content.length; i++) {
      if (predicate(this._raw(i), i, this)) {
        return Some(this._raw(i))
      }
    }

    return None()
  }

  /**
   * Check if any element matches a predicate
   * @param predicate
   */
  findHas(predicate: (value: T, index: number, list: this) => boolean): boolean {
    for (let i = 0; i < this._content.length; i++) {
      if (predicate(this._raw(i), i, this)) {
        return true
      }
    }

    return false
  }

  /**
   * Find the index of the first element matching a predicate
   * @param predicate
   */
  findIndex(predicate: (value: T, index: number, list: this) => boolean): Option<number> {
    for (let i = 0; i < this._content.length; i++) {
      if (predicate(this._raw(i), i, this)) {
        return Some(i)
      }
    }

    return None()
  }

  /**
   * Find an item or push a new one at the end of the list otherwise
   * @param predicate
   * @param value
   */
  findOrPush(predicate: (value: T, index: number, list: this) => boolean, value: T): T {
    return this.find(predicate).unwrapOrElse(() => {
      this.push(value)
      return value
    })
  }

  /**
   * Filter items using a predicate
   * @param predicate
   */
  filter(predicate: (value: T, index: number, list: this) => boolean): List<T> {
    return List.raw(this._content.filter((value, index) => predicate(value, index, this)))
  }

  /**
   * Filter and map a list
   * @param func
   */
  filterMap<U>(func: (value: T, index: number, list: this) => Option<U>): List<U> {
    const out = new List<U>()

    for (let i = 0; i < this._content.length; i++) {
      func(this._raw(i), i, this).ifSome((mapped) => out.push(mapped))
    }

    return out
  }

  /**
   * Filter and map a list asynchronously
   * @param func
   */
  async filterMapAsync<U>(
    func: (value: T, index: number, list: this) => Promise<Option<U>>
  ): Promise<List<U>> {
    const out = new List<U>()

    for (let i = 0; i < this._content.length; i++) {
      const filteredMapped = await func(this._raw(i), i, this)
      filteredMapped.ifSome((mapped) => out.push(mapped))
    }

    return out
  }

  /**
   * Create a new list without the current list's duplicate items
   * @param comparator
   */
  withoutDuplicates(comparator: (left: T, right: T) => boolean): List<T> {
    const out = new List<T>()

    for (let i = 0; i < this._content.length; i++) {
      if (this._content.findIndex((val) => comparator(val, this._raw(i))) === i) {
        out.push(this._raw(i))
      }
    }

    return out
  }

  /**
   * Remove all duplicate items from the current list
   * @param comparator
   */
  removeDuplicates(comparator: (left: T, right: T) => boolean): this {
    for (let i = 0; i < this._content.length; i++) {
      if (this._content.findIndex((val) => comparator(val, this._raw(i))) !== i) {
        this._content.splice(i, 1)
        i--
      }
    }

    return this
  }

  /**
   * Detect if an item appears at least two times in the current list
   * @param predicate
   */
  hasDuplicate(predicate: (value: T, index: number, list: this) => boolean): boolean {
    let found = false

    for (let i = 0; i < this._content.length; i++) {
      if (predicate(this._raw(i), i, this)) {
        if (found) {
          return true
        }

        found = true
      }
    }

    return false
  }

  /**
   * Select the first items matching a predicate
   * Equivalent of `.filter(...).firstOnes(...)` but a lot faster
   * @param predicate
   * @param size
   * @example (new List([ 2, -1, 3, 2 ])).select(2, num => num > 0);
   */
  select(predicate: (value: T, index: number, list: this) => boolean, size: number): List<T> {
    const selected = new List<T>()

    for (let i = 0; i < this._content.length; i++) {
      if (predicate(this._raw(i), i, this)) {
        selected.push(this._raw(i))

        if (selected.length === size) {
          return selected
        }
      }
    }

    return selected
  }

  /**
   * Test and map all items in the list using a testing function
   * If all values are mapped to Ok() values, a list with the mapped values is returned
   * As soon as an error (mapped to Err()) is encountered, the error is returned
   * @param tester
   */
  resultable<U, E>(
    tester: (value: T, index: number, list: this) => Result<U, E>
  ): Result<List<U>, E> {
    const mapped = new List<U>()

    for (let i = 0; i < this._content.length; i++) {
      const result = tester(this._raw(i), i, this)

      if (result.isOk()) {
        mapped.push(result.data)
      } else {
        return Err(result.err)
      }
    }

    return Ok(mapped)
  }

  /**
   * Reverse the list's order
   */
  reverse(): List<T> {
    return List.raw(this._content.reverse())
  }

  /**
   * Map items through a function
   * @param mapper
   */
  map<U>(mapper: (value: T, index: number, list: this) => U): List<U> {
    return List.raw(this._content.map((value, index) => mapper(value, index, this)))
  }

  /**
   * Map items through a function and collect the result in an array
   * Faster than .map(...).toArray() or .toArray().map(...)
   * @param mapper
   */
  mapToArray<U>(mapper: (value: T, index: number, list: this) => U): Array<U> {
    const out: Array<U> = []

    for (let i = 0; i < this._content.length; i++) {
      out.push(mapper(this._raw(i), i, this))
    }

    return out
  }

  /**
   * Map items through an asynchronous function
   * @param mapper
   */
  async mapAsync<U>(mapper: (value: T, index: number, list: this) => Promise<U>): Promise<List<U>> {
    const out = new List<U>()

    for (const [index, value] of this.entries()) {
      out.push(await mapper(value, index, this))
    }

    return out
  }

  /**
   * Reduce items to a single value
   * @param callback
   * @param initial
   */
  reduce<U>(callback: (prev: U, current: T, index: number, list: List<T>) => U, initial: U): U {
    return this._content.reduce((prev, curr, index) => callback(prev, curr, index, this), initial)
  }

  /**
   * Reduce items to a single value, starting from the right
   * @param callback
   * @param initial
   */
  reduceRight<U>(
    callback: (prev: U, current: T, index: number, list: List<T>) => U,
    initial: U
  ): U {
    return this._content.reduceRight(
      (prev, curr, index) => callback(prev, curr, index, this),
      initial
    )
  }

  /**
   * Get the minimum value
   * @param numerize Turn the list's values into numbers
   * @param fallback Fallback if the list is empty
   */
  min(numerize: (current: T, index: number, list: List<T>) => number, fallback = 0): number {
    return this._content.reduce(
      (prev, curr, index) => Math.min(prev, numerize(curr, index, this)),
      fallback
    )
  }

  /**
   * Get the maximum value
   * @param numerize Turn the list's values into numbers
   * @param fallback Fallback if the list is empty
   */
  max(numerize: (current: T, index: number, list: List<T>) => number, fallback = 0): number {
    return this._content.reduce(
      (prev, curr, index) => Math.max(prev, numerize(curr, index, this)),
      fallback
    )
  }

  /**
   * Get the smallest value of the list
   * @param numerize Turn the list's values into numbers
   */
  smallest(numerize: (current: T, index: number, list: List<T>) => number): Option<T> {
    if (this._content.length === 0) {
      return None()
    }

    let index = 0,
      minValue = +Infinity

    for (let i = 0; i < this._content.length; i++) {
      const num = numerize(this._raw(i), i, this)

      if (num < minValue) {
        minValue = num
        index = i
      }
    }

    return Some(this._raw(index))
  }

  /**
   * Get the largest value of the list
   * @param numerize Turn the list's values into numbers
   */
  largest(numerize: (current: T, index: number, list: List<T>) => number): Option<T> {
    if (this._content.length === 0) {
      return None()
    }

    let index = 0,
      maxValue = -Infinity

    for (let i = 0; i < this._content.length; i++) {
      const num = numerize(this._raw(i), i, this)

      if (num > maxValue) {
        maxValue = num
        index = i
      }
    }

    return Some(this._raw(index))
  }

  /**
   * Sum the list's values
   * @param numerize Turn the list's values into numbers
   */
  sum(numerize: (current: T, index: number, list: List<T>) => number): number {
    return this._content.reduce((_, curr, index) => numerize(curr, index, this), 0)
  }

  /**
   * Sort the list
   * @param comparator
   */
  sort(comparator?: Comparator<T>): List<T> {
    return List.raw(this._content.sort(comparator))
  }

  /**
   * Add items at the beginning of the list
   * @param items
   */
  unshift(...items: T[]): number {
    return this._content.unshift(...items)
  }

  /**
   * Add items at the end of the list
   * @param items
   */
  push(...items: T[]): number {
    return this._content.push(...items)
  }

  /**
   * Add items at the end of the list if they are not currently in the list
   */
  pushNew(...items: T[]): number {
    return this.push(...items.filter((item) => !this.includes(item)))
  }

  /**
   * Append all elements from another list to the end of this one
   */
  append(list: ListLike<T>): this {
    this.push(...list)
    return this
  }

  /**
   * Move all elements from another list to the end of this one
   * @param list
   */
  take(list: List<T>): number {
    this.push(...list.toArray())
    list.clear()
    return this.length
  }

  /**
   * Remove the first item from the list
   */
  shift(): Option<T> {
    if (this._content.length) {
      return Some(this._content.shift() as T)
    } else {
      return None()
    }
  }

  /**
   * Insert a value at a specific index
   * @param index
   * @param value
   */
  insert(index: number, value: T): number {
    this._content.splice(index, 0, value)
    return this._content.length
  }

  /**
   * Remove the last item from the list
   */
  pop(): Option<T> {
    if (this._content.length) {
      return Some(this._content.pop() as T)
    } else {
      return None()
    }
  }

  /**
   * Remove a slice of the list
   * @param start
   * @param deleteCount
   * @returns Removed items
   */
  splice(start: number, deleteCount?: number): List<T>
  splice(start: number, deleteCount: number, ...items: Array<T>): List<T>
  splice(start: number, deleteCount?: number, ...items: Array<T>): List<T> {
    return List.raw(
      deleteCount === undefined
        ? this._content.splice(start)
        : this._content.splice(start, deleteCount, ...items)
    )
  }

  /**
   * Run a callback for each item and then make the list empty
   * @param callback
   */
  out(callback: (value: T, index: number, list: this) => void): void {
    this.forEach(callback)
    this.clear()
  }

  /**
   * Remove the first occurrence of an item from the list
   * @param item
   */
  removeFirst(item: T): boolean {
    const index = this.indexOf(item)

    if (index !== -1) {
      this._content.splice(index, 1)
      return true
    } else {
      return false
    }
  }

  /**
   * Remove all occurrences of a list of items from the list
   * @param items
   * @returns The number of removed items
   */
  remove(...items: T[]): number {
    let removed = 0

    for (const item of items) {
      let index: number

      while ((index = this._content.indexOf(item)) !== -1) {
        this._content.splice(index, 1)
        removed++
      }
    }

    return removed
  }

  /**
   * Remove value at a given index
   * @param index
   */
  removeAt(index: number): boolean {
    if (index >= this._content.length) {
      return false
    }

    this._content.splice(index, 1)
    return true
  }

  /**
   * Remove all values matching a predicate
   * The provided index is before elements started to be removed
   * @param predicate
   */
  removeWith(predicate: (value: T, index: number, list: this) => boolean): this {
    this._content = this._content.filter((value, index) => !predicate(value, index, this))
    return this
  }

  /**
   * Wrap this list in an outer list
   */
  wrap(): List<List<T>> {
    // TODO: Fix types here
    return (List.raw([this]) as unknown) as List<List<T>>
  }

  /**
   * Remove all items from the list
   */
  clear(): void {
    this._content = []
  }

  /**
   * Iterate over the list's indexes
   */
  keys(): Iter<number> {
    return new Iter(this._content.keys())
  }

  /**
   * Iterate over the list's values
   */
  values(): Iter<T> {
    return new Iter(this._content.values())
  }

  /**
   * Iterate over the list's entries (key-value pairs)
   */
  entries(): Iter<[number, T]> {
    return new Iter(this._content.entries())
  }

  /**
   * Get the list as an independent array
   */
  toArray(): T[] {
    return this._content.slice()
  }

  /**
   * Clone the list
   */
  clone(): List<T> {
    return List.raw(this._content.slice())
  }

  /**
   * Iterate through the list
   */
  iter(): Iter<T> {
    return new Iter(this)
  }

  /**
   * Enumerate the list
   */
  enumerate(): Iter<[number, T]> {
    return new Iter(this).enumerate()
  }

  /**
   * Iterate through the list's values
   */
  [Symbol.iterator](): IterableIterator<T> {
    return this._content[Symbol.iterator]()
  }

  /**
   * Create a list from a raw array (not cloning, no check for contiguity)
   * Instantiation is a lot faster but less safe too
   */
  static raw<T>(content: T[] | Set<T>): List<T> {
    const list = new List<T>()
    list._content = content instanceof Set ? Array.from(content.values()) : content
    return list
  }

  /**
   * Generate a list of n items using a callback
   * @param items The number of items to generate
   * @param callback The generation callback
   */
  static gen<T>(items: number, callback: (index: number, previous: Option<T>) => T): List<T> {
    const list = new List<T>()

    for (let i = 0; i < items; i++) {
      list.push(callback(i, list.last()))
    }

    return list
  }

  /**
   * Generate a list by calling a generation function while the provided predicate returns 'true'
   * @param predicate
   * @param generator
   * @returns The list of generated values
   */
  static while<T>(
    predicate: (index: number, soFar: List<T>) => T,
    generator: (index: number, soFar: List<T>) => T
  ): List<T> {
    const out = new List<T>()

    while (predicate(out.length, out)) {
      out.push(generator(out.length, out))
    }

    return out
  }

  /**
   * Generate a list by calling a generation function until the provided predicate returns 'false'
   * The predicate is called *after* generating values
   * @param predicate
   * @param generator
   * @returns The list of generated values
   */
  static doWhile<T>(
    predicate: (index: number, soFar: List<T>) => T,
    generator: (index: number, soFar: List<T>) => T
  ): List<T> {
    const out = new List<T>()

    do {
      out.push(generator(out.length, out))
    } while (predicate(out.length, out))

    return out
  }

  /**
   * Get an array from a value that may be a list
   * @param values The value to get as an array
   */
  static toArray<T>(values: ListLike<T>): Array<T> {
    return O.isArray(values)
      ? values
      : values instanceof Set
      ? Array.from(values.values())
      : values.toArray()
  }

  /**
   * Create a range
   * @param from
   * @param to
   */
  static range(from: number, to: number): List<number> {
    return List.raw([...new Array(to - from + 1)].map((_, i) => i + from))
  }

  /**
   * Create a range using a generation function
   * @param from
   * @param to
   */
  static rangeWith<T>(
    from: number,
    to: number,
    generator: (value: number, from: number, to: number) => T
  ) {
    return List.raw([...new Array(to - from + 1)].map((_, i) => generator(i + from, from, to)))
  }

  /**
   * Convert a list of results to a single result holding a list in case of success
   * @param list A list of results
   */
  static resultable<T, E>(list: ListLike<Result<T, E>>): Result<List<T>, E> {
    const out = new List<T>()

    for (const item of list) {
      if (item.isErr()) {
        return Err(item.err)
      }

      out.push(item.data)
    }

    return Ok(out)
  }

  /**
   * Convert a list of results to a single result holding a list in case of success
   * Returns all encountered errors (slower than .resultable())
   * @param list A list of results
   */
  static fullResultable<T, E>(list: ListLike<Result<T, E>>): Result<List<T>, List<E>> {
    const ok = new List<T>()
    const err = new List<E>()

    for (const value of list) {
      value.match({
        Ok: (value) => {
          if (err.empty()) ok.push(value)
        },
        Err: (value) => {
          err.push(value)
        },
      })
    }

    return err.empty() ? Ok(ok) : Err(err)
  }
}

/**
 * Consumer functions list
 * @template T Type of consumed data
 */
export class Consumers<T> extends List<(data: T) => void> {
  /**
   * Trigger all consumer functions
   * @param data Consumers' data
   */
  trigger(data: T): void {
    this.forEach((callback) => callback(data))
  }

  /**
   * Resolve all consumer functions
   * @param data Consumers' data
   */
  resolve(data: T): void {
    this.out((callback) => callback(data))
  }
}

/**
 * Constructable string buffer
 * A lot faster than a traditional string when constructing it piece by piece
 *   as it avoids copying the same string over and over
 */
export class StringBuffer extends List<string> {
  /**
   * Create a buffer from a list of strings
   * @param strings
   */
  constructor(...strings: string[]) {
    super(strings)
  }

  /**
   * Count the number of times a string appears in the buffer
   * @param str
   */
  countStr(str: string): number {
    const full = this.join("")
    let counter = 0

    for (let i = 0; i < full.length; i++) {
      if (full.substr(i, str.length) === str) {
        i += str.length - 1
        counter++
      }
    }

    return counter
  }

  /**
   * Count the number of lines in the buffer
   */
  countLines(): number {
    const full = this.join("")
    let counter = 0

    for (let i = 0; i < full.length; i++) {
      if (full.charAt(i) === "\r") {
        if (full.charAt(i + 1) === "\n") {
          i++
        }

        counter++
      }
    }

    return counter
  }

  /**
   * Add a line break at the end of the buffer
   */
  newLine(style = "\n"): number {
    return this.push(style)
  }

  /**
   * Append a new line to the current line
   */
  addLine(line: string, newLine = "\n"): this {
    this.push(line + newLine)
    return this
  }

  /**
   * Append another string buffer to the current one
   */
  appendBuffer(buffer: StringBuffer): this {
    for (const part of buffer) {
      this.push(part)
    }

    return this
  }

  /**
   * Convert the buffer to a single string
   */
  finalize(): string {
    return this.join("")
  }
}

/**
 * List-like structure
 * @template T Type of values
 */
export type ListLike<T> = List<T> | Array<T> | Set<T>

/**
 * Comparator's comparison result
 * Values of this enumeration are the same ones natively used by JavaScript for the Array<T>.sort() method
 */
export enum CompResult {
  Smaller = -1,
  Equal = 0,
  Greater = 1,
}

/**
 * Comparator
 * @template T Type of values to compare
 */
export type Comparator<T> = (a: T, b: T) => CompResult

/**
 * Compare two values
 * @param a Left value
 * @param b Right value
 */
export function compare<T>(a: T, b: T): CompResult {
  if (a < b) {
    return CompResult.Smaller
  } else if (a === b) {
    return CompResult.Equal
  } else {
    return CompResult.Greater
  }
}
