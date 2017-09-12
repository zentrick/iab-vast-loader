import ExtendableError from 'es6-error'

export default class HTTPError extends ExtendableError {
  constructor (status, statusText) {
    super(`HTTP ${status}` +
      ((statusText != null && statusText !== '') ? `: ${statusText}` : ''))
    this.status = status
    this.statusText = statusText
    this.$type = 'HTTPError'
  }
}
