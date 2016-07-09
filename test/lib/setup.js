import 'core-js/es6'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'

chai.use(chaiAsPromised)

global.expect = chai.expect
