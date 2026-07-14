export function waitUntil(promise: Promise<unknown>): void {
  promise.catch((err) => {
    console.error('[waitUntil] Background task failed:', err)
  })
}
