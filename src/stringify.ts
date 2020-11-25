import { TaskCluster } from "./cluster"
import { compare } from "./comparison"
import { DecodingError } from "./decode"
import { Dictionary, RecordDict } from "./dictionary"
import { Either } from "./either"
import { Future } from "./future"
import { Iter } from "./iter"
import { JsonValue } from "./json"
import { List } from "./list"
import { matchString } from "./match"
import { MaybeUninit } from "./maybeUinit"
import { O } from "./objects"
import { None, Option, Some } from "./option"
import { Ref } from "./ref"
import { Regex } from "./regex"
import { Result } from "./result"
import { Task } from "./task"

/**
 * Stringification options
 */
export interface StringifyOptions {
    /**
     * Highlight tokens during stringification (default: no highlighting)
     */
    highlighter?: (
        type:
            | "typename"
            | "prefix"
            | "listIndex"
            | "listValue"
            | "collKey"
            | "collValue"
            | "text"
            | "lineBreak"
            | "unknown"
            | "unknownWrapper"
            | "unknownTypename"
            | "punctuation"
            | "void"
            | "boolean"
            | "string"
            | "number"
            | "voidPrefixValue"
            | "errorMessage"
            | "errorStack"
            | "reference"
            | "referenceWrapper"
            | "remainingProperties"
            | "remainingPropertiesWrapper"
            | "propertyLimit"
            | "propertyLimitWrapper"
            | "recursiveCallLimit"
            | "recursiveCallLimitWrapper"
            | "timeout"
            | "timeoutWrapper",
        str: string
    ) => string

    /**
     * Display numbers using a specific format (default: decimal)
     */
    numberFormat?: "b" | "d" | "o" | "x" | "X"

    /**
     * Display an 'Array' type before an array's content (default: false)
     */
    displayArrayTypeName?: boolean

    /**
     * Display a 'Collection' type before an array's content (default: false)
     */
    displayCollectionTypeName?: boolean

    /**
     * Display indexes in arrays (default: determined depending on the value's structural size)
     */
    arrayIndexes?: boolean

    /**
     * Sort collections' keys alphabetically (default: true)
     */
    sortCollectionKeys?: boolean

    /**
     * Sort record dictionaries' keys alphabetically (default: true)
     */
    sortRecordDictKeys?: boolean

    /**
     * Develop unknown values as objects (default: false)
     * Non-object unknown values won't be developed even if this option is turned on
     */
    developUnknownValues?: boolean

    /**
     * Use the system's locale for dates (default: true)
     * If disabled, will fall back to UTC
     */
    useLocaleForDates?: boolean

    /**
     * Pretty-print the value on multiple lines (default: determined depending on the value's structural size)
     */
    prettify?: boolean

    /**
     * Track references (default: true)
     * Disabling this option will increase performance but will make stringification crash with cyclic references
     */
    trackReferences?: boolean

    /**
     * Stringify unsupported types
     * @param value The value to stringify
     * @param references Referenced objects, array index is the object's reference ID
     * @param duplicateRefs Objects that are referenced at least two times in the current value
     * @returns A raw stringifyable object, or `null` if the extension doesn't know how to stringify this type
     */
    stringifyExt?: (value: unknown, references: unknown[], duplicateRefs: Set<number>) => RawStringifyableItem | null

    /**
     * How to stringify 'undefined' values (default: '<unknown>')
     */
    undefinedStr?: string

    /**
     * How to stringify 'null' values (default: '<null>')
     */
    nullStr?: string

    /**
     * Perform a full stringification even on primitive values (default: true)
     * When set to 'false', primitives values will just receive a '.toString()' call (except for 'null' and 'undefined')
     * The highlighter is also disabled
     */
    stringifyPrimitives?: boolean

    /**
     * Maximum number of items to show from lists (default: 100)
     */
    arrayLengthLimit?: number

    /**
     * Maximum number of items to show from collections (default: Infinity)
     */
    collectionPropertiesLimit?: number

    /**
     * Limit the number of recursive call during stringification (default: 1000)
     * Setting a number too high will induce risks of high memory, CPU usage and latency when stringifying extremely large objects
     */
    recursiveCallsLimit?: number

    /**
     * Limit the time used to process an item (default: 300'000 ms)
     * Setting a number too high will induce risks of high memory, CPU usage and latency when stringifying extremely large objects
     */
    limitStringificationTime?: number
}

/**
 * Stringify a value to a human-readable string
 * @param value
 * @param options
 */
export function stringify(value: unknown, options?: StringifyOptions): string {
    return stringifyRaw(makeStringifyable(value, options), options)
}

/**
 * Stringifyable format
 */
export interface RawStringifyable {
    rootItem: RawStringifyableItem
    duplicateRefs: Set<number>
}

/**
 * Stringifyable item
 */
export type RawStringifyableItem = { ref: null | number } & (
    | { type: "void"; value: null | undefined }
    | { type: "boolean"; value: boolean }
    | { type: "number"; value: number }
    | { type: "string"; value: string }
    | { type: "text"; text: string }
    | { type: "wrapped"; typename: string; content?: RawStringifyableItem }
    | { type: "list"; typename: false | string; content: Array<{ index: number; value: RawStringifyableItem }>; cut: null | number }
    | {
          type: "collection"
          typename: false | string
          content: Array<{ key: RawStringifyableItem; value: RawStringifyableItem }>
          nativeColor?: true
          cut: null | number
      }
    | { type: "error"; typename: string; message: string; stack: Option<string> }
    | { type: "prefixed"; typename: string; prefixed: Array<[string, Option<RawStringifyableItem>]> }
    | { type: "unknown"; typename: string | undefined }
    | {
          type: "unknownObj"
          typename: string | undefined
          content: Array<{ key: RawStringifyableItem; value: RawStringifyableItem }>
          cut: null | number
      }
    | { type: "reference"; id: number }
    | { type: "recursiveCallLimit"; limit: number }
    | { type: "timeout"; limit: number }
)

/**
 * Convert a value to a stringifyable format
 * @param value
 * @param numberFormat
 */
export function makeStringifyable(value: unknown, options?: StringifyOptions): RawStringifyable {
    function makeStringifyableItem(value: unknown, l: number): RawStringifyableItem {
        if (l > recursiveCallLimit) {
            return { ref: null, type: "recursiveCallLimit", limit: recursiveCallLimit }
        }

        if (Date.now() - started > timeLimit) {
            return { ref: null, type: "timeout", limit: timeLimit }
        }

        const _nested = (value: unknown) => makeStringifyableItem(value, l + 1)

        if (value === null) {
            return { ref: null, type: "void", value: null }
        }

        if (value === undefined) {
            return { ref: null, type: "void", value: undefined }
        }

        if (value === false || value === true) {
            return { ref: null, type: "boolean", value }
        }

        if (typeof value === "number") {
            return {
                ref: null,
                type: "number",
                value,
            }
        }

        if (typeof value === "string") {
            return { ref: null, type: "string", value }
        }

        if (value instanceof Error) {
            return {
                ref: null,
                type: "error",
                typename: "Error",
                message: value.message,
                stack: Option.maybe(value.stack),
            }
        }

        if (value instanceof RegExp) {
            return {
                ref: null,
                type: "wrapped",
                typename: "RegExp",
                content: { ref: null, type: "text", text: value.toString() },
            }
        }

        if (value instanceof Function) {
            return {
                ref: null,
                type: "prefixed",
                typename: "Function",
                prefixed: [["name", Some(_nested(value.name))]],
            }
        }

        if (value instanceof Date) {
            return {
                ref: null,
                type: "wrapped",
                typename: "Date",
                content: { ref: null, type: "text", text: options?.useLocaleForDates !== false ? value.toLocaleString() : value.toUTCString() },
            }
        }

        if (value instanceof Symbol) {
            return {
                ref: null,
                type: "wrapped",
                typename: "Symbol",
                content: {
                    ref: null,
                    type: "string",
                    value: value.description ?? "",
                },
            }
        }

        if (options?.trackReferences !== false) {
            const index = refs.indexOf(value)

            if (index !== -1) {
                duplicateRefs.add(index)
                return { ref: null, type: "reference", id: index }
            }

            refs.push(value)
            ref++
        }

        if (Option.is(value)) {
            return value.match({
                Some: (value) => ({ ref, type: "wrapped", typename: "Some", content: _nested(value) }),
                None: () => ({ ref, type: "wrapped", typename: "None" }),
            })
        }

        if (Result.is(value)) {
            return value.match({
                Ok: (value) => ({ ref, type: "wrapped", typename: "Ok", content: _nested(value) }),
                Err: (err) => ({ ref, type: "wrapped", typename: "Err", content: _nested(err) }),
            })
        }

        if (value instanceof List) {
            const cut = value.length <= arrayLengthLimit ? null : value.length - arrayLengthLimit

            return {
                ref,
                type: "list",
                typename: "List",
                content: (!cut ? value.toArray() : value.firstOnes(value.length - cut).toArray()).map((item, index) => ({
                    index,
                    value: _nested(item),
                })),
                cut,
            }
        }

        if (value instanceof RecordDict) {
            const cut = value.size <= collectionPropertiesLimit ? null : value.size - collectionPropertiesLimit

            return {
                ref,
                type: "collection",
                typename: "RecordDict",
                content:
                    options?.sortRecordDictKeys === false
                        ? value
                              .entries()
                              .take(Math.min(value.size, collectionPropertiesLimit))
                              .collectArray()
                              .map(([key, value]) => ({ key: _nested(key), value: _nested(value) }))
                        : value
                              .entries()
                              .take(Math.min(value.size, collectionPropertiesLimit))
                              .collect()
                              .sort(([a], [b]) => compare(a, b))
                              .map(([key, value]) => ({ key: _nested(key), value: _nested(value) }))
                              .toArray(),
                cut,
            }
        }

        if (value instanceof Dictionary) {
            const cut = value.size <= collectionPropertiesLimit ? null : value.size - collectionPropertiesLimit

            return {
                ref,
                type: "collection",
                typename: "Dictionary",
                content: value
                    .entries()
                    .take(Math.min(value.size, collectionPropertiesLimit))
                    .collectArray()
                    .map(([key, value]) => ({ key: _nested(key), value: _nested(value) })),
                cut,
            }
        }

        if (O.isArray(value)) {
            const cut = value.length <= arrayLengthLimit ? null : value.length - arrayLengthLimit

            return {
                ref,
                type: "list",
                typename: false,
                content: value.slice(0, Math.min(value.length, arrayLengthLimit)).map((item, index) => ({ index, value: _nested(item) })),
                cut,
            }
        }

        if (O.isCollection(value)) {
            const entries = O.entries(value)
            const cut = entries.length <= collectionPropertiesLimit ? null : entries.length - collectionPropertiesLimit

            if (options?.sortCollectionKeys !== false) {
                entries.sort(([a], [b]) => compare(a, b))
            }

            return {
                ref,
                type: "collection",
                typename: false,
                content: (!cut ? entries : entries.slice(0, entries.length - cut)).map(([key, value]) => ({
                    key: _nested(key),
                    value: _nested(value),
                })),
                nativeColor: true,
                cut,
            }
        }

        if (value instanceof JsonValue) {
            return {
                ref,
                type: "prefixed",
                typename: "JsonValue",
                prefixed: [["inner", Some(_nested(value.inner()))]],
            }
        }

        if (value instanceof DecodingError) {
            return {
                ref,
                type: "error",
                typename: "DecodingError",
                message: value.render(),
                stack: None(),
            }
        }

        if (value instanceof Future) {
            return {
                ref,
                type: "prefixed",
                typename: "Future",
                prefixed: [
                    value.match({
                        Pending: () => ["Pending", None()],
                        Complete: (value) => ["Complete", Some(_nested(value))],
                    }),
                ],
            }
        }

        if (value instanceof Regex) {
            return {
                ref,
                type: "prefixed",
                typename: "Regex",
                prefixed: [
                    ["expression", Some(_nested(value.inner))],
                    ["names", Some(_nested(value.names))],
                ],
            }
        }

        if (value instanceof Iter) {
            return { ref, type: "prefixed", typename: "Iter", prefixed: [["pointer", Some(_nested(value.pointer))]] }
        }

        if (value instanceof MaybeUninit) {
            return {
                ref,
                type: "prefixed",
                typename: "MaybeUninit",
                prefixed: [
                    value.match({
                        Init: (value) => ["Init", Some(_nested(value))],
                        Uninit: () => ["Uninit", None()],
                    }),
                ],
            }
        }

        if (value instanceof Either) {
            return value.match({
                Left: (value) => ({ ref, type: "wrapped", typename: "Left", content: _nested(value) }),
                Right: (right) => ({ ref, type: "wrapped", typename: "Err", content: _nested(right) }),
            })
        }

        if (value instanceof Ref) {
            return {
                ref,
                type: "prefixed",
                typename: "Ref",
                prefixed: [
                    value.match({
                        Available: (value) => ["Available", Some(_nested(value))],
                        Destroyed: () => ["Destroyed", None()],
                    }),
                ],
            }
        }

        if (value instanceof Set) {
            const cut = value.size <= arrayLengthLimit ? null : value.size - arrayLengthLimit
            let index = 0

            return {
                ref,
                type: "list",
                typename: "Set",
                content: (!cut ? [...value.entries()] : new Iter(value.entries()).take(value.size - cut).collectArray()).map(([value]) => ({
                    index: index++,
                    value: _nested(value),
                })),
                cut,
            }
        }

        if (value instanceof Map) {
            const cut = value.size <= collectionPropertiesLimit ? null : value.size - collectionPropertiesLimit

            return {
                ref,
                type: "collection",
                typename: "Map",
                content: (!cut ? [...value.entries()] : new Iter(value.entries()).take(value.size - cut).collectArray()).map(([key, value]) => ({
                    key: _nested(key),
                    value: _nested(value),
                })),
                cut,
            }
        }

        if (value instanceof WeakSet) {
            return {
                ref,
                type: "wrapped",
                typename: "WeakSet",
            }
        }

        if (value instanceof WeakMap) {
            return {
                ref,
                type: "wrapped",
                typename: "WeakMap",
            }
        }

        if (value instanceof Task) {
            return {
                ref,
                type: "prefixed",
                typename: "Task",
                prefixed: [
                    value.match({
                        Created: () => ["Created", None()],
                        Pending: () => ["Pending", None()],
                        RunningStep: () => ["RunningStep", None()],
                        Fulfilled: (value) => ["Fulfilled", Some(_nested(value))],
                        Failed: (err) => ["Failed", Some(_nested(err))],
                    }),
                ],
            }
        }

        if (value instanceof TaskCluster) {
            return {
                ref,
                type: "prefixed",
                typename: "TaskCluster",
                prefixed: [
                    value.match({
                        Created: () => ["Created", None()],
                        Running: () => ["Running", None()],
                        Paused: () => ["Paused", None()],
                        Aborted: () => ["Aborted", None()],
                        Fulfilled: (value) => ["Fulfilled", Some(_nested(value))],
                        Failed: (err) => ["Failed", Some(_nested(err))],
                    }),
                ],
            }
        }

        if (options?.developUnknownValues) {
            const entries = Result.fallible(() => O.entries(value as object))

            if (entries.isOk()) {
                const fullEntries = entries.data

                const cut = entries.data.length <= collectionPropertiesLimit ? null : entries.data.length - collectionPropertiesLimit

                if (options?.sortCollectionKeys !== false) {
                    fullEntries.sort(([a, b]) => compare(a, b))
                }

                return {
                    ref,
                    type: "unknownObj",
                    typename: (value as any)?.constructor?.name,
                    content: (!cut ? fullEntries : fullEntries.slice(0, fullEntries.length - cut)).map(([key, value]) => ({
                        key: _nested(key),
                        value: _nested(value),
                    })),
                    cut,
                }
            }
        }

        if ((value as any).__tsCoreStringify instanceof Function) {
            return _nested((value as any).__tsCoreStringify())
        }

        return options?.stringifyExt?.(value, refs, duplicateRefs) ?? { ref, type: "unknown", typename: (value as any)?.constructor?.name }
    }

    const refs: unknown[] = []
    const duplicateRefs = new Set<number>()
    let ref = -1

    const recursiveCallLimit = options?.recursiveCallsLimit ?? 1_000

    const timeLimit = options?.limitStringificationTime ?? 300_000
    const started = Date.now()

    const arrayLengthLimit = options?.arrayLengthLimit ?? 100
    const collectionPropertiesLimit = options?.collectionPropertiesLimit ?? Infinity

    return { rootItem: makeStringifyableItem(value, 0), duplicateRefs }
}

/**
 * Check if a stringifyable can be displayed in a single line
 * @param stri
 */
export function isStringifyableLinear(stri: RawStringifyableItem): boolean {
    switch (stri.type) {
        case "void":
        case "boolean":
        case "number":
        case "string":
            return true

        case "text":
            return !stri.text.includes("\n")

        case "wrapped":
            return stri.content ? isStringifyableLinear(stri.content) : true

        case "list":
            return stri.content.length >= 1 && stri.content.every(({ value }) => isStringifyableLinear(value))

        case "collection":
        case "unknownObj":
            return (
                stri.content.length >= 1 &&
                stri.content.every(({ key, value }) => isStringifyableLinear(value) && (typeof key === "number" ? true : isStringifyableLinear(key)))
            )

        case "error":
            return stri.stack.isNone()

        case "prefixed":
            return stri.prefixed.every(([prefix, value]) => value.map((value) => isStringifyableLinear(value)).unwrapOr(true))

        case "unknown":
            return true

        case "reference":
            return true

        case "recursiveCallLimit":
            return true

        case "timeout":
            return true
    }
}

/**
 * Check if a stringifyable is child-less so it can be displayed on a single line even in prettified mode
 * @param stri
 */
export function isStringifyableChildless(stri: RawStringifyableItem): boolean {
    switch (stri.type) {
        case "void":
        case "boolean":
        case "number":
        case "string":
            return true

        case "text":
            return !stri.text.includes("\n")

        case "wrapped":
            return stri.content ? isStringifyableChildless(stri.content) : true

        case "list":
            return stri.content.length === 0

        case "collection":
        case "unknownObj":
            return stri.content.length === 0

        case "error":
            return stri.stack.isNone()

        case "prefixed":
            return stri.prefixed.length <= 1

        case "unknown":
            return true

        case "reference":
            return true

        case "recursiveCallLimit":
            return true

        case "timeout":
            return true
    }
}

/**
 * Stringify a raw stringifyable value
 * @param raw
 * @param options
 */
export function stringifyRaw(raw: RawStringifyable, options?: StringifyOptions): string {
    function stringifyItem(item: RawStringifyableItem, options: StringifyOptions): string {
        if (!options?.stringifyPrimitives) {
            switch (item.type) {
                case "void":
                    return item.value === undefined ? "undefined" : "null"

                case "number":
                case "boolean":
                case "string":
                    return item.value.toString()
            }
        }

        const prettify = options?.prettify ?? !isStringifyableLinear(item)

        function _nested(item: RawStringifyableItem, addOptions?: Partial<StringifyOptions>): string {
            return stringifyItem(
                item,
                options.stringifyPrimitives
                    ? addOptions
                        ? { ...options, ...addOptions }
                        : options
                    : addOptions
                    ? { ...options, ...addOptions, stringifyPrimitives: true }
                    : { ...options, stringifyPrimitives: true }
            )
        }

        function _lines(str: string, prefixLength: number): string {
            return str.split(/\n/).join(prettify ? "\n  " + " ".repeat(prefixLength) : highlighter("lineBreak", "\\n"))
        }

        const refMarker =
            item.ref === null || !raw.duplicateRefs.has(item.ref)
                ? ""
                : highlighter("referenceWrapper", "<ref: ") + highlighter("reference", item.ref.toString()) + highlighter("referenceWrapper", ">")

        const cut =
            "cut" in item && item.cut !== null
                ? [
                      highlighter("remainingPropertiesWrapper", "<") +
                          highlighter("remainingProperties", item.cut.toString()) +
                          highlighter("remainingPropertiesWrapper", ` other item${item.cut > 1 ? "s" : ""}>`),
                  ]
                : []

        switch (item.type) {
            case "void":
                return highlighter("void", item.value === undefined ? options?.undefinedStr ?? "<undefined>" : options?.nullStr ?? "<null>")

            case "boolean":
                return highlighter("boolean", item.value.toString())

            case "number":
                return highlighter(
                    "number",
                    matchString(options?.numberFormat || "d", {
                        b: () => "0b" + item.value.toString(2),
                        o: () => "0o" + item.value.toString(8),
                        d: () => item.value.toString(),
                        x: () => "0x" + item.value.toString(16).toLowerCase(),
                        X: () => "0x" + item.value.toString(16).toUpperCase(),
                    })
                )

            case "string":
                return highlighter("string", JSON.stringify(item.value))

            case "text":
                return highlighter("text", item.text)

            case "wrapped":
                return (
                    highlighter("typename", item.typename) +
                    (refMarker ? " " + refMarker + " " : "") +
                    highlighter("punctuation", "(") +
                    (item.content && !isStringifyableChildless(item) ? (prettify ? "\n  " : "") : "") +
                    (item.content ? _lines(_nested(item.content), 0) : "") +
                    (item.content && !isStringifyableChildless(item) ? (prettify ? "\n" : "") : "") +
                    highlighter("punctuation", ")")
                )

            case "list":
                const listTypename =
                    item.typename === false
                        ? options?.displayArrayTypeName
                            ? highlighter("typename", "Array")
                            : ""
                        : highlighter("typename", item.typename)

                return (
                    listTypename +
                    (listTypename ? " " : "") +
                    (refMarker ? refMarker + " " : "") +
                    highlighter("punctuation", "[") +
                    (item.content && !isStringifyableChildless(item) ? (prettify ? "\n  " : " ") : "") +
                    (item.content || [])
                        .map(
                            ({ index, value }) =>
                                (options?.arrayIndexes === true || (options?.arrayIndexes === undefined && !isStringifyableChildless(value))
                                    ? highlighter("listIndex", index.toString()) + highlighter("punctuation", ":") + " "
                                    : "") + highlighter("listValue", _lines(_nested(value), 0))
                        )
                        .concat(cut)
                        .join(highlighter("punctuation", ",") + (prettify && !isStringifyableChildless(item) ? "\n  " : " ")) +
                    (item.content && !isStringifyableChildless(item) ? (prettify ? "\n" : " ") : "") +
                    highlighter("punctuation", "]")
                )

            case "collection":
            case "unknownObj":
                const collTypename =
                    item.type === "unknownObj"
                        ? highlighter("unknownTypename", item.typename ?? "unknown type")
                        : item.typename === false
                        ? options?.displayCollectionTypeName
                            ? highlighter("typename", "Collection")
                            : ""
                        : highlighter("typename", item.typename)

                return (
                    collTypename +
                    (collTypename ? " " : "") +
                    (refMarker ? refMarker + " " : "") +
                    highlighter("punctuation", "{") +
                    (item.content && !isStringifyableChildless(item) ? (prettify ? "\n  " : " ") : "") +
                    (item.content || [])
                        .map(
                            ({ key, value }) =>
                                highlighter(
                                    "collKey",
                                    _nested(key, {
                                        prettify: false,
                                        highlighter: undefined,
                                    })
                                ) +
                                highlighter("punctuation", ":") +
                                " " +
                                highlighter("collValue", _lines(_nested(value), 0))
                        )
                        .concat(cut)
                        .join(highlighter("punctuation", ",") + (prettify && !isStringifyableChildless(item) ? "\n  " : " ")) +
                    (item.content && !isStringifyableChildless(item) ? (prettify ? "\n" : " ") : "") +
                    highlighter("punctuation", "}")
                )

            case "error":
                return (
                    highlighter("typename", item.typename) +
                    (refMarker ? " " + refMarker + " " : "") +
                    highlighter("punctuation", "(") +
                    item.stack
                        .map(
                            (stack) =>
                                (prettify ? "\n  " : "") +
                                highlighter("prefix", "error: ") +
                                highlighter("errorMessage", _lines(item.message, 7)) +
                                (prettify ? (item.message.includes("\n") ? "\n" : "") + "\n  " : highlighter("punctuation", ",") + " ") +
                                highlighter("prefix", "stack: ") +
                                highlighter("errorStack", _lines(stack, 7)) +
                                (prettify ? "\n" : "") +
                                highlighter("punctuation", "}")
                        )
                        .unwrapOrElse(
                            () =>
                                highlighter("prefix", "error:") +
                                " " +
                                highlighter("errorMessage", _lines(item.message, 7)) +
                                highlighter("punctuation", ")")
                        )
                )

            case "prefixed":
                return (
                    highlighter("typename", item.typename) +
                    " " +
                    (refMarker ? refMarker + " " : "") +
                    highlighter("punctuation", "{") +
                    (!isStringifyableChildless(item) ? (prettify ? "\n  " : " ") : "") +
                    (item.prefixed || [])
                        .map(
                            ([prefix, value]) =>
                                highlighter("prefix", prefix) +
                                highlighter("punctuation", ":") +
                                " " +
                                value
                                    .map((value) => highlighter("collValue", _lines(_nested(value), 0)))
                                    .unwrapOrElse(() => highlighter("voidPrefixValue", "-"))
                        )
                        .join(highlighter("punctuation", ",") + (prettify && !isStringifyableChildless(item) ? "\n  " : " ")) +
                    (!isStringifyableChildless(item) ? (prettify ? "\n" : " ") : "") +
                    highlighter("punctuation", "}")
                )

            case "unknown":
                return (
                    highlighter("punctuation", "<") +
                    highlighter("unknownWrapper", "Instance of:") +
                    " " +
                    highlighter("unknown", item.typename ?? "unknown type") +
                    highlighter("punctuation", ">") +
                    (refMarker ? " " + refMarker : "")
                )

            case "reference":
                return highlighter("referenceWrapper", "<*ref ") + highlighter("reference", item.id.toString()) + highlighter("referenceWrapper", ">")

            case "recursiveCallLimit":
                return (
                    highlighter("recursiveCallLimitWrapper", "<recursive call limit after ") +
                    highlighter("recursiveCallLimit", item.limit.toString()) +
                    highlighter("recursiveCallLimitWrapper", " calls>")
                )

            case "timeout":
                return (
                    highlighter("timeoutWrapper", "<recursive call limit after ") +
                    highlighter("timeout", item.limit.toString()) +
                    highlighter("timeoutWrapper", " calls>")
                )
        }
    }

    const highlighter = options?.highlighter ?? ((type, str) => str)

    return stringifyItem(raw.rootItem, options ?? {})
}

/**
 * Stringifyable value, used as a guard to ensure the inner type is RawStringifyable in format functions
 */
export class Stringifyable {
    /**
     * Create a stringifyable value
     */
    constructor(public stringifyable: RawStringifyable, public options?: StringifyOptions) {}

    /**
     * Create a stringifyable value
     */
    static create(value: unknown, options?: StringifyOptions): Stringifyable {
        return new Stringifyable(makeStringifyable(value, options), options)
    }

    /**
     * Stringify the value
     * @param additionalOptions Additional stringification options
     */
    stringify(additionalOptions?: StringifyOptions): string {
        return stringifyRaw(this.stringifyable, additionalOptions ? { ...this.options, ...additionalOptions } : this.options)
    }
}

/**
 * Non-natively stringifyable type
 */
export interface TSCoreStringifyable {
    __tsCoreStringify(): RawStringifyable
}
