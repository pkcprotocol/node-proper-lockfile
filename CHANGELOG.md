# Changelog

## 4.2.0 (2026-04-17)

### ⚠ BREAKING CHANGES

* We were marking the lock as compromised when system went into sleep or if the event loop was busy taking too long to run the internals timers, Now we keep track of the mtime updated by the current process, and if we lose some cycles in the update process but recover and the mtime is still ours we do not mark the lock as compromised.
* remove callback support
* use of node lts language features such as object spread
* compromised function in lock() has been moved to an option

### chore

* update project to latest node lts ([b1d43e5](https://github.com/pkcprotocol/node-proper-lockfile/commit/b1d43e525418d74d6fa7cfa246e6451b3cbdd485))

### Features

* add lock path option ([#66](https://github.com/pkcprotocol/node-proper-lockfile/issues/66)) ([32f1b8d](https://github.com/pkcprotocol/node-proper-lockfile/commit/32f1b8dca649a71b8bc178dffcad68158bd2dcdc))
* add signal exit ([#65](https://github.com/pkcprotocol/node-proper-lockfile/issues/65)) ([f20bc45](https://github.com/pkcprotocol/node-proper-lockfile/commit/f20bc4546781d502c16b10d0d22a31c00ec6c6ca))
* allow second precision in mtime comparison ([#78](https://github.com/pkcprotocol/node-proper-lockfile/issues/78)) ([b2816a6](https://github.com/pkcprotocol/node-proper-lockfile/commit/b2816a6af5a1fc1265989629d868cb5ca756b2e4))
* make staleness check more robust ([#74](https://github.com/pkcprotocol/node-proper-lockfile/issues/74)) ([9cc0973](https://github.com/pkcprotocol/node-proper-lockfile/commit/9cc09731726bbf4f97ba92197e541d99965f1fe1)), closes [#71](https://github.com/pkcprotocol/node-proper-lockfile/issues/71)
* migrate to TypeScript, rename to @pkc/proper-lock-file, pin Node 20 ([4c7e51a](https://github.com/pkcprotocol/node-proper-lockfile/commit/4c7e51ac5a37a2f3f3129ef2851394dc64ad5cf0))

### Bug Fixes

* add prepare script so dist/ is built on git install ([30564d7](https://github.com/pkcprotocol/node-proper-lockfile/commit/30564d7e0bd06d145c88a16896c779e97503a735))
* fix mtime precision on some filesystems ([#88](https://github.com/pkcprotocol/node-proper-lockfile/issues/88)) ([f266158](https://github.com/pkcprotocol/node-proper-lockfile/commit/f266158909b8cc23e3c3ca2fca7214df2f416589)), closes [#82](https://github.com/pkcprotocol/node-proper-lockfile/issues/82) [#87](https://github.com/pkcprotocol/node-proper-lockfile/issues/87)
* fix node 14 updating graceful-fs ([#102](https://github.com/pkcprotocol/node-proper-lockfile/issues/102)) ([b0d988e](https://github.com/pkcprotocol/node-proper-lockfile/commit/b0d988e95613e9837bb251abcad79e5d47d2b133))
* fix typo in error message ([#68](https://github.com/pkcprotocol/node-proper-lockfile/issues/68)) ([b91cb55](https://github.com/pkcprotocol/node-proper-lockfile/commit/b91cb551abf74c11e59b822f42fdbb851be32db8))
* **package:** change package name to @plebbit/node-proper-lockfile ([7fd6332](https://github.com/pkcprotocol/node-proper-lockfile/commit/7fd6332117340c1d3d98dd0afee2d31cc06f72b8))
* **package:** update retry to version 0.12.0 ([#50](https://github.com/pkcprotocol/node-proper-lockfile/issues/50)) ([d400b98](https://github.com/pkcprotocol/node-proper-lockfile/commit/d400b9804f8e1dff73372c7ec7800c134aae793e))
* restore ability to use lockfile() directly ([0ef8fbc](https://github.com/pkcprotocol/node-proper-lockfile/commit/0ef8fbc913b523aa9c02b0632a6cec85b4da43df))
* updated locks key to be filepath + lock file path ([d8b6381](https://github.com/pkcprotocol/node-proper-lockfile/commit/d8b63817f9ea3304d3e048976d72b3108ec076ff))

### Reverts

* Revert "Release 2.0.0" ([57a3b15](https://github.com/pkcprotocol/node-proper-lockfile/commit/57a3b156827fee9fab813bccc88a2f8d17ee5c91))

### Build System

* add automated versioning, npm trusted publishing, and GitHub Actions CI ([eaabc97](https://github.com/pkcprotocol/node-proper-lockfile/commit/eaabc97f515943eda185e6d795b0c24f354d3b0d))

# Change Log

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

<a name="4.1.2"></a>
## [4.1.2](https://github.com/moxystudio/node-proper-lockfile/compare/v4.1.1...v4.1.2) (2021-01-25)


### Bug Fixes

* fix node 14 updating graceful-fs ([#102](https://github.com/moxystudio/node-proper-lockfile/issues/102)) ([b0d988e](https://github.com/moxystudio/node-proper-lockfile/commit/b0d988e))



<a name="4.1.1"></a>
## [4.1.1](https://github.com/moxystudio/node-proper-lockfile/compare/v4.1.0...v4.1.1) (2019-04-03)


### Bug Fixes

* fix mtime precision on some filesystems ([#88](https://github.com/moxystudio/node-proper-lockfile/issues/88)) ([f266158](https://github.com/moxystudio/node-proper-lockfile/commit/f266158)), closes [#82](https://github.com/moxystudio/node-proper-lockfile/issues/82) [#87](https://github.com/moxystudio/node-proper-lockfile/issues/87)



<a name="4.1.0"></a>
# [4.1.0](https://github.com/moxystudio/node-proper-lockfile/compare/v4.0.0...v4.1.0) (2019-03-18)


### Features

* allow second precision in mtime comparison ([#78](https://github.com/moxystudio/node-proper-lockfile/issues/78)) ([b2816a6](https://github.com/moxystudio/node-proper-lockfile/commit/b2816a6))



<a name="4.0.0"></a>
# [4.0.0](https://github.com/moxystudio/node-proper-lockfile/compare/v3.2.0...v4.0.0) (2019-03-12)


### Bug Fixes

* fix typo in error message ([#68](https://github.com/moxystudio/node-proper-lockfile/issues/68)) ([b91cb55](https://github.com/moxystudio/node-proper-lockfile/commit/b91cb55))


### Features

* make staleness check more robust ([#74](https://github.com/moxystudio/node-proper-lockfile/issues/74)) ([9cc0973](https://github.com/moxystudio/node-proper-lockfile/commit/9cc0973)), closes [#71](https://github.com/moxystudio/node-proper-lockfile/issues/71) [/github.com/ipfs/js-ipfs-repo/issues/188#issuecomment-468682971](https://github.com//github.com/ipfs/js-ipfs-repo/issues/188/issues/issuecomment-468682971)


### BREAKING CHANGES

* We were marking the lock as compromised when system went into sleep or if the event loop was busy taking too long to run the internals timers, Now we keep track of the mtime updated by the current process, and if we lose some cycles in the update process but recover and the mtime is still ours we do not mark the lock as compromised.



<a name="3.2.0"></a>
# [3.2.0](https://github.com/moxystudio/node-proper-lockfile/compare/v3.1.0...v3.2.0) (2018-11-19)


### Features

* add lock path option ([#66](https://github.com/moxystudio/node-proper-lockfile/issues/66)) ([32f1b8d](https://github.com/moxystudio/node-proper-lockfile/commit/32f1b8d))



<a name="3.1.0"></a>
# [3.1.0](https://github.com/moxystudio/node-proper-lockfile/compare/v3.0.2...v3.1.0) (2018-11-15)


### Bug Fixes

* **package:** update retry to version 0.12.0 ([#50](https://github.com/moxystudio/node-proper-lockfile/issues/50)) ([d400b98](https://github.com/moxystudio/node-proper-lockfile/commit/d400b98))


### Features

* add signal exit ([#65](https://github.com/moxystudio/node-proper-lockfile/issues/65)) ([f20bc45](https://github.com/moxystudio/node-proper-lockfile/commit/f20bc45))



<a name="3.0.2"></a>
## [3.0.2](https://github.com/moxystudio/node-proper-lockfile/compare/v3.0.1...v3.0.2) (2018-01-30)



<a name="3.0.1"></a>
## [3.0.1](https://github.com/moxystudio/node-proper-lockfile/compare/v3.0.0...v3.0.1) (2018-01-20)


### Bug Fixes

* restore ability to use lockfile() directly ([0ef8fbc](https://github.com/moxystudio/node-proper-lockfile/commit/0ef8fbc))



<a name="3.0.0"></a>
# [3.0.0](https://github.com/moxystudio/node-proper-lockfile/compare/v2.0.1...v3.0.0) (2018-01-20)


### Chores

* update project to latest node lts ([b1d43e5](https://github.com/moxystudio/node-proper-lockfile/commit/b1d43e5))


### BREAKING CHANGES

* remove callback support
* use of node lts language features such as object spread
* compromised function in lock() has been moved to an option
