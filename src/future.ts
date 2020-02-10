/**
 * @file Future results management (based on promises)
 */

import {Err, Ok, Result} from "./result";
import {MappedMatchable, match, state, State} from "./match";
import {None, Option, Some} from "./option";
import {Consumers} from "./list";
import {panic} from "./panic";

/**
 * Future's pattern matching
 * @template T Type of success value
 * @template E Type of error value
 */
export type FutureMatch<T, E> =
    | State<"Pending">
    | State<"Fulfilled", T>
    | State<"Failed", E>;

/**
 * Future
 * @template T Type of success value
 * @template E Type of error value
 */
export class Future<T, E> extends MappedMatchable<FutureMatch<T, E>, Option<Result<T, E>>> {
    // Event listeners
    private readonly _successHandlers: Consumers<T>;
    private readonly _errorHandlers: Consumers<E>;
    private readonly _finalHandlers: Consumers<Result<T, E>>;

    constructor(core: (resolve: (data: T) => void, reject: (err: E) => void, complete: (result: Result<T, E>) => void) => void) {
        super(None(), () => match(this._under, {
            Some: result => match(result, {
                Ok: data => state('Fulfilled', data),
                Err: err => state('Failed', err)
            }),
            None: () => state('Pending')
        }));

        this._successHandlers = new Consumers();
        this._errorHandlers = new Consumers();
        this._finalHandlers = new Consumers();

        core(data => this._fulfill(data), err => this._reject(err), result =>  result.match({
            Ok: data => this._fulfill(data),
            Err: err => this._reject(err)
        }));
    }

    static completable<T, E>(core: (complete: (result: Result<T, E>) => void) => void): Future<T, E> {
        return new Future((_, __, complete) => core(complete));
    }

    private _complete<Z extends T | E>(result: Result<T, E>, value: Z, handlers: Consumers<Z>): void {
        this._under = Some(result);

        handlers.resolve(value);
        this._finalHandlers.resolve(result);

        this._successHandlers.clear();
        this._errorHandlers.clear();
    }

    private _fulfill(data: T): void {
        this._under.expectNone("Tried to fulfill an already completed future!");
        this._complete(Ok(data), data, this._successHandlers);
    }

    private _reject(err: E): void {
        this._under.expectNone("Tried to fulfill an already completed future!");
        this._complete(Err(err), err, this._errorHandlers);
    }

    /**
     * Is the future pending?
     */
    pending(): boolean {
        return this._under.isNone();
    }

    /**
     * Is the future completed?
     */
    completed(): boolean {
        return this._under.isSome();
    }

    /**
     * Is the future fulfilled?
     */
    fulfilled(): boolean {
        return this._under.andThen(result => result.ok()).isSome();
    }

    /**
     * Is the future failed?
     */
    failed(): boolean {
        return this._under.andThen(result => result.err()).isSome();
    }

    /**
     * Get this future's result
     */
    result(): Option<Result<T, E>> {
        return this._under;
    }

    /**
     * Get this future's success value
     */
    success(): Option<T> {
        return this._under.andThen(result => result.ok());
    }

    /**
     * Get this future's error value
     */
    error(): Option<E> {
        return this._under.andThen(result => result.err());
    }

    /**
     * Create a future that resolves through a callback taking this future's success value
     * @param callback
     */
    then<U>(callback: (data: T) => U): Future<U, E> {
        return new Future((resolve, reject) => {
            match(this._under, {
                Some: result => match(result, {
                    Ok: data => resolve(callback(data)),
                    Err: reject
                }),
                None: () => {
                    this._successHandlers.push(data => resolve(callback(data)));
                    this._errorHandlers.push(reject);
                }
            });
        });
    }

    /**
     * Create a future that creates an immediatly-resolving future based on this one's success
     * @param callback 
     */
    andThen<U>(callback: (data: T) => Result<U, E>): Future<U, E> {
        return new Future((resolve, reject) => {
            match(this._under, {
                Some: result => match(result, {
                    Ok: data => match(callback(data), {
                        Ok: resolve,
                        Err: reject
                    }),
                    Err: reject
                }),
                None: () => {
                    this._successHandlers.push(data => match(callback(data), {
                        Ok: resolve,
                        Err: reject
                    }));
                    this._errorHandlers.push(reject);
                }
            });
        });
    }

    /**
     * Equivalent of .andThen(), but with an asynchronous callback
     * If you want to change the error type as well, use .finally()
     * @param callback 
     */
    andThenAsync<U>(callback: (data: T) => Promise<Result<U, E>>): Future<U, E> {
        return new Future((resolve, reject) => {
            match(this._under, {
                Some: result => match(result, {
                    Ok: async data => match(await callback(data), {
                        Ok: resolve,
                        Err: reject
                    }),
                    Err: reject
                }),
                None: () => {
                    this._successHandlers.push(async data => match(await callback(data), {
                        Ok: resolve,
                        Err: reject
                    }));
                    this._errorHandlers.push(reject);
                }
            });
        });
    }

    /**
     * Create a future that rejects through a callback taking this future's error value
     * @param callback
     */
    catch<F>(callback: (err: E) => F): Future<T, F> {
        return new Future((resolve, reject) => {
            match(this._under, {
                Some: result => match(result, {
                    Ok: resolve,
                    Err: err => reject(callback(err))
                }),
                None: () => {
                    this._successHandlers.push(resolve);
                    this._errorHandlers.push(err => reject(callback(err)));
                }
            });
        });
    }

    /**
     * Create a future that resolves through a callback taking this future's result
     * @param callback
     */
    finally<U>(callback: (result: Result<T, E>) => U): Future<U, any> {
        return new Future(resolve => {
            match(this._under, {
                Some: result => resolve(callback(result)),
                None: () => this._finalHandlers.push(result => resolve(callback(result)))
            });
        });
    }

    /**
     * Equivalent of .then() but unwraps the result value once it is complete
     * @param callback
     * @param panicMessage
     */
    finallyUnwrap<U>(callback: (value: T) => U, panicMessage?: string): Future<U, any> {
        // TODO: Use a callback that generates the panic message from the error message?
        return new Future(resolve => {
            match(this._under, {
                Some: result => resolve(callback(panicMessage ? result.expect(panicMessage) : result.unwrap())),
                None: () => this._finalHandlers.push(result => resolve(callback(panicMessage ? result.expect(panicMessage) : result.unwrap())))
            });
        });
    }

    andFinally<U, X>(callback: (result: Result<T, E>) => Result<U, X>): Future<U, X> {
        return new Future((resolve, reject) => {
            match(this._under, {
                Some: result => callback(result).match({
                    Ok: success => resolve(success),
                    Err: err => reject(err)
                }),

                None: () => this._finalHandlers.push(result => callback(result).match({
                    Ok: success => resolve(success),
                    Err: err => reject(err)
                }))
            });
        });
    }

    /**
     * Get a promise that won't reject from the current future
     */
    promise(): Promise<Result<T, E>> {
        return new Promise(resolve => this.finally(resolve));
    }

    /**
     * Equivalent of .finallyUnwrap().promise()
     * @param panicMessage
     */
    promiseUnwrap(panicMessage?: string): Promise<T> {
        return new Promise(resolve => this.finallyUnwrap(resolve, panicMessage));
    }

    /**
     * Create a future object from a fallible promise
     * @param promise
     */
    static fromPromise<T>(promise: Promise<T>): Future<T, unknown> {
        return new Future((resolve, reject) => {
            promise.then(resolve);
            promise.catch(reject);
        })
    }

    /**
     * Create a future object from a failure-free promise
     * @param promise
     */
    static fromStablePromise<T, E>(promise: Promise<Result<T, E>>): Future<T, E> {
        return new Future((resolve, reject) => {
            promise
                .then(result => {
                    match(result, {
                        Ok: data => resolve(data),
                        Err: err => reject(err)
                    });
                })
                .catch(_ => panic("Promise unexpectedly failed while a future was built upon it!"));
        })
    }

    /**
     * Create a fulfilled future
     * @param data Success value
     */
    static resolve<T>(data: T): Future<T, any> {
        return new Future(resolve => resolve(data));
    }

    /**
     * Create a failed future
     * @param err Error value
     */
    static reject<E>(err: E): Future<any, E> {
        return new Future<any, E>((resolve, reject) => reject(err));
    }

    /**
     * Ensure any of the provided futures fulfills
     * @param futures
     */
    static any<T, E>(futures: Array<Future<T, E>>): Future<T, E> {
        return new Future((resolve, reject) => {
            let completed = false;

            futures.forEach(future => future.finally(result => {
                if (completed) {
                    return ;
                }

                completed = true;

                match(result, {
                    Ok: data => resolve(data),
                    Err: err => reject(err)
                });
            }));
        });
    }

    /**
     * Ensure every provided future fulfills
     * @param futures
     */
    static all<T, E>(futures: Array<Future<T, E>>): Future<T[], E> {
        const success = new Array<T>();
        let remaining = futures.length;
        let failed = false;

        return new Future((resolve, reject) => futures.forEach(future => future.finally(result => {
            if (!remaining || failed) {
                return ;
            }

            match(result, {
                Ok: data => {
                    success.push(data);

                    if (-- remaining === 0) {
                        resolve(success);
                    }
                },

                Err: err => {
                    failed = true;
                    reject(err);
                }
            });
        })));
    }
}
