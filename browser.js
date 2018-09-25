import unfetch from 'unfetch'
import { VASTLoader } from './lib/loader'
import { VASTLoaderError } from './lib/loader-error'
import { HTTPError } from './lib/http-error'
import { atob } from './lib/browser/atob'

VASTLoader.fetch = unfetch
VASTLoader.atob = atob

export { VASTLoader, VASTLoaderError, HTTPError }
