# Coaty JS - libp2p Communication Binding

[![Powered by Coaty 2](https://img.shields.io/badge/Powered%20by-Coaty%202-FF8C00.svg)](https://coaty.io)
[![TypeScript](https://img.shields.io/badge/Source%20code-TypeScript-007ACC.svg)](http://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![release](https://img.shields.io/badge/release-Conventional%20Commits-yellow.svg)](https://conventionalcommits.org/)
[![npm version](https://badge.fury.io/js/%40coaty%2Fbinding.libp2p.svg)](https://www.npmjs.com/package/@coaty/binding.libp2p)

## Table of Contents

* [Introduction](#introduction)
* [How to use](#how-to-use)
* [Contributing](#contributing)
* [License](#license)

## Introduction

This binding package provides a [Coaty](https://coaty.io) communication binding
for transmitting Coaty communication events via the [libp2p](https://libp2p.io/)
network stack using its pubsub interfaces. This binding builds upon peer-to-peer
based communication without the need for a central broker or router component.

This package comes with complete [API
documentation](https://coatyio.github.io/binding.libp2p.js/api/index.html).

This package is considered the *reference implementation* for all
language-specific Coaty libp2p bindings. It includes the specification of the
[Coaty libp2p communication
protocol](https://coatyio.github.io/binding.libp2p.js/man/communication-protocol/)
which must be implemented by all libp2p bindings in order to be interoperable.

## How to use

You can install the latest version of this binding package in your Coaty
application as follows:

```sh
npm install @coaty/binding.libp2p
```

This npm package targets Coaty projects using ECMAScript version `es6` and
module format `commonjs`. It runs in Node.js 12 or higher. Support for browsers
is work in progress.

Ensure to always install a binding version that is *compatible* with the
`@coaty/core` framework version you are using in your application, i.e. both
packages must have the same major version.

Next, declare the libp2p binding in your Coaty agent container configuration as
follows:

```ts
import { Libp2pBinding } from "@coaty/binding.libp2p";

const configuration: Configuration = {
    ...
    communication: {
        binding: Libp2pBinding.withOptions({
            ...
        }),
        ...
    },
    ...
};
```

Available binding options are described in the [API
documentation](https://coatyio.github.io/binding.libp2p.js/api/interfaces/libp2pbindingoptions.html).

## Contributing

If you like this binding, please consider &#x2605; starring [the project on
github](https://github.com/coatyio/binding.libp2p.js). Contributions are welcome
and appreciated.

The recommended practice described in the [contribution
guidelines](https://github.com/coatyio/coaty-js/blob/master/CONTRIBUTING.md) of
the Coaty JS framework also applies here.

To release a new version of this package, follow these steps:

1. `npm run cut-release` - prepare a new release, including automatic
   versioning, documentation generation, conventional changelog, and tagging.
2. `npm run push-release` - push the prepared release to the remote git repo
3. `npm run publish-release` - publish the package on npm registry.

## License

Code and documentation copyright 2020 Siemens AG.

Code is licensed under the [MIT License](https://opensource.org/licenses/MIT).

Documentation is licensed under a
[Creative Commons Attribution-ShareAlike 4.0 International License](http://creativecommons.org/licenses/by-sa/4.0/).
