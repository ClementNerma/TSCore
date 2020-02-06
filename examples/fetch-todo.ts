/**
 * @file Fetch a mock todo note from the web through HTTPS
 */

// Import required stuff from TS-Core
import {
    // Functional classes
    Matchable, State, Option, Result, Future,
    // Parsing
    DecodingError, JsonValue, JsonDecoders as j,
    // Functions
    match, state, tryParseInt, println
} from "../src";

// Import HTTPS to make a request
import * as https from 'https';

/**
 * A todo note
 */
interface TodoNote {
    readonly userId: number;
    readonly id: number;
    readonly title: string;
    readonly completed: boolean;
}

/**
 * Error happening during todo note fetching
 */
class FetchError extends Matchable<
    | State<"HttpError", Error>
    | State<"InvalidJson", Error>
> {}

/**
 * Fetch a web page
 * @param url The URL to fetch
 * @returns Response's body as text in case of success
 */
function fetch(url: string): Future<string, Error> {
    println!("Fetching URL: {}", url);

    return new Future((resolve, reject) => {
        https.get(url, res => {
            let body: string[] = [];

            res.setEncoding('utf8');
            res.on('error', err => reject(err));
            res.on('data', data => body.push(data));
            res.on('end', () => resolve(body.join('')));
        });
    });
}

/**
 * Fetch a todo note as a JSON value
 * @param id ID of the note to fetch
 */
function fetchTodoNoteAsJson(id: number): Future<JsonValue, FetchError> {
    println('Fetching note n°{}...', id);

    return fetch('https://jsonplaceholder.typicode.com/todos/' + id)
        .catch(err => new FetchError(state('HttpError', err)))
        .andThen(resText => JsonValue.parse(resText).mapErr(err => new FetchError(state('InvalidJson', err))));
}

/**
 * Decode a todo note
 * @param json A JSON value
 */
function decodeTodoNote(json: JsonValue): Result<TodoNote, DecodingError> {
    println!('Decoding note...');

    return json.decode(j.mapped4([
        [ 'userId', j.number ],
        [ 'id', j.number ],
        [ 'title', j.string ],
        [ 'completed', j.boolean ]
    ]));
}

/**
 * Main function
 */
async function main() {
    // Get the todo note's ID from command-line
    const input = Option.nullable(process.argv[2]).expect("Please provide the todo note's ID as an argument (ex: 1)");

    // Parse it as an integer
    const id = tryParseInt(input).expect("Invalid ID provided");

    // Fetch the note with this ID
    const note = await fetchTodoNoteAsJson(id).promise();

    // Handle errors
    match(note, {
        Err: err => console.error('Failed to get todo note', err),
        Ok: json => match(decodeTodoNote(json), {
            Err: err => console.error('Failed to decode todo note:\n', err.render()),
            Ok: note => console.log('Got todo note successfully!', note)
        })
    });
}

// Run the program
main();