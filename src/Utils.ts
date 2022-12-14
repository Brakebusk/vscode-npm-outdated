// This function allows to call a "lazy" callback.
// The first execution can be delayed when the "wait" parameter is different from zero, otherwise it will be immediate.
// The next execution can be delayed as long as "delay" is non - zero, with a minimum time of zero ms.
// Furthermore, if several executions happen at the same time, only the last one will be actually be executed.
export const lazyCallback = <T, A>(
  callback: (...args: A[]) => T,
  wait = 0,
  delay = 0
) => {
  // Defines whether there is a process currently running.
  let isRunning = false

  // It only stores the arguments for the next run, since the callback will be the same.
  // It is important to remember that the arguments will be discarded if a new execution is requested,
  // so we always prioritize the last execution and discard anything before it, with the exception of the current process.
  let argsNext: A[] | undefined = undefined

  // Here's the magic: a "activator" is returned, instead of the original callback.
  // It manages when the current execution ends and when the next one starts, if it exists.
  const activate = async (...args: A[]) => {
    if (!isRunning) {
      // If no callback is running right now, then run the current one immediately.
      isRunning = true

      if (wait === 0) {
        await callback(...args)
      } else {
        await new Promise((resolve: (value: void) => void) => {
          setTimeout(async () => {
            await callback(...args)

            resolve()
          }, wait)
        })
      }

      // If afterwards there is already some callback waiting to be executed, it starts it after the delay.
      // Note that this will only happen after the full completion of the previous process.
      setTimeout(() => {
        // After the execution ends, it releases for another process to run.
        isRunning = false

        if (argsNext !== undefined) {
          activate(...argsNext)
          argsNext = undefined
        }
      }, delay)
    } else {
      // If there is already a process running, we only store the arguments for the next run.
      argsNext = args
    }
  }

  return activate
}

// This function checks if a promise can be processed as long as the conditional callback returns true.
// @see https://stackoverflow.com/a/64947598/755393
const waitUntil = (condition: () => boolean): Promise<void> => {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (!condition()) {
        return
      }

      clearInterval(interval)
      resolve()
    })
  })
}

// This function lets you control how many promises can be worked on concurrently.
// As soon as one promise ends, another one can be processed.
// If the concurrency number is zero then they will be processed immediately.
export const promiseLimit = (concurrency: number) => {
  // If concurrency is zero, all promises are executed immediately.
  if (concurrency === 0) {
    return <T>(func: () => T) => {
      return func()
    }
  }

  let inProgress = 0

  return async <T>(func: () => T) => {
    // Otherwise, it will be necessary to wait until there is a "vacancy" in the concurrency process for the promise to be executed.
    await waitUntil(() => inProgress < concurrency)

    // As soon as this "vacancy" is made available, the function is executed.
    // Note that the execution of the function "takes a seat" during the process.
    inProgress++
    const funcResult = await func()
    inProgress--

    return funcResult
  }
}

// Strip all non-numeric values from the beginning of a version.
// In principle, we should use semver.coerce() or semver.clean() for this, but they don't work well for pre-release ranges.
// Eg.: semver.coerce("^13.0.7-canary.3") => "13.0.7"
// Eg.: semver.clean("^13.0.7-canary.3") => null
// Expected: "13.0.7-canary.3"
export const versionClear = (version: string) =>
  version.replace(/^\D+/, "").trimEnd()
