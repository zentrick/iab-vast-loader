import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinon from 'sinon'
import sinonChai from 'sinon-chai'
import dirtyChai from 'dirty-chai'

chai.use(chaiAsPromised)
chai.use(sinonChai)
chai.use(dirtyChai)

global.expect = chai.expect
global.sinon = sinon
