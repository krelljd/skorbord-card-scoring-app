/**
 * Queue for score taps made while the server cannot be reached. Each tap keeps
 * the opId it was created with, so replaying it after a lost reply is safe: the
 * server applies an opId once. Taps replay in the order they were made.
 * Kept in localStorage so a reload or a closed tab does not lose them.
 */

const KEY = 'skorbord.pendingTaps'

function safeStorage() {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

export function createOpQueue(storage = safeStorage()) {
  let items = []

  const persist = () => {
    try {
      storage?.setItem(KEY, JSON.stringify(items))
    } catch {
      // Private mode or full storage: the queue still works for this page load
    }
  }

  const load = (gameId) => {
    try {
      const saved = JSON.parse(storage?.getItem(KEY) || '[]')
      items = Array.isArray(saved) ? saved.filter((op) => op.gameId === gameId) : []
    } catch {
      items = []
    }
    persist()
    return items.length
  }

  return {
    load,
    get size() {
      return items.length
    },
    peek: () => items[0] || null,
    push(op) {
      items.push(op)
      persist()
    },
    shift() {
      const op = items.shift()
      persist()
      return op
    },
    clear() {
      items = []
      persist()
    }
  }
}

/** A failure to reach the server, as opposed to the server refusing the tap. */
export function isNetworkError(error) {
  return error?.status === 0 || error?.name === 'TypeError'
}

/**
 * Sends queued taps one at a time, oldest first.
 * Stops at the first network failure (the tap stays queued).
 * A tap the server refuses is dropped, since retrying cannot help.
 *
 * @returns {Promise<{ sent: number, dropped: Array<{ op: object, error: Error }>, stalled: boolean }>}
 */
export async function flushQueue(queue, send) {
  let sent = 0
  const dropped = []
  while (queue.size > 0) {
    const op = queue.peek()
    try {
      await send(op)
      queue.shift()
      sent += 1
    } catch (error) {
      if (isNetworkError(error)) return { sent, dropped, stalled: true }
      queue.shift()
      dropped.push({ op, error })
    }
  }
  return { sent, dropped, stalled: false }
}
