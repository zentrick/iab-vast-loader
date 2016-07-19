import 'core-js/es6'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinon from 'sinon'

chai.use(chaiAsPromised)

global.expect = chai.expect
global.sinon = sinon
