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

interface IPoolCollectionV2 is IPoolCollectionBase {
    struct AverageRateV2 {
        uint32 blockNumber;
        Fraction112 rate;
    }

    struct PoolV2 {
        IPoolToken poolToken; // the pool token of a given pool
        uint32 tradingFeePPM; // the trading fee (in units of PPM)
        bool tradingEnabled; // whether trading is enabled
        bool depositingEnabled; // whether depositing is enabled
        AverageRateV2 averageRate; // the recent average rate
        uint256 depositLimit; // the deposit limit
        PoolLiquidity liquidity; // the overall liquidity in the pool
    }

    function poolData(Token token) external view returns (PoolV2 memory);
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
     * @dev triggered when an existing pool is migrated between pool collections
     */
    event PoolMigrated(Token indexed pool, IPoolCollection prevPoolCollection, IPoolCollection newPoolCollection);

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
        return 2;
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
        // note that it's currently not possible to add two pool collections with the same version or type
        uint16 poolType = prevPoolCollection.poolType();
        IPoolCollection newPoolCollection = _network.latestPoolCollection(poolType);
        if (address(newPoolCollection) == address(prevPoolCollection)) {
            revert InvalidPoolCollection();
        }

        // migrate all relevant values based on a historical collection version into the new pool collection
        if (prevPoolCollection.version() == 2) {
            _migrateFromV2(pool, IPoolCollectionV2(address(prevPoolCollection)), newPoolCollection);

            emit PoolMigrated({
                pool: pool,
                prevPoolCollection: prevPoolCollection,
                newPoolCollection: newPoolCollection
            });

            return newPoolCollection;
        }

        revert UnsupportedVersion();
    }

    /**
     * @dev migrates a V1 pool to the latest pool version
     */
    function _migrateFromV2(
        Token pool,
        IPoolCollectionV2 sourcePoolCollection,
        IPoolCollection targetPoolCollection
    ) private {
        IPoolCollectionV2.PoolV2 memory data = sourcePoolCollection.poolData(pool);
        IPoolCollectionV2.AverageRateV2 memory averageRate = data.averageRate;
        PoolLiquidity memory liquidity = data.liquidity;

        // since the latest pool collection is also v2, currently not additional pre- or post-processing is needed
        Pool memory newData = Pool({
            poolToken: data.poolToken,
            tradingFeePPM: data.tradingFeePPM,
            tradingEnabled: data.tradingEnabled,
            depositingEnabled: data.depositingEnabled,
            averageRates: AverageRates({
                blockNumber: averageRate.blockNumber,
                rate: averageRate.rate,
                invRate: Fraction({ n: liquidity.baseTokenTradingLiquidity, d: liquidity.bntTradingLiquidity })
                    .toFraction112()
            }),
            liquidity: PoolLiquidity({
                bntTradingLiquidity: liquidity.bntTradingLiquidity,
                baseTokenTradingLiquidity: liquidity.baseTokenTradingLiquidity,
                stakedBalance: liquidity.stakedBalance
            })
        });

        sourcePoolCollection.migratePoolOut(pool, targetPoolCollection);
        targetPoolCollection.migratePoolIn(pool, newData);
    }
}
