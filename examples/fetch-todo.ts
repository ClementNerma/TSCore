/**
 * @file Fetch a mock todo note from the web through HTTPS
 */

// Import Chalk to display colors in the terminal
import * as chalk from "chalk"
// Import HTTPS to make a request
import * as https from "https"
// Import required stuff from TS-Core
import {
  DecodingError,
  eprintln,
  Err,
  JsonDecoders as j,
  JsonValue,
  Matchable,
  matchString,
  Ok,
  Option,
  println,
  Result,
  setupTypeScriptCore,
  State,
  state,
} from "../src"

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
function fetch(url: string): Promise<Result<string, Error>> {
  println("Fetching URL: {}", url)

  return new Promise((complete) => {
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
async function fetchTodoNoteAsJson(id: number): Promise<Result<JsonValue, FetchError>> {
  println("Fetching note n°{}...", id)

  return (await fetch("https://jsonplaceholder.typicode.com/todos/" + id))
    .mapErr((err) => new FetchError(state("HttpError", err)))
    .andThen((resText) =>
      JsonValue.parse(resText).mapErr((err_1) => new FetchError(state("InvalidJson", err_1)))
    )
}

/**
 * Decode a todo note
 * @param json A JSON value
 */
function decodeTodoNote(json: JsonValue): Result<TodoNote, DecodingError> {
  println("Decoding note...")

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
  const input = Option.maybe(process.argv[2]).expect(
    "Please provide the todo note's ID as an argument (ex: 1)"
  )

  // Parse it as an integer
  const id = Result.tryParseInt(input).expect("Invalid ID provided")

  // Fetch the note with this ID
  const note = await fetchTodoNoteAsJson(id)

  // Handle errors
  note.match({
    Err: (err) => eprintln("Failed to get todo note: {}", err),
    Ok: (json) =>
      decodeTodoNote(json).match({
        Err: (err) => eprintln("Failed to decode todo note:\n  {}", err),
        Ok: (note) => println("Got todo note successfully! {}", note),
      }),
  })
}

// Set up TypeScript core to print outputs with pretty colors
// Note that this part is purely optional
setupTypeScriptCore((prev) => ({
  defaultFormattingOptions: () => ({
    ...prev.defaultFormattingOptions(),

    stringifyOptions: (devMode, context, prettify) => ({
      ...prev.defaultFormattingOptions().stringifyOptions(devMode, context, prettify),

      highlighter: (type, content) =>
        matchString(type, {
          typename: () => chalk.yellow(content),
          prefix: () => chalk.cyan(content),
          unknown: () => chalk.yellowBright(content),
          unknownWrapper: () => chalk.magentaBright(content),
          unknownTypename: () => chalk.magentaBright(content),
          reference: () => chalk.blue(content),
          referenceWrapper: () => chalk.yellow(content),
          punctuation: () => chalk.cyan(content),
          listIndex: () => chalk.magenta(content),
          listValue: () => chalk.blue(content),
          collKey: () => chalk.magenta(content),
          collValue: () => chalk.blue(content),
          text: () => chalk.green(content),
          string: () => chalk.green(content),
          number: () => chalk.yellow(content),
          errorMessage: () => chalk.red(content),
          errorStack: () => chalk.red(content),
          remainingProperties: () => chalk.yellow(content),
          remainingPropertiesWrapper: () => chalk.blue(content),
          _: () => content,
        }),
    }),
  }),
}))

// Run the program
main()
