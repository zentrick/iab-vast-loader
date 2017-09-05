import fs from 'fs'
import path from 'path'
import parseVast from 'iab-vast-parser'

const fixturesPath = path.resolve(__dirname, '../fixtures')

const buildVastVars = vastPath => {
  const url = 'http://192.168.1.200:8080/' + vastPath
  const str = fs.readFileSync(path.join(fixturesPath, vastPath), 'utf8')
  const model = parseVast(str)

  return { url, str, model }
}

export const buildVast = () => {
  const a = buildVastVars('vast-a.xml')
  const b = buildVastVars('vast-b.xml')
  const c = buildVastVars('vast-c.xml')
  const d = buildVastVars('vast-d.xml')
  const e = buildVastVars('vast-e.xml')
  const standalone = buildVastVars('vast-standalone.xml')

  // Setup the Wrapper => VAST links.
  b.model.parent = a.model.adBuffet.toArray()[1]
  c.model.parent = a.model.adBuffet.toArray()[3]
  d.model.parent = b.model.adBuffet.toArray()[0]
  e.model.parent = b.model.adBuffet.toArray()[2]

  return { a, b, c, d, e, standalone }
}

export const buildAd = (vast) => {
  const [p, q, r, s, t] = vast.a.model.adBuffet.toArray()
  const [u, v, w] = vast.b.model.adBuffet.toArray()
  const [x] = vast.c.model.adBuffet.toArray()
  const [y] = vast.d.model.adBuffet.toArray()
  const [z] = vast.e.model.adBuffet.toArray()

  return { p, q, r, s, t, u, v, w, x, y, z }
}
