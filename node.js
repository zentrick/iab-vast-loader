const nodeFetch = require('node-fetch')
const esRequire = require('esm')(module)
const { VASTLoader } = esRequire('./lib/loader')
const { VASTLoaderError } = esRequire('./lib/loader-error')
const { HTTPError } = esRequire('./lib/http-error')
const { atob } = esRequire('./lib/node/atob')

VASTLoader.fetch = nodeFetch
VASTLoader.atob = atob

module.exports = {
  VASTLoader,
  VASTLoaderError,
  HTTPError
}
