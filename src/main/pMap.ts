/**
An error to be thrown when the request is aborted by AbortController.
DOMException is thrown instead of this Error when DOMException is available.
*/
export class AbortError extends Error {
  constructor(message: string) {
    super();
    this.name = 'AbortError';
    this.message = message;
  }
}

export class AggregateError extends Error {
  constructor(public errors: Error[]) {
    super();
    this.name = 'AbortError';
    this.message = errors.map((e) => e.message).join('\n');
  }
}

export async function pMap<T, R>(
  iterable: T[],
  mapper: (item: T, index: number) => Promise<R>,
  {
    concurrency = Number.POSITIVE_INFINITY,
    stopOnError = true,
    signal,
  }: { concurrency?: number; stopOnError?: boolean; signal?: AbortSignal } = {}
) {
  return new Promise<R[]>((resolve, reject_) => {
    if (iterable[Symbol.iterator] === undefined) {
      throw new TypeError(
        `Expected \`input\` to be either an \`Iterable\` , got (${typeof iterable})`
      );
    }

    if (typeof mapper !== 'function') {
      throw new TypeError('Mapper function is required');
    }

    if (
      !(
        (Number.isSafeInteger(concurrency) ||
          concurrency === Number.POSITIVE_INFINITY) &&
        concurrency >= 1
      )
    ) {
      throw new TypeError(
        `Expected \`concurrency\` to be an integer from 1 and up or \`Infinity\`, got \`${concurrency}\` (${typeof concurrency})`
      );
    }

    const result: R[] = [];
    const errors: Error[] = [];
    let isRejected = false;
    let isResolved = false;
    let isIterableDone = false;
    let resolvingCount = 0;
    let currentIndex = 0;
    const iterator = iterable[Symbol.iterator]();

    const reject = (reason: Error) => {
      isRejected = true;
      isResolved = true;
      reject_(reason);
    };

    if (signal) {
      if (signal.aborted) {
        reject(new AbortError('Aborted'));
      }

      //   signal.addEventListener('abort', () => {
      //     reject(getAbortedReason(signal))
      //   })
    }

    const next = async () => {
      if (isResolved) {
        return;
      }

      const nextItem = iterator.next();

      const index = currentIndex;
      currentIndex++;

      // Note: `iterator.next()` can be called many times in parallel.
      // This can cause multiple calls to this `next()` function to
      // receive a `nextItem` with `done === true`.
      // The shutdown logic that rejects/resolves must be protected
      // so it runs only one time as the `skippedIndex` logic is
      // non-idempotent.
      if (nextItem.done) {
        isIterableDone = true;

        if (resolvingCount === 0 && !isResolved) {
          if (!stopOnError && errors.length > 0) {
            reject(new AggregateError(errors));
            return;
          }

          isResolved = true;

          resolve(result);
          return;
        }

        return;
      }

      resolvingCount++;

      // Intentionally detached
      (async () => {
        try {
          const element = await nextItem.value;

          if (isResolved) {
            return;
          }

          const value = await mapper(element, index);
          result[index] = value;

          resolvingCount--;
          await next();
        } catch (error: any) {
          if (stopOnError) {
            reject(error);
          } else {
            errors.push(error);
            resolvingCount--;

            // In that case we can't really continue regardless of `stopOnError` state
            // since an iterable is likely to continue throwing after it throws once.
            // If we continue calling `next()` indefinitely we will likely end up
            // in an infinite loop of failed iteration.
            try {
              await next();
            } catch (error: any) {
              reject(error);
            }
          }
        }
      })();
    };

    // Create the concurrent runners in a detached (non-awaited)
    // promise. We need this so we can await the `next()` calls
    // to stop creating runners before hitting the concurrency limit
    // if the iterable has already been marked as done.
    // NOTE: We *must* do this for async iterators otherwise we'll spin up
    // infinite `next()` calls by default and never start the event loop.
    (async () => {
      for (let index = 0; index < concurrency; index++) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await next();
        } catch (error: any) {
          reject(error);
          break;
        }

        if (isIterableDone || isRejected) {
          break;
        }
      }
    })();
  });
}
