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
