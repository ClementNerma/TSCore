/**
 * @file Fetch a mock todo note from the web through HTTPS
 */

// Import HTTPS to make a request
import * as https from 'https'

// Import required stuff from TS-Core
import {
    DecodingError, Err, Future, JsonDecoders as j, JsonValue, Matchable, Ok, Option, Result, State, match, println, state, tryParseInt
} from '../src'

/**
 * A todo note
 */
interface TodoNote {
    readonly userId: number
    readonly id: number
    readonly title: string
    readonly completed: boolean
}

/**
 * Error happening during todo note fetching
 */
class FetchError extends Matchable<State<"HttpError", Error> | State<"InvalidJson", Error>> {}

/**
 * Fetch a web page
 * @param url The URL to fetch
 * @returns Response's body as text in case of success
 */
function fetch(url: string): Future<Result<string, Error>> {
    println!("Fetching URL: {}", url)

    return new Future((complete) => {
        https.get(url, (res) => {
            let body: string[] = []

            res.setEncoding("utf8")
            res.on("error", (err) => complete(Err(err)))
            res.on("data", (data) => body.push(data))
            res.on("end", () => complete(Ok(body.join(""))))
        })
    })
}

/**
 * Fetch a todo note as a JSON value
 * @param id ID of the note to fetch
 */
function fetchTodoNoteAsJson(id: number): Future<Result<JsonValue, FetchError>> {
    println("Fetching note n°{}...", id)

    return fetch("https://jsonplaceholder.typicode.com/todos/" + id).then((result) =>
        result
            .mapErr((err) => new FetchError(state("HttpError", err)))
            .andThen((resText) => JsonValue.parse(resText).mapErr((err) => new FetchError(state("InvalidJson", err))))
    )
}

/**
 * Decode a todo note
 * @param json A JSON value
 */
function decodeTodoNote(json: JsonValue): Result<TodoNote, DecodingError> {
    println!("Decoding note...")

    return json.decode(
        j.mapped({
            userId: j.number,
            id: j.number,
            title: j.string,
            completed: j.boolean,
        })
    )
}

/**
 * Main function
 */
async function main() {
    // Get the todo note's ID from command-line
    const input = Option.maybe(process.argv[2]).expect("Please provide the todo note's ID as an argument (ex: 1)")

    // Parse it as an integer
    const id = tryParseInt(input).expect("Invalid ID provided")

    // Fetch the note with this ID
    const note = await fetchTodoNoteAsJson(id).promise()

    // Handle errors
    note.match({
        Err: (err) => console.error("Failed to get todo note", err),
        Ok: (json) =>
            decodeTodoNote(json).match({
                Err: (err) => console.error("Failed to decode todo note:\n", err.render()),
                Ok: (note) => console.log("Got todo note successfully!", note),
            }),
    })
}

// Run the program
main()
