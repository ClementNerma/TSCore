import { TaskCluster } from './cluster'
import { compare } from './comparison'
import { DecodingError } from './decode'
import { Dictionary, RecordDict } from './dictionary'
import { Either } from './either'
import { Future } from './future'
import { Iter } from './iter'
import { JsonValue } from './json'
import { List } from './list'
import { matchString } from './match'
import { MaybeUninit } from './maybeUinit'
import { O } from './objects'
import { None, Option, Some, isOption } from './option'
import { Ref } from './ref'
import { Regex } from './regex'
import { isResult } from './result'
import { Task } from './task'

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
            | "punctuation"
            | "void"
            | "boolean"
            | "string"
            | "number"
            | "voidPrefixValue"
            | "errorMessage"
            | "errorStack",
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
     * Display indexes in arrays (default: true)
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
     * Pretty-print the value on multiple lines (default: determined depending on the value's structural size)
     */
    prettify?: boolean

    /**
     * Stringify unsupported types
     * @param value The value to stringify
     * @returns A raw stringifyable object, or `null` if the extension doesn't know how to stringify this type
     */
    stringifyExt?: (value: unknown) => RawStringifyable | null

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
export type RawStringifyable =
    | { type: "void"; value: null | undefined }
    | { type: "boolean"; value: boolean }
    | { type: "number"; value: number }
    | { type: "string"; value: string }
    | { type: "text"; text: string }
    | { type: "wrapped"; typename: string; content?: RawStringifyable }
    | { type: "list"; typename: false | string; content: Array<{ index: number; value: RawStringifyable }> }
    | { type: "collection"; typename: false | string; content: Array<{ key: RawStringifyable; value: RawStringifyable }>; nativeColor?: true }
    | { type: "error"; typename: string; message: string; stack: Option<string> }
    | { type: "prefixed"; typename: string; prefixed: Array<[string, Option<RawStringifyable>]> }
    | { type: "unknown"; typename: string | undefined }

/**
 * Convert a value to a stringifyable format
 * @param value
 * @param numberFormat
 */
export function makeStringifyable(value: unknown, options?: StringifyOptions): RawStringifyable {
    const _nested = (value: unknown) => makeStringifyable(value, options)

    if (value === null) {
        return { type: "void", value: null }
    }

    if (value === undefined) {
        return { type: "void", value: undefined }
    }

    if (value === false || value === true) {
        return { type: "boolean", value }
    }

    if (typeof value === "number") {
        return {
            type: "number",
            value,
        }
    }

    if (typeof value === "string") {
        return { type: "string", value }
    }

    if (isOption(value)) {
        return value.match({
            Some: (value) => ({ type: "wrapped", typename: "Some", content: _nested(value) }),
            None: () => ({ type: "wrapped", typename: "None" }),
        })
    }

    if (isResult(value)) {
        return value.match({
            Ok: (value) => ({ type: "wrapped", typename: "Ok", content: _nested(value) }),
            Err: (err) => ({ type: "wrapped", typename: "Err", content: _nested(err) }),
        })
    }

    if (value instanceof List) {
        return {
            type: "list",
            typename: "List",
            content: value.toArray().map((item, index) => ({ index, value: _nested(item) })),
        }
    }

    if (value instanceof RecordDict) {
        return {
            type: "collection",
            typename: "RecordDict",
            content:
                options?.sortRecordDictKeys === false
                    ? value
                          .entries()
                          .collectArray()
                          .map(([key, value]) => ({ key: _nested(key), value: _nested(value) }))
                    : value
                          .entries()
                          .collect()
                          .sort(([a], [b]) => compare(a, b))
                          .map(([key, value]) => ({ key: _nested(key), value: _nested(value) }))
                          .toArray(),
        }
    }

    if (value instanceof Dictionary) {
        return {
            type: "collection",
            typename: "Dictionary",
            content: value
                .entries()
                .collectArray()
                .map(([key, value]) => ({ key: _nested(key), value: _nested(value) })),
        }
    }

    if (O.isArray(value)) {
        return {
            type: "list",
            typename: false,
            content: value.map((item, index) => ({ index, value: _nested(item) })),
        }
    }

    if (O.isCollection(value)) {
        return {
            type: "collection",
            typename: false,
            content:
                options?.sortCollectionKeys === false
                    ? O.entries(value).map(([key, value]) => ({ key: _nested(key), value: _nested(value) }))
                    : O.entries(value)
                          .sort(([a], [b]) => compare(a, b))
                          .map(([key, value]) => ({ key: _nested(key), value: _nested(value) })),
            nativeColor: true,
        }
    }

    if (value instanceof JsonValue) {
        return {
            type: "prefixed",
            typename: "JsonValue",
            prefixed: [["inner", Some(_nested(value.inner()))]],
        }
    }

    if (value instanceof Error) {
        return {
            type: "error",
            typename: "Error",
            message: value.message,
            stack: Option.maybe(value.stack),
        }
    }

    if (value instanceof DecodingError) {
        return {
            type: "error",
            typename: "DecodingError",
            message: value.render(),
            stack: None(),
        }
    }

    if (value instanceof Future) {
        return {
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

    if (value instanceof RegExp) {
        return {
            type: "wrapped",
            typename: "RegExp",
            content: { type: "text", text: value.toString() },
        }
    }

    if (value instanceof Regex) {
        return {
            type: "prefixed",
            typename: "Regex",
            prefixed: [
                ["expression", Some(_nested(value.inner))],
                ["names", Some(_nested(value.names))],
            ],
        }
    }

    if (value instanceof Iter) {
        return { type: "prefixed", typename: "Iter", prefixed: [["pointer", Some(_nested(value.pointer))]] }
    }

    if (value instanceof MaybeUninit) {
        return {
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
            Left: (value) => ({ type: "wrapped", typename: "Left", content: _nested(value) }),
            Right: (right) => ({ type: "wrapped", typename: "Err", content: _nested(right) }),
        })
    }

    if (value instanceof Ref) {
        return {
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
        return {
            type: "list",
            typename: "Set",
            content: [...value.entries()].map(([index, value]) => ({ index, value })),
        }
    }

    if (value instanceof Map) {
        return {
            type: "collection",
            typename: "Map",
            content: [...value.entries()].map(([key, value]) => ({ key, value })),
        }
    }

    if (value instanceof Task) {
        return {
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

    if (typeof (value as any).__tsCoreStringify === "function") {
        return (value as any).__tsCoreStringify()
    }

    return options?.stringifyExt?.(value) ?? { type: "unknown", typename: (value as any).constructor?.name }
}

/**
 * Check if a stringifyable can be displayed in a single line
 * @param stri
 */
export function isStringifyableLinear(stri: RawStringifyable): boolean {
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
    }
}

/**
 * Check if a stringifyable is child-less so it can be displayed on a single line even in prettified mode
 * @param stri
 */
export function isStringifyableChildless(stri: RawStringifyable): boolean {
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
            return stri.content.length === 0

        case "error":
            return stri.stack.isNone()

        case "prefixed":
            return stri.prefixed.length <= 1

        case "unknown":
            return true
    }
}

/**
 * Stringify a raw stringifyable value
 * @param stri
 * @param options
 */
export function stringifyRaw(stri: RawStringifyable, options?: StringifyOptions): string {
    if (!options?.stringifyPrimitives) {
        switch (stri.type) {
            case "void":
                return stri.value === undefined ? "undefined" : "null"

            case "number":
            case "boolean":
            case "string":
                return stri.value.toString()
        }
    }

    const prettify = options?.prettify ?? !isStringifyableLinear(stri)
    const highlighter = options?.highlighter ?? ((type, str) => str)

    function _nested(stri: RawStringifyable, addOptions: Partial<StringifyOptions> = {}): string {
        return stringifyRaw(stri, { ...options, ...addOptions, stringifyPrimitives: true })
    }

    function _lines(str: string, prefixLength: number): string {
        return str.split(/\n/).join(prettify ? "\n  " + " ".repeat(prefixLength) : highlighter("lineBreak", "\\n"))
    }

    switch (stri.type) {
        case "void":
            return highlighter("void", stri.value === undefined ? options?.undefinedStr ?? "<undefined>" : options?.nullStr ?? "<null>")

        case "boolean":
            return highlighter("boolean", stri.value.toString())

        case "number":
            return highlighter(
                "number",
                matchString(options?.numberFormat || "d", {
                    b: () => "0b" + stri.value.toString(2),
                    o: () => "0o" + stri.value.toString(8),
                    d: () => stri.value.toString(),
                    x: () => "0x" + stri.value.toString(16).toLowerCase(),
                    X: () => "0x" + stri.value.toString(16).toUpperCase(),
                })
            )

        case "string":
            return highlighter("string", JSON.stringify(stri.value))

        case "text":
            return highlighter("text", stri.text)

        case "wrapped":
            return (
                highlighter("typename", stri.typename) +
                highlighter("punctuation", "(") +
                (stri.content && !isStringifyableChildless(stri) ? (prettify ? "\n  " : "") : "") +
                (stri.content ? _lines(_nested(stri.content), 0) : "") +
                (stri.content && !isStringifyableChildless(stri) ? (prettify ? "\n" : "") : "") +
                highlighter("punctuation", ")")
            )

        case "list":
            return (
                (stri.typename === false
                    ? options?.displayArrayTypeName
                        ? highlighter("typename", "Array")
                        : ""
                    : highlighter("typename", stri.typename)) +
                " " +
                highlighter("punctuation", "[") +
                (stri.content && !isStringifyableChildless(stri) ? (prettify ? "\n  " : " ") : "") +
                (stri.content || [])
                    .map(
                        ({ index, value }) =>
                            (options?.arrayIndexes ?? true
                                ? highlighter("listIndex", index.toString()) + highlighter("punctuation", ":") + " "
                                : "") + highlighter("listValue", _lines(_nested(value), 0))
                    )
                    .join(highlighter("punctuation", ",") + (prettify && !isStringifyableChildless(stri) ? "\n  " : " ")) +
                (stri.content && !isStringifyableChildless(stri) ? (prettify ? "\n" : " ") : "") +
                highlighter("punctuation", "]")
            )

        case "collection":
            return (
                (stri.typename === false
                    ? options?.displayCollectionTypeName
                        ? highlighter("typename", "Collection")
                        : ""
                    : highlighter("typename", stri.typename)) +
                " " +
                highlighter("punctuation", "{") +
                (stri.content && !isStringifyableChildless(stri) ? (prettify ? "\n  " : " ") : "") +
                (stri.content || [])
                    .map(
                        ({ key, value }) =>
                            highlighter(
                                "collKey",
                                _nested(key, { prettify: false, highlighter: stri.nativeColor ? undefined : options?.highlighter })
                            ) +
                            highlighter("punctuation", ":") +
                            " " +
                            highlighter("collValue", _lines(_nested(value), 0))
                    )
                    .join(highlighter("punctuation", ",") + (prettify && !isStringifyableChildless(stri) ? "\n  " : " ")) +
                (stri.content && !isStringifyableChildless(stri) ? (prettify ? "\n" : " ") : "") +
                highlighter("punctuation", "}")
            )

        case "error":
            return (
                highlighter("typename", stri.typename) +
                highlighter("punctuation", "(") +
                stri.stack
                    .map(
                        (stack) =>
                            (prettify ? "\n  " : "") +
                            highlighter("prefix", "error: ") +
                            highlighter("errorMessage", _lines(stri.message, 7)) +
                            (prettify ? (stri.message.includes("\n") ? "\n" : "") + "\n  " : highlighter("punctuation", ",") + " ") +
                            highlighter("prefix", "stack: ") +
                            highlighter("errorStack", _lines(stack, 7)) +
                            (prettify ? "\n" : "") +
                            highlighter("punctuation", "}")
                    )
                    .unwrapOrElse(
                        () =>
                            highlighter("prefix", "error:") +
                            " " +
                            highlighter("errorMessage", _lines(stri.message, 7)) +
                            highlighter("punctuation", ")")
                    )
            )

        case "prefixed":
            return (
                highlighter("typename", stri.typename) +
                " " +
                highlighter("punctuation", "{") +
                (!isStringifyableChildless(stri) ? (prettify ? "\n  " : " ") : "") +
                (stri.prefixed || [])
                    .map(
                        ([prefix, value]) =>
                            highlighter("prefix", prefix) +
                            highlighter("punctuation", ":") +
                            " " +
                            value
                                .map((value) => highlighter("collValue", _lines(_nested(value), 0)))
                                .unwrapOrElse(() => highlighter("voidPrefixValue", "-"))
                    )
                    .join(highlighter("punctuation", ",") + (prettify && !isStringifyableChildless(stri) ? "\n  " : " ")) +
                (!isStringifyableChildless(stri) ? (prettify ? "\n" : " ") : "") +
                highlighter("punctuation", "}")
            )

        case "unknown":
            return (
                highlighter("punctuation", "<") +
                highlighter("unknownWrapper", "Instance of:") +
                " " +
                highlighter("unknown", stri.typename ?? "unknown type") +
                highlighter("punctuation", ">")
            )
    }
}

/**
 * Non-natively stringifyable type
 */
export interface TSCoreStringifyable {
    __tsCoreStringify(): RawStringifyable
}
