import gulp from 'gulp'
import loadPlugins from 'gulp-load-plugins'
import { Instrumenter } from 'isparta'
import del from 'del'
import seq from 'run-sequence'
import yargs from 'yargs'

const COVERAGE_THRESHOLDS = { global: 90 }
const { CIRCLECI, CIRCLE_TEST_REPORTS, COVERALLS } = process.env

const $ = loadPlugins()
const argv = yargs
  .string('grep')
  .boolean('bail')
  .argv

const unitTest = () => gulp.src(['test/lib/setup.js', 'test/unit/**/*.js'], { read: false })
  .pipe($.mocha({
    reporter: CIRCLECI ? 'mocha-junit-reporter' : 'spec',
    reporterOptions: CIRCLECI ? {
      mochaFile: `${CIRCLE_TEST_REPORTS}/junit/test-results-${process.version}.xml`
    } : {},
    grep: argv.grep,
    bail: argv.bail
  }))

gulp.task('clean', () => del('lib'))

gulp.task('build', ['clean'], () => {
  return gulp.src('src/**/*.js')
    .pipe($.sourcemaps.init())
    .pipe($.babel())
    .pipe($.sourcemaps.write())
    .pipe(gulp.dest('lib'))
})

gulp.task('lint', () => {
  return gulp.src('{src,test}/**/*.js')
    .pipe($.standard())
    .pipe($.standard.reporter('default', {
      breakOnError: false
    }))
})

gulp.task('test:unit', unitTest)

gulp.task('coverage:instrument', () => {
  return gulp.src('src/**/*.js')
    .pipe($.istanbul({
      instrumenter: Instrumenter
    }))
    .pipe($.istanbul.hookRequire())
})

gulp.task('coverage', ['coverage:instrument'], () => {
  return unitTest()
    .pipe($.istanbul.writeReports())
    .pipe($.istanbul.enforceThresholds({ thresholds: COVERAGE_THRESHOLDS }))
})

gulp.task('coveralls', () => {
  if (!COVERALLS) {
    return
  }
  return gulp.src('coverage/lcov.info')
    .pipe($.coveralls())
})

gulp.task('test', (cb) => seq('lint', 'coverage', 'coveralls', cb))

gulp.task('watch', () => gulp.watch('src/**/*', ['build']))

gulp.task('default', ['build'], () => gulp.start('watch'))
