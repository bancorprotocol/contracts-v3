![Bancor 3 Dawn](./docs/images/bancor3.png)

# Bancor Protocol Contracts v3.0 (Dawn Release)

[![Build Status](https://github.com/bancorprotocol/contracts-v3/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/bancorprotocol/contracts-v3/actions/workflows/ci.yml)

## Overview

Bancor is a decentralized trading and yield protocol. Its network of on-chain automated market makers (AMMs) supports instant token-to-token trades, as well as single-sided liquidity provision, auto-compounding staking rewards and 100% [impermanent loss](https://www.youtube.com/watch?v=_m6Mowq3Ptk) protection for any listed asset.

The Dawn release includes the following features:

- Token to token trades
- Instant IL protection
- Single-sided Liquidity Provision
- Omnipool
- Infinity Pools
- Auto-compounding Rewards
- Dual Rewards
- Third Party IL Protection
- Composable Pool Tokens
- Tokenomics Redesign
- Flash Loans

## Security

The repository is part of the bug bounty program.
See the details [here](./docs/bug-bounty.md).

The security policy is available [here](./SECURITY.md).

## Setup

As a first step of contributing to the repo, you should install all the required dependencies via:

```sh
yarn install
```

You will also need to create and update the `.env` file if you’d like to interact or run the unit tests against mainnet forks (see [.env.example](./.env.example))

## Testing

Testing the protocol is possible via multiple approaches:

### Unit Tests

You can run the full test suite (takes about two hours) via:

```sh
yarn test
```

You can also run the test suite with additional stress tests via:

```sh
yarn test:nightly
```

This suite is called “nightly” since it’s scheduled to run every day at midnight against the release and production branches (see [nightly.yml](.github/workflows/nightly.yml)).

### Deployment Tests

You can run deployment unit-tests (which are also part of the full test suite) via:

```sh
yarn test:deploy
```

You can also run a specialized set of deployment tests against a mainnet fork via:

```sh
yarn test:deploy:fork
```

This will automatically be skipped on an already deployed and configured deployment scripts and will only test the additional changeset resulting by running any new/pending deployment scripts and perform an e2e test against the up to date state. This is especially useful to verify that any future deployments and upgrades, suggested by the DAO, work correctly and preserve the integrity of the system.

### Coverage Tests

#### Report (2022-04-18)

- 99.66% Statements 1464/1469
- 96.91% Branches 471/486
- 100% Functions 444/444
- 99.11% Lines 1567/1581

![Coverage Report](./docs/images/coverage.png)

#### Instructions

In order to audit the test coverage of the full test suite, run:

```sh
yarn test:coverage
```

It’s also possible to audit the test coverage of the deployment unit-tests only (which is especially useful when verifying that any future deployments and upgrades are properly covered and tested before the DAO can consider to execute them):

```sh
yarn test:coverage:deploy
```

Similarly to the regular test suite, it’s also possible to audit the test coverage of the stress test suite via:

```sh
yarn test:coverage:nightly
```

## Profiling

You can profile the gas costs of all of the user-focused flows (provisioning or removing liquidity, trading, participating in auto-compounding staking rewards, migrating v2.1 positions, taking a flash-loan, etc.) via:

```sh
yarn profile
```

## Deployments

The contracts have built-in support for deployments on different chains and mainnet forks, powered by the awesome [hardhat-deploy](https://github.com/wighawag/hardhat-deploy) framework (tip of the hat to @wighawag for the crazy effort him and the rest of the contributors have put into the project).

You can deploy the fully configured Bancor v3 protocol (the Dawn release) via:

```sh
yarn deploy
```

There’s also a special deployment mode which deploys the protocol to a mainnet fork, with additional goodies:

Various additional test configurations, pools, tokens, and both standard and auto-compounding staking rewards programs are automatically deployed for testing purposes.
Various timing configurations are shortened by default (in order to speed up any integrations or simulations).

It can be run via:

```sh
yarn deploy:fork
```

### Local Deployment

It’s also possible to test the deployment to a local persistent node for further testing or simulations via:

```sh
yarn deploy:local
```

Please note that the framework will look for a local RPC node running on port 8545 with chainId 31337. One way to achieve this is to run a local hardhat node via:

```sh
yarn dev
```

## Community

- [Twitter](https://twitter.com/Bancor)
- [Telegram](https://t.me/bancor)
- [Discord](https://discord.gg/aMVTbrmgD7)
- [Reddit](https://www.reddit.com/r/Bancor)
