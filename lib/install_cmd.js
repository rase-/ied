'use strict'

var path = require('path')
var async = require('async')
var assign = require('object-assign')
var mkdirp = require('mkdirp')
var expose = require('./expose')
var config = require('./config')
var install = require('./install')
var save = require('./save')
var run = require('./run')

// Invoke lifecycle scripts, such as postinstall
function invokeScripts (dir, pkg, cb) {
  run(dir, pkg, 'install', cb)
}


function runScripts (scripts, cb) {
  async.map(scripts, function (script, cb) {
    invokeScripts(script.dir, script.data, cb);
  }, cb);
}

function installCmd (cwd, argv, cb) {
  var node_modules = path.join(cwd, 'node_modules')
  var deps = argv._.slice(1)

  if (!deps.length) {
    // Read dependencies from package.json when no specific targets are supplied.
    var pkg = require(path.join(cwd, 'package.json'))
    var onlyDeps
    if (argv.only) {
      var field = ({
        'prod': 'dependencies',
        'production': 'dependencies',
        'dev': 'devDependencies',
        'development': 'devDependencies'
      })[argv.only] || argv.only
      onlyDeps = pkg[field] || {}
    }
    deps = onlyDeps || assign({}, pkg.dependencies, pkg.devDependencies)
    deps = Object.keys(deps).map(function (name) {
      return [ name, deps[name] ]
    })
  } else {
    // Use supplied dependencies if available.
    deps = deps.map(function (target) {
      var nameVersion = /^(@?.+?)(?:@(.+)?)?$/.exec(target)
      return [ nameVersion[1], nameVersion[2] || '*' ]
    })
  }

  async.series([
    mkdirp.bind(null, path.join(cwd, 'node_modules', '.bin')),
    mkdirp.bind(null, path.join(config.cacheDir, '.tmp')),
    function (cb) {
      var installAll = async.map.bind(null, deps, function (target, cb) {
        var name = target[0]
        var version = target[1]
        install(node_modules, name, version, function (ierr, res) {
          runScripts(res.data, function (err) {
            if (err) return cb(err);
            cb(ierr && ierr.code === 'LOCKED' ? null : ierr, res.pkg || res);
          });
        })
      })

      var exposeAll = expose.bind(null, node_modules)
      var waterfall = [ installAll, exposeAll ]

      if (argv.save) {
        waterfall.push(save.bind(null, cwd, 'dependencies'))
      }

      if (argv['save-dev']) {
        waterfall.push(save.bind(null, cwd, 'devDependencies'))
      }

      async.waterfall(waterfall, function (err) {
        if (err) throw err
        cb()
      })
    }
  ], cb)
}

module.exports = installCmd
