import { TaskCluster } from './cluster'
import { Dictionary } from './dictionary'
import { Either } from './either'
import { Future } from './future'
import { Iter } from './iter'
import { List } from './list'
import { MaybeUninit } from './maybeUinit'
import { O } from './objects'
import { Option } from './option'
import { Ref } from './ref'
import { Result } from './result'
import { Task } from './task'

export type StringifyHighlighter = (type: "typename" | "prefix" | "collKey" | "collValue" | "text" | "unknown" | "punctuation", str: string) => string

/**
 * Stringify a value to a human-readable string
 * @param value
 */
export function stringify(value: unknown, prettify?: boolean, highlighters?: StringifyHighlighter): string {
    return stringifyRaw(makeStringifyable(value), prettify, highlighters)
}

/**
 * Stringifyable format
 */
export type RawStringifyable =
    | { type: "text"; text: string }
    | { type: "wrapped"; typename: string; content?: RawStringifyable }
    | { type: "collection"; typename: string; content: Array<{ key: RawStringifyable; value: RawStringifyable }> }
    | { type: "prefixed"; prefix: string; value?: RawStringifyable }
    | { type: "unknown" }

/**
 * Convert a value to a stringifyable format
 */
export function makeStringifyable(value: unknown): RawStringifyable {
    if (value === null) {
        return { type: "text", text: "<null>" }
    }

    if (value === undefined) {
        return { type: "text", text: "<undefined>" }
    }

    if (value instanceof Option) {
        return value.match({
            Some: (value) => ({ type: "wrapped", typename: "Some", content: makeStringifyable(value) }),
            None: () => ({ type: "wrapped", typename: "None" }),
        })
    }

    if (value instanceof Result) {
        return value.match({
            Ok: (value) => ({ type: "wrapped", typename: "Ok", content: makeStringifyable(value) }),
            Err: (err) => ({ type: "wrapped", typename: "Err", content: makeStringifyable(err) }),
        })
    }

    if (value instanceof Either) {
        return value.match({
            Left: (value) => ({ type: "wrapped", typename: "Left", content: makeStringifyable(value) }),
            Right: (right) => ({ type: "wrapped", typename: "Err", content: makeStringifyable(right) }),
        })
    }

    if (value instanceof List) {
        return {
            type: "collection",
            typename: "List",
            content: value.toArray().map((item, i) => ({ key: makeStringifyable(i), value: makeStringifyable(item) })),
        }
    }

    if (O.isArray(value)) {
        return {
            type: "collection",
            typename: "Array",
            content: value.map((item, i) => ({ key: makeStringifyable(i), value: makeStringifyable(item) })),
        }
    }

    if (value instanceof Dictionary) {
        return {
            type: "collection",
            typename: "Dictionary",
            content: value
                .entries()
                .collectArray()
                .map(([key, value]) => ({ key: makeStringifyable(key), value: makeStringifyable(value) })),
        }
    }

    if (value instanceof Iter) {
        return { type: "wrapped", typename: "Iter", content: { type: "prefixed", prefix: "pointer", value: makeStringifyable(value.pointer) } }
    }

    if (value instanceof MaybeUninit) {
        return {
            type: "wrapped",
            typename: "MaybeUninit",
            content: value.match({
                Init: (value) => ({ type: "prefixed", prefix: "Init", content: makeStringifyable(value) }),
                Uninit: () => ({ type: "prefixed", prefix: "Uninit" }),
            }),
        }
    }

    if (value instanceof Ref) {
        return {
            type: "wrapped",
            typename: "Ref",
            content: value.match({
                Available: (value) => ({ type: "prefixed", prefix: "Available", content: makeStringifyable(value) }),
                Destroyed: () => ({ type: "prefixed", prefix: "Destroyed" }),
            }),
        }
    }

    if (value instanceof Future) {
        return {
            type: "wrapped",
            typename: "Future",
            content: value.match({
                Pending: () => ({ type: "prefixed", prefix: "Pending" }),
                Complete: (value) => ({ type: "prefixed", prefix: "Complete", content: makeStringifyable(value) }),
            }),
        }
    }

    if (value instanceof Task) {
        return {
            type: "wrapped",
            typename: "Task",
            content: value.match({
                Created: () => ({ type: "prefixed", prefix: "Created" }),
                Pending: () => ({ type: "prefixed", prefix: "Pending" }),
                RunningStep: () => ({ type: "prefixed", prefix: "RunningStep" }),
                Fulfilled: (value) => ({ type: "prefixed", prefix: "Fulfilled", value: makeStringifyable(value) }),
                Failed: (err) => ({ type: "prefixed", prefix: "Failed", value: makeStringifyable(err) }),
            }),
        }
    }

    if (value instanceof TaskCluster) {
        return {
            type: "wrapped",
            typename: "TaskCluster",
            content: value.match({
                Created: () => ({ type: "prefixed", prefix: "Created" }),
                Running: () => ({ type: "prefixed", prefix: "Running" }),
                Paused: () => ({ type: "prefixed", prefix: "Paused" }),
                Aborted: () => ({ type: "prefixed", prefix: "Aborted" }),
                Fulfilled: (value) => ({ type: "prefixed", prefix: "Fulfilled", value: makeStringifyable(value) }),
                Failed: (err) => ({ type: "prefixed", prefix: "Failed", value: makeStringifyable(err) }),
            }),
        }
    }

    if (typeof value === "string") {
        return { type: "text", text: JSON.stringify(value) }
    }

    if (O.isCollection(value)) {
        return {
            type: "collection",
            typename: "Collection",
            content: O.entries(value).map(([key, value]) => ({ key: makeStringifyable(key), value: makeStringifyable(value) })),
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
                return { type: "unknown" }
            }
        } else {
            return { type: "unknown" }
        }
    } else {
        return stringifyExt(value) ?? { type: "unknown" }
    }
}

export function isStringifyableLinear(stri: RawStringifyable): boolean {
    switch (stri.type) {
        case "text":
            return true

        case "wrapped":
            return stri.content ? isStringifyableLinear(stri.content) : true

        case "collection":
            return stri.content.every(
                ({ key, value }) => isStringifyableLinear(value) && (typeof key === "number" ? true : isStringifyableLinear(key))
            )

        case "prefixed":
            return !stri.value || typeof stri.value === "string" ? true : isStringifyableLinear(stri.value)

        case "unknown":
            return true
    }
}

export function stringifyRaw(stri: RawStringifyable, pretty?: boolean, highlighters: StringifyHighlighter = (_, str) => str): string {
    // pretty ??= isStringifyableLinear(stri)
    pretty = pretty ?? !isStringifyableLinear(stri)

    switch (stri.type) {
        case "text":
            return highlighters("text", stri.text)

        case "wrapped":
            return (
                highlighters("typename", stri.typename) +
                highlighters("punctuation", "(") +
                (stri.content ? (pretty ? "\n  " : "") : "") +
                (stri.content
                    ? stringifyRaw(stri.content, pretty, highlighters)
                          .split(/\n/)
                          .join("\n" + (pretty ? "  " : ""))
                    : "") +
                (stri.content ? (pretty ? "\n" : "") : "") +
                highlighters("punctuation", ")")
            )

        case "collection":
            return (
                highlighters("typename", stri.typename) +
                " " +
                highlighters("punctuation", "{") +
                (stri.content ? (pretty ? "\n  " : " ") : "") +
                (stri.content || [])
                    .map(
                        ({ key, value }) =>
                            highlighters(
                                "collKey",
                                stringifyRaw(key, false)
                                    .split(/\n/)
                                    .join("\n" + (pretty ? "  " : ""))
                            ) +
                            highlighters("punctuation", ":") +
                            " " +
                            highlighters(
                                "collValue",
                                stringifyRaw(value, pretty, highlighters)
                                    .split(/\n/)
                                    .join("\n" + (pretty ? "  " : ""))
                            )
                    )
                    .join(highlighters("punctuation", ",") + (pretty ? "\n  " : " ")) +
                (stri.content ? (pretty ? "\n" : " ") : "") +
                highlighters("punctuation", "}")
            )

        case "prefixed":
            return (
                highlighters("prefix", stri.prefix) +
                (stri.value ? highlighters("punctuation", ":") + " " + stringifyRaw(stri.value, pretty, highlighters) : "")
            )

        case "unknown":
            return highlighters("unknown", "<unknown>")
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
