import VASTError from 'iab-vast-error'

export default class VASTLoaderError extends VASTError {
  constructor (code, cause = null, uri = null) {
    super(code)
    this.$type = 'VASTLoaderError'
    this.cause = cause
    this.uri = uri
  }
}
