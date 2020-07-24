/**
 * @file Mutual exclusion
 */

import { panic } from './env'
import { FailableFuture } from './future'
import { Consumers } from './list'
import { AbstractMatchable, State, match, matchState, state } from './match'
import { None, Option } from './option'
import { Ref } from './ref'
import { Err, Ok, Result } from './result'

/**
 * State of a mutex
 */
export type MutexState = State<"Available" | "Locked" | "Poisoned">

/**
 * Mutex error
 */
export type MutexError = State<"Locked" | "Poisoned">

/**
 * Mutex poison error
 */
export type MutexPoisonError = State<"Poisoned">

/**
 * Mutual exclusion
 * @template T Shared data type
 */
export class Mutex<T> extends AbstractMatchable<MutexState> {
    private readonly _ref: Ref<T>
    private readonly _locked: Option<Ref<T>>
    private _poisoned: boolean
    private _unlockWaiters: Consumers<Result<Ref<T>, MutexPoisonError>>

    /**
     * Create a new mutex
     * @param ref The reference to share
     */
    constructor(ref: Ref<T>) {
        super(() => (this._poisoned ? state("Poisoned") : this._locked.isSome() ? state("Locked") : state("Available")))

        this._ref = ref
        this._locked = None()
        this._poisoned = false
        this._unlockWaiters = new Consumers()

        ref.onDestroy(() => {
            this._poisoned = true
        })
    }

    /**
     * Is the mutex locked?
     */
    get locked(): boolean {
        return this._locked.isSome()
    }

    /**
     * Is the mutex poisoned?
     */
    get poisoned(): boolean {
        return this._poisoned
    }

    /**
     * Try to get a lock reference from this mutex
     */
    lock(): Result<Ref<T>, MutexError> {
        if (this._poisoned) {
            return Err(state("Poisoned"))
        }

        if (this._locked.isSome()) {
            return Err(state("Locked"))
        }

        const lockRef = this._ref.clone()

        this._locked.replace(lockRef)

        return Ok(lockRef)
    }

    /**
     * Unlock a mutex using a lock reference
     * Panics if the mutex is poisoned, if the provided lock reference isn't valid or if the mutex isn't locked
     * @param ref The lock reference returned by the mutex's lock method
     */
    unlock(ref: Ref<T>): void {
        if (this._poisoned) {
            panic("Cannot unlock a poisoned mutex!")
        }

        return match(this._locked, {
            Some: (lockRef) => {
                if (ref !== lockRef) {
                    panic("Provided mutex unlock reference is invalid!")
                }

                lockRef.destroy()
                this._locked.take()

                match(this._unlockWaiters.shift(), {
                    Some: (callback) => callback(Ok(this.lock().expect("Failed to lock mutex just after unlocking!"))),
                    None: () => {},
                })
            },
            None: () => panic("Cannot unlock an available mutex!"),
        })
    }

    /**
     * Run a function with a mutex lock reference
     * The mutex is locked before the function runs
     * The mutex is unlocked when the function ends
     * @param core The function to apply
     */
    withLock(core: (ref: Ref<T>) => void): Result<void, MutexError> {
        return this.lock().map((ref) => {
            core(ref)
            return this.unlock(ref)
        })
    }

    /**
     * Run a function applying on the mutex's lock reference
     * The mutex is locked before the function runs
     * The mutex is unlocked when the function ends
     * @param core The function to apply
     */
    apply(core: (value: T) => T): Result<void, MutexError> {
        return this.lock().map((ref) => {
            ref.apply(core)
            return this.unlock(ref)
        })
    }

    /**
     * Return a future holding a lock reference
     * The future will resolve when the current lock will have been
     */
    futureLock(): FailableFuture<Ref<T>, MutexPoisonError> {
        return new FailableFuture<Ref<T>, MutexPoisonError>((resolve, reject) => {
            match(this.lock(), {
                Ok: (ref) => resolve(ref),
                Err: (err) =>
                    matchState(err, {
                        Locked: () =>
                            this._unlockWaiters.push((result) =>
                                match(result, {
                                    Ok: (ref) => resolve(ref),
                                    Err: (err) => reject(err),
                                })
                            ),
                        Poisoned: () => reject(state("Poisoned")),
                    }),
            })
        })
    }

    /**
     * Mark the mutex as poisoned
     * Panics if the mutex is already poisoned
     */
    poison(): void {
        if (this._poisoned) {
            panic("Cannot poison a mutex twice!")
        }

        this._poisoned = true
        this._unlockWaiters.resolve(Err(state("Poisoned")))
    }

    /**
     * Get the mutex's reference (UNSAFE !)
     */
    unsafeRef(): Ref<T> {
        return this._ref
    }

    /**
     * Create a mutex from a plain data
     * @param data
     */
    static plain<T>(data: T): Mutex<T> {
        return new Mutex(new Ref({ ref: data }))
    }

    /**
     * Create an empty mutex
     */
    static void(): Mutex<void> {
        return new Mutex(
            new Ref<void>({ ref: undefined })
        )
    }
}
