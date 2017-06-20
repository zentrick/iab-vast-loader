// @flow

import codeToMessage from './error-codes'

type Code = $Keys<typeof codeToMessage>

export class VASTLoaderError extends Error {
  _code: Code
  _cause: any

  constructor (code: Code, cause: any) {
    super(codeToMessage[code])
    this._code = code
    this._cause = cause
  }

  get code (): Code {
    return this._code
  }

  get cause (): any {
    return this._cause
  }

  get $type (): 'VASTLoaderError' {
    return 'VASTLoaderError'
  }
}
