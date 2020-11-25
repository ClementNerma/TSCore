import { O } from "./objects"
import { Regex } from "./regex"
import { stringify, StringifyOptions } from "./stringify"

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
export type FormattingContext = "dump" | "debug" | "print" | "warn" | "error" | "panic" | "logging" | "format"

/**
 * Core environment - a set of methods and configuration objects used to determine how the librarybehaves
 */
export interface TSCoreEnv {
    /**
     * Developer mode status, used to change how messages are displayed and how formatting is performed for instance
     * Should be extremely fast to compute, as it is notably called before each formatting
     */
    devMode: () => boolean

    /**
     * Determine if a message should be displayed or not
     * @param devMode Is development mode enabled?
     * @param context Formatting context
     */
    verbosity: (devMode: boolean, context: Exclude<FormattingContext, "format" | "logging" | "panic">) => boolean

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
     */
    defaultFormattingOptions: () => FormatOptions

    /**
     * Disable the highlighter in the 'format' and 'logging' context (defaults: does)
     * Avoids getting color characters in the logging function for instance
     * @param DEV_MODE Is development mode enabled?
     */
    disableHighlighterInFormatContext: (devMode: boolean) => boolean

    /**
     * Log a message - called before actually displaying the message in debug(), println(), panic() etc.
     * @param context Logging type
     * @param message The message to log
     * @param params The message's parameters
     */
    logger(context: "debug" | "log" | "warn" | "error" | "panic" | "unreachable" | "unimplemented" | "todo", message: string, params: unknown[]): void

    /**
     * Dump a value in the console
     * By default, nothing is printed if development mode is not enabled
     * @param value The value to dump
     * @param options Optional stringification options
     */
    dump(value: unknown, options?: StringifyOptions): void

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
     * @param message The full message
     * @param params The message's parameters
     */
    missingParam: (position: number, message: string, params: unknown[]) => string | never

    /**
     * Options for the stringify() function
     * @param devMode Is development mode enabled?
     * @param context The formatting context
     */
    stringifyOptions: (devMode: boolean, context: FormattingContext, prettify: boolean | null) => StringifyOptions
}

/**
 * TSCore configuration
 * NOTE: It is wrapped in an object to avoid reference problems when updating it
 */
const _tsCoreEnv: { ref: TSCoreEnv } = {
    ref: {
        devMode: () => true,

        verbosity: (devMode, context) => {
            if (context === "debug" || context === "dump") {
                return devMode
            }

            return true
        },

        formatExt(format, params, paramCounter, context, options): string | null {
            return null
        },

        defaultFormattingOptions: () => ({
            missingParam(position, message, params) {
                return `<<<missing parameter ${position + 1}>>>`
            },

            stringifyOptions(devMode, context, prettify) {
                return { stringifyPrimitives: context === "dump", prettify: prettify ?? devMode }
            },
        }),

        disableHighlighterInFormatContext(devMode) {
            return true
        },

        logger(context, message, params) {
            // Does nothing by default
        },

        dump(value, options) {
            if (this.devMode()) {
                console.debug(stringify(value, { ...this.defaultFormattingOptions().stringifyOptions(this.devMode(), "dump", true), ...options }))
            }
        },

        debug(message, params) {
            if (this.devMode()) {
                console.debug(formatAdvanced(message, params, "debug"))
            }
        },

        println(message, params) {
            console.log(formatAdvanced(message, params, "print"))
        },

        warn(message, params) {
            console.warn(formatAdvanced(message, params, "warn"))
        },

        eprintln(message, params) {
            console.error(formatAdvanced(message, params, "error"))
        },

        panicWatcher(message, params) {
            // Does nothing by default
        },

        panic(message, params) {
            const formatted = formatAdvanced(message, params, "panic")
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
 * A function to update TSCore's configuration ;
 * Either an object containing the configuration properties to update, or a function generating one using the previous configuration object
 */
export type TSCoreEnvUpdater = Partial<TSCoreEnv> | ((previousEnv: Readonly<TSCoreEnv>) => Partial<TSCoreEnv>)

/**
 * Set up TSCore (can be called multiple times)
 * @param envUpdater The update
 */
export function setupTypeScriptCore(envUpdater: TSCoreEnvUpdater): void {
    const out = { ..._tsCoreEnv.ref }

    for (const [key, value] of O.entries(envUpdater instanceof Function ? envUpdater(_tsCoreEnv.ref) : envUpdater)) {
        // @ts-ignore
        out[key] = value
    }

    _tsCoreEnv.ref = out
}

/**
 * Format a message
 * @param message The message to format
 * @param params The message's parameters
 * @param context The formatting context
 * @param options Formatting options (default behaviour is to fallback to the default formatting options if none are provided)
 */
export function formatAdvanced(message: string, params: unknown[], context: FormattingContext, maybeOptions?: FormatOptions): string {
    const devMode = _tsCoreEnv.ref.devMode()

    const options = maybeOptions ?? _tsCoreEnv.ref.defaultFormattingOptions()
    let paramCounter = -1

    return message.replace(/{([a-zA-Z0-9_:#\?\$]*)}/g, (match, format) => {
        paramCounter++

        const supported = new Regex(/^(\d+)?([:#])?([bdoxX])?(\?)?$/, ["strParamPos", "display", "numberFormat", "pretty"]).matchNamed(format)

        if (supported.isNone()) {
            const ext = _tsCoreEnv.ref.formatExt(format, params, paramCounter, context, options)

            if (ext === null) {
                return match
            }

            if (ext === false) {
                return options.missingParam(paramCounter, message, params)
            }

            return ext
        }

        const { strParamPos, display, numberFormat, pretty } = supported.data

        const paramPos = strParamPos ? parseInt(strParamPos) : paramCounter

        if (paramPos >= params.length) {
            return options.missingParam(paramPos, message, params)
        }

        if (display === "#" || !display) {
            const stringifyOptions = options.stringifyOptions(devMode, context, pretty !== "")

            return stringify(params[paramCounter], {
                ...stringifyOptions,
                numberFormat: (numberFormat as any) || stringifyOptions.numberFormat,
                highlighter:
                    (context === "format" || context === "logging") && _tsCoreEnv.ref.disableHighlighterInFormatContext(true)
                        ? undefined
                        : stringifyOptions.highlighter,
            })
        }

        return JSON.stringify(params[paramCounter], null, pretty ? 4 : 0)
    })
}

/**
 * Format a message
 * @param message The message to format
 * @param params The message's parameters
 * @returns The formatted message
 */
export function format(message: string, ...params: unknown[]): string {
    return formatAdvanced(message, params, "format")
}

/**
 * Dump a value in the console
 * Does not call the logger
 * @param value The value to dump
 * @param options Optional stringification options
 */
export function dump(value: unknown, options?: StringifyOptions): void {
    if (_tsCoreEnv.ref.verbosity(_tsCoreEnv.ref.devMode(), "dump")) {
        return _tsCoreEnv.ref.dump(value, options)
    }
}

/**
 * Print a debug message in the console
 * @param message The message to format
 * @param params The message's parameters
 */
export function debug(message: string, ...params: unknown[]): void {
    _tsCoreEnv.ref.logger("debug", message, params)

    if (_tsCoreEnv.ref.verbosity(_tsCoreEnv.ref.devMode(), "debug")) {
        return _tsCoreEnv.ref.debug(message, params)
    }
}

/**
 * Print a message in the console
 * @param message The message to format
 * @param params The message's parameters
 */
export function println(message: string, ...params: unknown[]): void {
    _tsCoreEnv.ref.logger("log", message, params)

    if (_tsCoreEnv.ref.verbosity(_tsCoreEnv.ref.devMode(), "print")) {
        return _tsCoreEnv.ref.println(message, params)
    }
}

/**
 * Display a warning message in the console
 * @param message The message to format
 * @param params The message's parameters
 */
export function warn(message: string, ...params: unknown[]): void {
    _tsCoreEnv.ref.logger("warn", message, params)

    if (_tsCoreEnv.ref.verbosity(_tsCoreEnv.ref.devMode(), "warn")) {
        return _tsCoreEnv.ref.warn(message, params)
    }
}

/**
 * Print an error message in the console
 * @param message The message to format
 * @param params The message's parameters
 */
export function eprintln(message: string, ...params: unknown[]): void {
    _tsCoreEnv.ref.logger("error", message, params)

    if (_tsCoreEnv.ref.verbosity(_tsCoreEnv.ref.devMode(), "error")) {
        return _tsCoreEnv.ref.eprintln(message, params)
    }
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
    _tsCoreEnv.ref.panicWatcher(message, params)
    return _tsCoreEnv.ref.unreachable(message, params)
}

/**
 * Indicate a code path hasn't been implemented yet - panics
 * @param message An optional panic message
 * @param params The optional message's parameters
 */
export function unimplemented(message?: string, ...params: unknown[]): never {
    message = message ?? "not implemented!"
    params = params ?? []

    _tsCoreEnv.ref.logger("unimplemented", message, params)
    _tsCoreEnv.ref.panicWatcher(message, params)
    return _tsCoreEnv.ref.unimplemented(message, params)
}

/**
 * Indicate a code path hasn't been implemented yet - panics
 * @param message An optional panic message
 * @param params The optional message's parameters
 */
export function todo(message?: string, ...params: unknown[]): never {
    message = message ?? "not implemented!"
    params = params ?? []

    _tsCoreEnv.ref.logger("todo", message, params)
    _tsCoreEnv.ref.panicWatcher(message, params)
    return _tsCoreEnv.ref.todo(message, params)
}
