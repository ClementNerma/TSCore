import { O } from './objects'
import { Regex } from './regex'
import { StringifyOptions, stringify } from './stringify'

declare const console: {
    debug(message: string): void
    log(message: string): void
    warn(message: string): void
    error(message: string): void
}

/**
 * Formatting context, used to determine how to perform the formatting
 * Used in formatting and printing functions like format(), println() or panic()
 */
export type FormattingContext = "debug" | "print" | "warn" | "error" | "panic" | "logging" | "format"

/**
 * Core environment - a set of methods and configuration objects used to determine how the librarybehaves
 */
export interface TSCoreEnv {
    /**
     * Enable developer mode, used to change how messages are displayed and how formatting is performed for instance
     */
    DEV_MODE: boolean

    /**
     * Format a message
     * Used by display functions like println(), debug() or panic()
     * @param message The message to format
     * @param params The message's parameters
     * @param context The formatting context
     * @param options Formatting options (default behaviour is to fallback to the default formatting options if none are provided)
     */
    format(message: string, params: unknown[], context: FormattingContext, options?: FormatOptions): string

    /**
     * Formatting extension
     * Used by format() when a format used in the message is unknown
     * e.g. by default when formatting `Hello, {$$$}!` the format is `$$$` and will result in calling .formatExt() as it is unknown
     * @param format The unknown format
     * @param paramCouter The parameter counter
     * @param context The formatting context
     * @param options The formatting options
     */
    formatExt(format: string, params: unknown[], paramCounter: number, context: FormattingContext, options: FormatOptions): string | false | null

    /**
     * Generate the default formatting options
     * @param DEV_MODE Is development mode enabled?
     * @param
     */
    defaultFormattingOptions: (DEV_MODE: boolean, context: FormattingContext) => FormatOptions

    /**
     * Log a message - called before actually displaying the message in debug(), println(), panic() etc.
     * @param type Logging type
     * @param message The message to log
     * @param params The message's parameters
     */
    logger(type: "debug" | "log" | "warn" | "error" | "panic" | "unreachable" | "unimplemented" | "todo", message: string, params: unknown[]): void

    /**
     * Print a debug message in the console
     * By default, nothing is printed if development mode is not enabled
     * @param message The message to display
     * @param params The message's parameters
     */
    debug(message: string, params: unknown[]): void

    /**
     * Print a message in the console
     * @param message The message to display
     * @param params The message's parameters
     */
    println(message: string, params: unknown[]): void

    /**
     * Display a warning in the console
     * @param message The message to display
     * @param params The message's parameters
     */
    warn(message: string, params: unknown[]): void

    /**
     * Print an error message in the console
     * @param message The message to display
     * @param params The message's parameters
     */
    eprintln(message: string, params: unknown[]): void

    /**
     * A function called before actually panicking in panic(), unreachable(), unimplemented() or todo()
     * @param message The message to display
     * @param params The message's parameters
     */
    panicWatcher(message: string, params: unknown[]): void

    /**
     * Panic - this function must not return
     * @param message The message to display
     * @param params The message's parameters
     */
    panic(message: string, params: unknown[]): never

    /**
     * Placeholder for a part of the code that should never be reached
     * @param message The message to display
     * @param params The message's parameters
     */
    unreachable(message: string, params: unknown[]): never

    /**
     * Placeholder for a part of the code that hasn't been implemented yet
     * @param message The message to display
     * @param params The message's parameters
     */
    unimplemented(message: string, params: unknown[]): never

    /**
     * Placeholder for a part of the code that hasn't been implemented yet
     * @param message The message to display
     * @param params The message's parameters
     */
    todo(message: string, params: unknown[]): never
}

/**
 * Formatting options
 */
export interface FormatOptions {
    /**
     * Handle missing parameters
     * @param position Position of the missing parameter (starting at 0)
     */
    unknownParam: (position: number) => string | never

    /**
     * Options for the stringify() function
     */
    stringifyOptions: StringifyOptions
}

/**
 * TSCore configuration
 * NOTE: It is wrapped in an object to avoid reference problems when updating it
 */
const _tsCoreEnv: { ref: TSCoreEnv } = {
    ref: {
        DEV_MODE: true,

        format(message, params, context, maybeOptions) {
            const options = maybeOptions ?? this.defaultFormattingOptions(this.DEV_MODE, context)
            let paramCounter = -1

            return message.replace(/{([a-zA-Z0-9_:#\?\$]*)}/g, (match, format) => {
                paramCounter++

                const supported = new Regex(/^(\d+)?([:#])?([bdoxX])?(\?)?$/, ["strParamPos", "display", "numberFormat", "pretty"]).matchNamed(format)

                if (supported.isNone()) {
                    const ext = this.formatExt(format, params, paramCounter, context, options)

                    if (ext === null) {
                        return match
                    }

                    if (ext === false) {
                        return options.unknownParam(paramCounter)
                    }

                    return ext
                }

                const { strParamPos, display, numberFormat, pretty } = supported.inner

                const paramPos = strParamPos ? parseInt(strParamPos) : paramCounter

                if (paramPos >= params.length) {
                    return options.unknownParam(paramPos)
                }

                if (display === "#" || !display) {
                    return stringify(params[paramCounter], {
                        ...options.stringifyOptions,
                        numberFormat: (numberFormat as any) || options.stringifyOptions.numberFormat,
                    })
                }

                return JSON.stringify(params[paramCounter], null, pretty ? 4 : 0)
            })
        },

        formatExt(format, params, paramCounter, context, options): string | null {
            return null
        },

        defaultFormattingOptions: (DEV_MODE) => ({
            unknownParam(position) {
                return `<<<missing parameter ${position + 1}>>>`
            },

            stringifyOptions: { prettify: DEV_MODE },
        }),

        logger(message, params) {
            // Does nothing by default
        },

        debug(message, params) {
            if (this.DEV_MODE) {
                console.debug(this.format(message, params, "debug"))
            }
        },

        println(message, params) {
            console.log(this.format(message, params, "print"))
        },

        warn(message, params) {
            console.warn(this.format(message, params, "warn"))
        },

        eprintln(message, params) {
            console.error(this.format(message, params, "error"))
        },

        panicWatcher(message, params) {
            // Does nothing by default
        },

        panic(message, params) {
            const formatted = this.format(message, params, "panic")
            const stack = new Error("At: panic").stack
            throw new Error("Panicked! " + formatted + (stack ? "\n" + stack : ""))
        },

        unreachable(message, params) {
            return this.panic(message, params)
        },

        unimplemented(message, params) {
            return this.panic(message, params)
        },

        todo(message, params) {
            return this.panic(message, params)
        },
    },
}

/**
 * Set up TSCore (can be called multiple times)
 * @param newEnv Either an object containing the configuration properties to update, or a function generating one using the previous configuration object
 */
export function setupTypeScriptCore(newEnv: Partial<TSCoreEnv> | ((previousEnv: Readonly<TSCoreEnv>) => Partial<TSCoreEnv>)): void {
    const out = { ..._tsCoreEnv.ref }

    for (const [key, value] of O.entries(newEnv instanceof Function ? newEnv(_tsCoreEnv.ref) : newEnv)) {
        // @ts-ignore
        out[key] = value
    }

    _tsCoreEnv.ref = out
}

/**
 * Format a message
 * @param message The message to format
 * @param params The message's parameters
 * @returns The formatted message
 */
export function format(message: string, ...params: unknown[]): string {
    return _tsCoreEnv.ref.format(message, params, "format")
}

/**
 * Format a message with a specific formatting context for later use
 * @param context The formatting context
 * @param message The message to format
 * @param params The message's parameters
 * @returns The formatted message
 */
export function formatCtx(context: FormattingContext, message: string, ...params: unknown[]): string {
    return _tsCoreEnv.ref.format(message, params, context)
}

/**
 * Print a debug message in the console
 * @param message The message to format
 * @param params The message's parameters
 */
export function debug(message: string, ...params: unknown[]): void {
    _tsCoreEnv.ref.logger("debug", message, params)
    return _tsCoreEnv.ref.debug(message, params)
}

/**
 * Print a message in the console
 * @param message The message to format
 * @param params The message's parameters
 */
export function println(message: string, ...params: unknown[]): void {
    _tsCoreEnv.ref.logger("log", message, params)
    return _tsCoreEnv.ref.println(message, params)
}

/**
 * Display a warning message in the console
 * @param message The message to format
 * @param params The message's parameters
 */
export function warn(message: string, ...params: unknown[]): void {
    _tsCoreEnv.ref.logger("warn", message, params)
    return _tsCoreEnv.ref.warn(message, params)
}

/**
 * Print an error message in the console
 * @param message The message to format
 * @param params The message's parameters
 */
export function eprintln(message: string, ...params: unknown[]): void {
    _tsCoreEnv.ref.logger("error", message, params)
    return _tsCoreEnv.ref.eprintln(message, params)
}

/**
 * Panic - make the program exit
 * On Node.js, should call process.exit()
 * On Deno, should call Deno.exit(1)
 * @param message The message to format
 * @param params The message's parameters
 */
export function panic(message: string, ...params: unknown[]): never {
    _tsCoreEnv.ref.logger("panic", message, params)
    _tsCoreEnv.ref.panicWatcher(message, params)
    return _tsCoreEnv.ref.panic(message, params)
}

/**
 * Indicate a code path should never be reached - panics otherwise
 * @param message An optional panic message
 * @param params The optional message's parameters
 */
export function unreachable(message?: string, ...params: unknown[]): never {
    message = message ?? "unreachable statement reached!"
    params = params ?? []

    _tsCoreEnv.ref.logger("unreachable", message, params)
    return _tsCoreEnv.ref.unreachable(message, params)
}

/**
 * Indicate a code path hasn't been implemented yet - panics
 * @param message An optional panic message
 * @param params The optional message's parameters
 */
export function unimplemented(message?: string, ...params: unknown[]): never {
    message = message ?? "unreachable statement reached!"
    params = params ?? []

    _tsCoreEnv.ref.logger("unimplemented", message, params)
    return _tsCoreEnv.ref.unimplemented(message, params)
}

/**
 * Indicate a code path hasn't been implemented yet - panics
 * @param message An optional panic message
 * @param params The optional message's parameters
 */
export function todo(message?: string, ...params: unknown[]): never {
    message = message ?? "unreachable statement reached!"
    params = params ?? []

    _tsCoreEnv.ref.logger("todo", message, params)
    return _tsCoreEnv.ref.todo(message, params)
}
