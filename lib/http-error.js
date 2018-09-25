import ExtendableError from 'es6-error'

class HTTPError extends ExtendableError {
  constructor (status, statusText) {
    super(
      `HTTP ${status}` +
        (statusText != null && statusText !== '' ? `: ${statusText}` : '')
    )
    this.status = status
    this.statusText = statusText
    this.$type = 'HTTPError'
  }
}

export { HTTPError }
