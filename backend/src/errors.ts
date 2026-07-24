/**
 * Shared domain error types.
 *
 * `ValidationError` is thrown by the validation services and translated to an
 * HTTP 400 by the controllers. It carries `statusCode = 400` so handlers whose
 * catch blocks branch on `error.statusCode` map it automatically, while callers
 * that prefer `instanceof ValidationError` work too.
 */
export class ValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * A control-flow error carrying an explicit HTTP status. Thrown inside request
 * handlers (e.g. the savings PIN gate) so a `catch` can map it to a response via
 * `error.statusCode`/`error.message` without resorting to plain-object throws
 * (which lose the stack trace and defeat `instanceof` narrowing).
 */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
