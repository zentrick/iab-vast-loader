import codeToMessage from './error-codes'

export default class VASTLoaderError extends Error {
  constructor (code, cause) {
    super(codeToMessage[code])
    this._code = code
    this._cause = cause
  }

  get code () {
    return this._code
  }

  get cause () {
    return this._cause
  }

  get $type () {
    return 'VASTLoaderError'
  }
}
