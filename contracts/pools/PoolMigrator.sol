// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { Pool, PoolLiquidity, IPoolCollection, AverageRates } from "./interfaces/IPoolCollection.sol";
import { IPoolToken } from "./interfaces/IPoolToken.sol";
import { IPoolMigrator } from "./interfaces/IPoolMigrator.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { FractionLibrary, Fraction, Fraction112 } from "../utility/FractionLibrary.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Token } from "../token/Token.sol";
import { Utils, InvalidPool, InvalidPoolCollection } from "../utility/Utils.sol";

interface IPoolCollectionBase {
    function migratePoolOut(Token pool, IPoolCollection targetPoolCollection) external;
}

interface IPoolCollectionV3 is IPoolCollectionBase {
    struct PoolV3 {
        IPoolToken poolToken; // the pool token of a given pool
        uint32 tradingFeePPM; // the trading fee (in units of PPM)
        bool tradingEnabled; // whether trading is enabled
        bool depositingEnabled; // whether depositing is enabled
        AverageRates averageRates; // the recent average rate
        PoolLiquidity liquidity; // the overall liquidity in the pool
    }

    function poolData(Token token) external view returns (PoolV3 memory);
}

/**
 * @dev Pool Migrator contract
 */
contract PoolMigrator is IPoolMigrator, Upgradeable, Utils {
    using FractionLibrary for Fraction;
    using FractionLibrary for Fraction112;

    error UnsupportedVersion();

    IPoolCollection private constant INVALID_POOL_COLLECTION = IPoolCollection(address(0));

    // the network contract
    IBancorNetwork private immutable _network;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 0] private __gap;

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(IBancorNetwork initNetwork) validAddress(address(initNetwork)) {
        _network = initNetwork;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __PoolMigrator_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __PoolMigrator_init() internal onlyInitializing {
        __Upgradeable_init();

        __PoolMigrator_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __PoolMigrator_init_unchained() internal onlyInitializing {}

    // solhint-enable func-name-mixedcase

    /**
     * @inheritdoc Upgradeable
     */
    function version() public pure override(IVersioned, Upgradeable) returns (uint16) {
        return 3;
    }

    /**
     * @inheritdoc IPoolMigrator
     */
    function migratePool(Token pool) external only(address(_network)) returns (IPoolCollection) {
        if (address(pool) == address(0)) {
            revert InvalidPool();
        }

        // get the pool collection that this pool exists in
        IPoolCollection prevPoolCollection = _network.collectionByPool(pool);
        if (address(prevPoolCollection) == address(0)) {
            revert InvalidPool();
        }

        // get the latest pool collection corresponding to its type and ensure that a migration is necessary
        // note that it's currently not possible to add two pool collections with the same version and type
        uint16 poolType = prevPoolCollection.poolType();
        IPoolCollection newPoolCollection = _network.latestPoolCollection(poolType);
        if (address(newPoolCollection) == address(prevPoolCollection)) {
            revert InvalidPoolCollection();
        }

        // migrate all relevant values based on a historical collection version into the new pool collection
        if (prevPoolCollection.version() == 3) {
            _migrateFromV3(pool, IPoolCollectionV3(address(prevPoolCollection)), newPoolCollection);

            return newPoolCollection;
        }

        revert UnsupportedVersion();
    }

    /**
     * @dev migrates a pool to the latest pool version
     */
    function _migrateFromV3(
        Token pool,
        IPoolCollectionV3 sourcePoolCollection,
        IPoolCollection targetPoolCollection
    ) private {
        IPoolCollectionV3.PoolV3 memory data = sourcePoolCollection.poolData(pool);
        AverageRates memory averageRates = data.averageRates;
        PoolLiquidity memory liquidity = data.liquidity;

        Pool memory newData = Pool({
            poolToken: data.poolToken,
            tradingFeePPM: data.tradingFeePPM,
            tradingEnabled: data.tradingEnabled,
            depositingEnabled: data.depositingEnabled,
            averageRates: averageRates,
            liquidity: liquidity
        });

        sourcePoolCollection.migratePoolOut(pool, targetPoolCollection);
        targetPoolCollection.migratePoolIn(pool, newData);
    }
}
