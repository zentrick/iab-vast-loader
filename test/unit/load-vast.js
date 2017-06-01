import { VAST } from 'iab-vast-model'
import { loadVast } from '../../src/load-vast'
import path from 'path'
import express from 'express'

const fixturesPath = path.resolve(__dirname, '../fixtures')

describe('#loadVast', () => {
  // loadVast({
  //   url: ''
  // })
  let server, baseUrl

  before(cb => {
    const app = express()

    app.use(express.static(fixturesPath))

    server = app.listen(() => {
      baseUrl = 'http://localhost:' + server.address().port + '/'
      cb()
    })
  })

  after(cb => {
    server.close(cb)
  })

  it('should load a VAST tag', async () => {
    const fetchingVast =
      loadVast({
        url: baseUrl + 'tremor-video/vast_inline_linear.xml'
      })
      .toArray()
      .toPromise()

    const events = await fetchingVast
    expect(events.length).to.equal(1)
    expect(events[0].type).to.equal('VAST_LOADED')
    expect(events[0].vast).to.be.an.instanceof(VAST)
  })
})
