# Bancor Protocol Contracts v3.0.0 (beta)

[![NPM Package](https://img.shields.io/npm/v/@bancor/contracts-v3.svg)](https://www.npmjs.org/package/@bancor/contracts-v3)
[![Docs](https://img.shields.io/badge/docs-%F0%9F%93%84-blue)](https://docs.bancor.network/)
[![Build Status](https://github.com/bancorprotocol/contracts-v3/actions/workflows/ci.yml/badge.svg)](https://github.com/bancorprotocol/contracts-v3/actions/workflows/ci.yml)

## Overview

The solidity version of the Bancor smart contracts is composed of many different components that work together to create the Bancor Network deployment.

The main contracts are the BancorNetwork contract (entry point to the system) and the different converter contracts (implementation of liquidity pools and their reserves).

## Config

In order to use some plugins, API keys or custom network with secret config we need a config.json file. You can check `hardhat.config.js` for more details.

```json
{
    "keys": {
        "etherscan": "XYZ"
    },
    "networks": {
        "mainnet": {
            "url": "https://eth-mainnet.alchemyapi.io/v2/supersecretkey"
        }
    }
}
```

## Upgradeability

All smart contract functions are public and all upgrades are opt-in. If significant improvements are made to the system a new version will be released. Token owners can choose between moving to the new system or staying in the old one. If possible, new versions will be backwards compatible and able to interact with the old versions.

## Language

The terms “reserves” and “connectors” have the same meaning throughout Bancor’s smart contract code and documentation. “Reserve ratio” and “connector weight” are also used interchangeably. “Connector balance” refers to the token inventories held in a liquidity pool's reserves.

## Warning

Bancor is a work in progress. Make sure you understand the risks before using it.

## Testing

### Prerequisites

-   node 12.20.0
-   yarn 1.22.0

### Installation

-   `yarn install`

### Verification

-   Verifying all the contracts:
    -   `yarn test` (quick testing)
    -   `yarn test:ci` (full testing)
    -   `yarn test:coverage` (full coverage)

### Profiling

-   `yarn profile`

For an interactive profiling, with Tenderly integration:

-   `yarn profile:debug`
