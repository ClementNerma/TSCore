import {Matchable, State, match} from "./match";
import {None, Option, Some} from "./option";

/**
 * Either's pattern matching
 * @template L Left value type
 * @template R Right value type
 */
export type EitherMatch<L, R> =
    | State<"Left", L>
    | State<"Right", R>;

/**
 * Union type
 * @template L Left value type
 * @template R Right value type
 */
export class Either<L, R> extends Matchable<EitherMatch<L, R>> {
    /**
     * Check if the union's active member is the left one
     */
    isLeft(): boolean {
        return match(this, {
            Left: () => true,
            Right: () => false
        });
    }

    /**
     * Check if the union's active member is the right one
     */
    isRight(): boolean {
        return match(this, {
            Left: () => false,
            Right: () => true
        });
    }

    /**
     * Get the union's left member
     */
    left(): Option<L> {
        return match(this, {
            Left: value => Some(value),
            Right: () => None()
        });
    }

    /**
     * Get the union's right member
     */
    right(): Option<R> {
        return match(this, {
            Left: () => None(),
            Right: value => Some(value)
        });
    }

    /**
     * Flip the union
     */
    flip(): Either<R, L> {
        return match(this, {
            Left: value => Right(value),
            Right: value => Left(value)
        });
    }

    /**
     * Map the union's left member
     * @param mapper
     */
    mapLeft<U>(mapper: (value: L) => U): Either<U, R> {
        return match(this, {
            Left: value => Left(mapper(value)),
            Right: value => Right(value)
        });
    }

    /**
     * Map the union's right member
     * @param mapper
     */
    mapRight<F>(mapper: (value: R) => F): Either<L, F> {
        return match(this, {
            Left: value => Left(value),
            Right: value => Right(mapper(value))
        });
    }

    /**
     * Map the union's members
     * @param left
     * @param right
     */
    either<U = void>(left: (value: L) => U, right: (value: R) => U): U {
        return match(this, {
            Left: value => left(value),
            Right: value => right(value)
        });
    }

    /**
     * Create a left union value
     * @param value
     */
    static left<L, R>(value: L): Either<L, R> {
        return new Either({ Left: value });
    }

    /**
     * Create a right union value
     * @param value
     */
    static right<L, R>(value: R): Either<L, R> {
        return new Either({ Right: value });
    }
}

/**
 * Create a left union value
 * @param value
 */
export function Left<L, R>(value: L): Either<L, R> {
    return Either.left(value);
}

/**
 * Create a right union value
 * @param value
 */
export function Right<L, R>(value: R): Either<L, R> {
    return Either.right(value);
}