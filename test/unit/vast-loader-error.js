import VASTLoaderError from '../../src/error'

describe('VASTLoaderError', function () {
  describe('#code', function () {
    it('gets set from the constructor', function () {
      const error = new VASTLoaderError(301)
      expect(error.code).to.equal(301)
    })
  })

  describe('#message', function () {
    it('resolves from the code', function () {
      const error = new VASTLoaderError(301)
      expect(error.message).to.equal('Timeout.')
    })
  })

  describe('#cause', function () {
    it('gets set from the constructor', function () {
      const cause = new Error('Foo')
      const error = new VASTLoaderError(301, cause)
      expect(error.cause).to.equal(cause)
    })
  })

  describe('#$type', function () {
    it('is VASTLoaderError', function () {
      const error = new VASTLoaderError(900)
      expect(error.$type).to.equal('VASTLoaderError')
    })
  })
})
