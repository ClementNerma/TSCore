import { Option, None, Some } from "./option"
import { State, MappedMatchable, state } from "./match"
import { Result, Err, Ok } from "./result"

/**
 * MaybeUninit's pattern matching
 */
export type MaybeUninitMatch<T> = State<"Uninit"> | State<"Init", T>

/**
 * A potentially-uninitialized value
 * The value starts being uninitlalized, and can be initialized later one (only once)
 */
export class MaybeUninit<T> extends MappedMatchable<MaybeUninitMatch<T>, Option<T>> {
    constructor() {
        super(None(), () =>
            this._under.match({
                None: () => state("Uninit"),
                Some: (value) => state("Init", value),
            })
        )
    }

    /**
     * Check if the value has been initialized
     */
    isInit(): boolean {
        return this._under.isSome()
    }

    /**
     * Check if the value has not been initialized yet
     */
    isUninit(): boolean {
        return this._under.isNone()
    }

    /**
     * Initialize the value
     * Panics if it has already been initialized
     * For an alternative without panicking, see tryInit()
     * @param value
     */
    init(value: T) {
        this._under.expectNone("Tried to re-initialize a MaybeUninit value")
        this._under = Some(value)
    }

    /**
     * Try to initialize the value
     * Returns an Err() if it has already been initialized
     * @param value
     */
    tryInit(value: T): Result<void, void> {
        if (this._under.isSome()) {
            return Err(undefined)
        }

        this._under = Some(value)
        return Ok(undefined)
    }

    /**
     * Get the initialized value
     * Returns a None() if has not been initialized yet
     */
    value(): Option<T> {
        return this._under.clone()
    }
}
