import express from 'express'
import path from 'path'
import { fx } from '../../src/rxjs-fx'
import { buildVast } from '../lib/build-vast'
import { Observable } from 'rxjs/Observable'

const fixturesPath = path.resolve(__dirname, '../fixtures')
const vast = buildVast()

describe('fx', () => {
  describe('#http()', () => {
    let baseUrl, server

    before((cb) => {
      const app = express()
      app.use(express.static(fixturesPath))
      server = app.listen(() => {
        baseUrl = 'http://localhost:' + server.address().port + '/'
        cb()
      })
    })

    after((cb) => {
      server.close(cb)
    })

    it('should fetch the correct resource', async () => {
      const http$ = fx.http(baseUrl + 'vast-standalone.xml')

      // First we map the Observable to an Observable with all the observed events in one array,
      // which we then convert to a promise.
      const actual = await http$.toArray().toPromise()

      expect(actual).to.deep.equal([vast.standalone.str])
    })

    it('should emit an error when fetching fails', async () => {
      const http$ = fx.http(baseUrl + 'non-existent.xml')
      const error = new Error('http failed')

      const actual = await http$.catch(() => Observable.of(error)).toArray().toPromise()

      expect(actual).to.deep.equal([error])
    })
  })
})
