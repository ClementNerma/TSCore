/**
 * @file Output functions
 */

/**
 * Console interface
 */
declare const console: {
    debug: (message: string) => void,
    log: (message: string) => void,
    info: (message: string) => void,
    error: (message: string) => void
};

/**
 * Proxy functions
 */
export const proxies = {
    /**
     * Format a message
     * @param message
     * @param params
     */
    format(formatter: (data: MsgParam) => string, message: MsgParam, ...params: MsgParam[]): string {
        return message.toString().replace(/{}/g, () => {
            let param = params.shift();
            return param !== undefined ? formatter(param) : '<<< missing parameter >>>';
        });
    },

    /**
     * Print a message to STDOUT. Message should be formatted using format()
     * @param message
     * @param params
     */
    println(message: MsgParam, ...params: MsgParam[]): void {
        console.log(format(message, ...params));
    },

    /**
     * Print a message to STDERR. Message should be formatted using format()
     * @param message
     * @param params
     */
    eprintln(message: MsgParam, ...params: MsgParam[]): void {
        console.error(format(message, ...params));
    },

    /**
     * Panic. Message should be formatted using format()
     * @param message
     * @param params
     */
    panic(message: MsgParam, ...params: MsgParam[]): never {
        throw new Error('Panicked! ' + format(message, ...params) + '\n' + (new Error()).stack);
    },

    /**
     * Unimplemented. Message should be formatted using format()
     * @param message
     * @param params
     */
    unimplemented(message?: MsgParam, ...params: MsgParam[]): never {
        throw new Error('Panicked! ' + format(message || "Unimplemented", ...params) + '\n' + (new Error()).stack);
    },

    /**
     * Unreachable. Message should be formatted using format()
     * @param message
     * @param params
     */
    unreachable(message?: MsgParam, ...params: MsgParam[]): never {
        throw new Error('Panicked! ' + format(message || "Unreachable", ...params) + '\n' + (new Error()).stack);
    }
};

/**
 * Message parameter type
 */
export type MsgParam = number | boolean | string;

/**
 * Format a message
 * @param message The message to format
 * @param params Its parameters
 */
export function format(message: MsgParam, ...params: MsgParam[]): string {
    return proxies.format(param => param.toString(), message, ...params);
}

/**
 * Format a message with a custom formatter
 * @param message 
 * @param params 
 */
export function formatCustom(formatter: (data: MsgParam) => string, message: MsgParam, ...params: MsgParam[]): string {
    return proxies.format(formatter, message, ...params);
}

/**
 * Print a message to the standard output
 * @param message The message to format
 * @param params Its parameters
 */
export function println(message: MsgParam, ...params: MsgParam[]): void {
    return proxies.println(message, ...params);
}

/**
 * Print a message to the error output
 * @param message The message to format
 * @param params Its parameters
 */
export function eprintln(message: MsgParam, ...params: MsgParam[]): void {
    return proxies.eprintln(message, ...params);
}

/**
 * Panic
 * @param message The message to format
 * @param params Its parameters
 */
export function panic(message: MsgParam, ...params: MsgParam[]): never {
    return proxies.panic(message, ...params);
}

/**
 * Unimplemented
 * @param message The message to format
 * @param params Its parameters
 */
export function unimplemented(message?: MsgParam, ...params: MsgParam[]): never {
    return proxies.unimplemented(message, ...params);
}

/**
 * Unreachable
 * @param message The message to format
 * @param params Its parameters
 */
export function unreachable(message?: MsgParam, ...params: MsgParam[]): never {
    return proxies.unreachable(message, ...params);
}
