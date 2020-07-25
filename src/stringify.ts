import { TaskCluster } from './cluster'
import { Dictionary } from './dictionary'
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
        type: "typename" | "prefix" | "listIndex" | "listValue" | "collKey" | "collValue" | "text" | "unknown" | "punctuation" | "voidPrefixValue",
        str: string
    ) => string

    /**
     * Display numbers using a specific format (default: decimal)
     */
    numberFormat?: "b" | "d" | "o" | "x" | "X"

    /**
     * Display indexes in arrays (default: true)
     */
    arrayIndexes?: boolean

    /**
     * Pretty-print the value on multiple lines (default: determined depending on the value's structural size)
     */
    prettify?: boolean
}

/**
 * Stringify a value to a human-readable string
 * @param value
 * @param options
 */
export function stringify(value: unknown, options?: StringifyOptions): string {
    return stringifyRaw(makeStringifyable(value, options?.numberFormat), options)
}

/**
 * Stringifyable format
 */
export type RawStringifyable =
    | { type: "text"; text: string }
    | { type: "wrapped"; typename: string; content?: RawStringifyable }
    | { type: "list"; typename: string; content: Array<{ index: number; value: RawStringifyable }> }
    | { type: "collection"; typename: string; content: Array<{ key: RawStringifyable; value: RawStringifyable }> }
    | { type: "prefixed"; typename: string; prefixed: Array<[string, Option<RawStringifyable>]> }
    | { type: "unknown"; typename: string | undefined }

/**
 * Convert a value to a stringifyable format
 * @param value
 * @param numberFormat
 */
export function makeStringifyable(value: unknown, numberFormat: StringifyOptions["numberFormat"] = "d"): RawStringifyable {
    const _nested = (value: unknown) => makeStringifyable(value, numberFormat)

    if (value === null) {
        return { type: "text", text: "<null>" }
    }

    if (value === undefined) {
        return { type: "text", text: "<undefined>" }
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

    if (value instanceof Either) {
        return value.match({
            Left: (value) => ({ type: "wrapped", typename: "Left", content: _nested(value) }),
            Right: (right) => ({ type: "wrapped", typename: "Err", content: _nested(right) }),
        })
    }

    if (value instanceof List) {
        return {
            type: "list",
            typename: "List",
            content: value.toArray().map((item, index) => ({ index, value: _nested(item) })),
        }
    }

    if (O.isArray(value)) {
        return {
            type: "list",
            typename: "Array",
            content: value.map((item, index) => ({ index, value: _nested(item) })),
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

    if (value instanceof JsonValue) {
        return {
            type: "prefixed",
            typename: "JsonValue",
            prefixed: [["inner", Some(_nested(value.inner()))]],
        }
    }

    if (typeof value === "string") {
        return { type: "text", text: JSON.stringify(value) }
    }

    if (O.isCollection(value)) {
        return {
            type: "collection",
            typename: "Collection",
            content: O.entries(value).map(([key, value]) => ({ key: _nested(key), value: _nested(value) })),
        }
    }

    if (typeof value === "number") {
        return {
            type: "text",
            text: matchString(numberFormat, {
                b: () => "0b" + value.toString(2),
                o: () => "0o" + value.toString(8),
                d: () => value.toString(),
                x: () => "0x" + value.toString(16).toLowerCase(),
                X: () => "0x" + value.toString(16).toUpperCase(),
            }),
        }
    }

    if ((value as any).toString) {
        if (typeof (value as any).toString === "function") {
            const stringifed = (value as any).toString()

            if (typeof stringifed === "string") {
                // Avoid vertical overflow when displaying
                const lines = stringifed.split(/\r\n|\r|\n/)
                // Avoid horizontal overflow too
                return { type: "text", text: lines[0].length > 64 ? lines[0] + "..." : lines[0] }
            } else {
                return { type: "unknown", typename: (value as any).constructor?.name }
            }
        } else {
            return { type: "unknown", typename: (value as any).constructor?.name }
        }
    } else {
        return stringifyExt(value) ?? { type: "unknown", typename: (value as any).constructor?.name }
    }
}

/**
 * Check if a stringifyable can be displayed in a single line
 * Returns `false` if the stringifyable is or contains a list or a collection of more than 1 element
 * @param stri
 */
export function isStringifyableLinear(stri: RawStringifyable): boolean {
    switch (stri.type) {
        case "text":
            return true

        case "wrapped":
            return stri.content ? isStringifyableLinear(stri.content) : true

        case "list":
            return stri.content.length >= 1 && stri.content.every(({ value }) => isStringifyableLinear(value))

        case "collection":
            return (
                stri.content.length >= 1 &&
                stri.content.every(({ key, value }) => isStringifyableLinear(value) && (typeof key === "number" ? true : isStringifyableLinear(key)))
            )

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
        case "text":
            return true

        case "wrapped":
            return stri.content ? isStringifyableChildless(stri.content) : true

        case "list":
            return stri.content.length === 0

        case "collection":
            return stri.content.length === 0

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
    const prettify = options?.prettify ?? !isStringifyableLinear(stri)
    const highlighter = options?.highlighter ?? ((type, str) => str)

    switch (stri.type) {
        case "text":
            return highlighter("text", stri.text)

        case "wrapped":
            return (
                highlighter("typename", stri.typename) +
                highlighter("punctuation", "(") +
                (stri.content && !isStringifyableChildless(stri) ? (prettify ? "\n  " : "") : "") +
                (stri.content
                    ? stringifyRaw(stri.content, options)
                          .split(/\n/)
                          .join("\n" + (prettify ? "  " : ""))
                    : "") +
                (stri.content && !isStringifyableChildless(stri) ? (prettify ? "\n" : "") : "") +
                highlighter("punctuation", ")")
            )

        case "list":
            return (
                highlighter("typename", stri.typename) +
                " " +
                highlighter("punctuation", "[") +
                (stri.content && !isStringifyableChildless(stri) ? (prettify ? "\n  " : " ") : "") +
                (stri.content || [])
                    .map(
                        ({ index, value }) =>
                            (options?.arrayIndexes ?? true
                                ? highlighter("listIndex", index.toString()) + highlighter("punctuation", ":") + " "
                                : "") +
                            highlighter(
                                "listValue",
                                stringifyRaw(value, options)
                                    .split(/\n/)
                                    .join("\n" + (prettify ? "  " : ""))
                            )
                    )
                    .join(highlighter("punctuation", ",") + (prettify && !isStringifyableChildless(stri) ? "\n  " : " ")) +
                (stri.content && !isStringifyableChildless(stri) ? (prettify ? "\n" : " ") : "") +
                highlighter("punctuation", "]")
            )

        case "collection":
            return (
                highlighter("typename", stri.typename) +
                " " +
                highlighter("punctuation", "{") +
                (stri.content && !isStringifyableChildless(stri) ? (prettify ? "\n  " : " ") : "") +
                (stri.content || [])
                    .map(
                        ({ key, value }) =>
                            highlighter(
                                "collKey",
                                stringifyRaw(key, { ...options, prettify: false })
                                    .split(/\n/)
                                    .join("\n" + (prettify ? "  " : ""))
                            ) +
                            highlighter("punctuation", ":") +
                            " " +
                            highlighter(
                                "collValue",
                                stringifyRaw(value, options)
                                    .split(/\n/)
                                    .join("\n" + (prettify ? "  " : ""))
                            )
                    )
                    .join(highlighter("punctuation", ",") + (prettify && !isStringifyableChildless(stri) ? "\n  " : " ")) +
                (stri.content && !isStringifyableChildless(stri) ? (prettify ? "\n" : " ") : "") +
                highlighter("punctuation", "}")
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
                                .map((value) =>
                                    highlighter(
                                        "collValue",
                                        stringifyRaw(value, options)
                                            .split(/\n/)
                                            .join("\n" + (prettify ? "  " : ""))
                                    )
                                )
                                .unwrapOrElse(() => highlighter("voidPrefixValue", "-"))
                    )
                    .join(highlighter("punctuation", ",") + (prettify && !isStringifyableChildless(stri) ? "\n  " : " ")) +
                (!isStringifyableChildless(stri) ? (prettify ? "\n" : " ") : "") +
                highlighter("punctuation", "}")
            )

        case "unknown":
            return highlighter("unknown", `<${stri.typename ?? "unknown type"}>`)
    }
}

/**
 * Stringify additional values to a human-readable string
 * Called if the value could not be stringifed using .stringify()
 * @param value
 */
export let stringifyExt: (value: unknown) => RawStringifyable | null = (value) => {
    // Does nothing by default
    return null
}
