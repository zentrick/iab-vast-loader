import codeToMessage from './error-codes'

export default class VASTLoaderError extends Error {
  constructor (code, cause = null, uri = null) {
    super(codeToMessage[code])
    this._code = code
    this._cause = cause
    this._uri = uri
  }

  get code () {
    return this._code
  }

  get cause () {
    return this._cause
  }

  get uri () {
    return this._uri
  }

  get $type () {
    return 'VASTLoaderError'
  }
}
