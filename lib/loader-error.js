import VASTError from 'iab-vast-error'

class VASTLoaderError extends VASTError {
  constructor (code, cause = null, uri = null) {
    super(code)
    this.cause = cause
    this.uri = uri
    this.$type = 'VASTLoaderError'
  }
}

export { VASTLoaderError }
