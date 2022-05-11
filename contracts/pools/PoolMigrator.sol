// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { Pool, PoolLiquidity, IPoolCollection, AverageRate } from "./interfaces/IPoolCollection.sol";
import { IPoolToken } from "./interfaces/IPoolToken.sol";
import { IPoolMigrator } from "./interfaces/IPoolMigrator.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Fraction } from "../utility/FractionLibrary.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Token } from "../token/Token.sol";
import { Utils, InvalidPool, InvalidPoolCollection } from "../utility/Utils.sol";

interface IPoolCollectionBase {
    function migratePoolOut(Token pool, IPoolCollection targetPoolCollection) external;
}

interface IPoolCollectionV1 is IPoolCollectionBase {
    struct PoolLiquidityV1 {
        uint128 bntTradingLiquidity; // the BNT trading liquidity
        uint128 baseTokenTradingLiquidity; // the base token trading liquidity
        uint256 stakedBalance; // the staked balance
    }

    struct PoolV1 {
        IPoolToken poolToken; // the pool token of a given pool
        uint32 tradingFeePPM; // the trading fee (in units of PPM)
        bool tradingEnabled; // whether trading is enabled
        bool depositingEnabled; // whether depositing is enabled
        AverageRate averageRate; // the recent average rate
        uint256 depositLimit; // the deposit limit
        PoolLiquidityV1 liquidity; // the overall liquidity in the pool
    }

    function poolData(Token token) external view returns (PoolV1 memory);
}

/**
 * @dev Pool Migrator contract
 */
contract PoolMigrator is IPoolMigrator, Upgradeable, Utils {
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
        return 1;
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
        if (prevPoolCollection.version() == 1) {
            _migrateFromV1(pool, IPoolCollectionV1(address(prevPoolCollection)), newPoolCollection);

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
    function _migrateFromV1(
        Token pool,
        IPoolCollectionV1 sourcePoolCollection,
        IPoolCollection targetPoolCollection
    ) private {
        IPoolCollectionV1.PoolV1 memory data = sourcePoolCollection.poolData(pool);

        // since the latest pool collection is also v1, currently not additional pre- or post-processing is needed
        Pool memory newData = Pool({
            poolToken: data.poolToken,
            tradingFeePPM: data.tradingFeePPM,
            tradingEnabled: data.tradingEnabled,
            depositingEnabled: data.depositingEnabled,
            averageRate: data.averageRate,
            depositLimit: data.depositLimit,
            liquidity: PoolLiquidity({
                bntTradingLiquidity: data.liquidity.bntTradingLiquidity,
                baseTokenTradingLiquidity: data.liquidity.baseTokenTradingLiquidity,
                stakedBalance: data.liquidity.stakedBalance
            })
        });

        sourcePoolCollection.migratePoolOut(pool, targetPoolCollection);
        targetPoolCollection.migratePoolIn(pool, newData);
    }
}
