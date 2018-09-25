const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
const dirtyChai = require('dirty-chai')

chai.use(chaiAsPromised)
chai.use(sinonChai)
chai.use(dirtyChai)

global.expect = chai.expect
global.sinon = sinon
