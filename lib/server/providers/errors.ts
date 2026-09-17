export class EntitlementDeniedError extends Error {
  constructor(provider: string, resource: string) {
    super(`${provider}: entitlement denied for ${resource}`)
    this.name = 'EntitlementDeniedError'
  }
}

export class RateLimitExceededError extends Error {
  constructor(provider: string, message: string) {
    super(`${provider}: rate limit exceeded - ${message}`)
    this.name = 'RateLimitExceededError'
  }
}
