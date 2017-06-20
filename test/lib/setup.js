import 'core-js/es6'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinon from 'sinon'
import sinonChai from 'sinon-chai'
import dirtyChai from 'dirty-chai'
// import {XMLHttpRequest} from 'xmlhttprequest'
import XMLHttpRequest from 'xhr2'

chai.use(chaiAsPromised)
chai.use(sinonChai)
chai.use(dirtyChai)

global.expect = chai.expect
global.sinon = sinon

global.XMLHttpRequest = XMLHttpRequest
