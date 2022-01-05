// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;
pragma abicoder v2;

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { Pool, PoolLiquidity, IPoolCollection } from "./interfaces/IPoolCollection.sol";
import { IPoolToken } from "./interfaces/IPoolToken.sol";
import { IPoolCollectionUpgrader } from "./interfaces/IPoolCollectionUpgrader.sol";

import { AverageRate } from "./PoolAverageRate.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Fraction } from "../utility/Types.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { ReserveToken } from "../token/ReserveToken.sol";
import { Utils, InvalidPool, InvalidPoolCollection } from "../utility/Utils.sol";

interface IPoolCollectionBase {
    function migratePoolOut(ReserveToken pool, IPoolCollection targetPoolCollection) external;
}

interface IPoolCollectionV1 is IPoolCollectionBase {
    struct PoolLiquidityV1 {
        uint256 networkTokenTradingLiquidity; // the network token trading liquidity
        uint256 baseTokenTradingLiquidity; // the base token trading liquidity
        uint256 tradingLiquidityProduct; // the product of the base token and network token trading liquidities (used for fee calculations)
        uint256 stakedBalance; // the staked balance
    }

    struct PoolV1 {
        IPoolToken poolToken; // the pool token of a given pool
        uint32 tradingFeePPM; // the trading fee (in units of PPM)
        bool tradingEnabled; // whether trading is enabled
        bool depositingEnabled; // whether depositing is enabled
        AverageRate averageRate; // the recent average rate
        Fraction initialRate; // the initial rate of one base token in network token units in a given pool
        uint256 depositLimit; // the deposit limit
        PoolLiquidityV1 liquidity; // the overall liquidity in the pool
    }

    function poolData(ReserveToken reserveToken) external view returns (PoolV1 memory);
}

/**
 * @dev Pool Collection Upgrader contract
 */
contract PoolCollectionUpgrader is IPoolCollectionUpgrader, Upgradeable, Utils {
    error UnsupportedVersion();

    IPoolCollection private constant INVALID_POOL_COLLECTION = IPoolCollection(address(0));

    // the network contract
    IBancorNetwork private immutable _network;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 0] private __gap;

    /**
     * @dev triggered when an existing pool is upgraded
     */
    event PoolUpgraded(
        uint16 indexed poolType,
        ReserveToken indexed pool,
        IPoolCollection prevPoolCollection,
        IPoolCollection newPoolCollection,
        uint16 prevVersion,
        uint16 newVersion
    );

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
        __PoolCollectionUpgrader_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __PoolCollectionUpgrader_init() internal onlyInitializing {
        __Upgradeable_init();

        __PoolCollectionUpgrader_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __PoolCollectionUpgrader_init_unchained() internal onlyInitializing {}

    // solhint-enable func-name-mixedcase

    /**
     * @inheritdoc IVersioned
     */
    function version() external pure returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IPoolCollectionUpgrader
     */
    function upgradePool(ReserveToken pool) external only(address(_network)) returns (IPoolCollection) {
        if (ReserveToken.unwrap(pool) == address(0)) {
            revert InvalidPool();
        }

        // get the pool collection that this pool exists in
        IPoolCollection prevPoolCollection = _network.collectionByPool(pool);
        if (address(prevPoolCollection) == address(0)) {
            revert InvalidPool();
        }

        // get the latest pool collection corresponding to its type and ensure that an upgrade is necessary. Please
        // note that it's currently not possible to add two pool collections with the same version or type
        uint16 poolType = prevPoolCollection.poolType();
        IPoolCollection newPoolCollection = _network.latestPoolCollection(poolType);
        if (address(newPoolCollection) == address(prevPoolCollection)) {
            revert InvalidPoolCollection();
        }

        // migrate all relevant values based on a historical collection version into the new pool collection
        if (prevPoolCollection.version() == 1) {
            _upgradeFromV1(pool, IPoolCollectionV1(address(prevPoolCollection)), newPoolCollection);

            emit PoolUpgraded({
                poolType: poolType,
                pool: pool,
                prevPoolCollection: prevPoolCollection,
                newPoolCollection: newPoolCollection,
                prevVersion: prevPoolCollection.version(),
                newVersion: newPoolCollection.version()
            });

            return newPoolCollection;
        }

        revert UnsupportedVersion();
    }

    /**
     * @dev upgrades a V1 pool to the latest pool version
     */
    function _upgradeFromV1(
        ReserveToken pool,
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
            initialRate: data.initialRate,
            depositLimit: data.depositLimit,
            liquidity: PoolLiquidity({
                networkTokenTradingLiquidity: data.liquidity.networkTokenTradingLiquidity,
                baseTokenTradingLiquidity: data.liquidity.baseTokenTradingLiquidity,
                tradingLiquidityProduct: data.liquidity.tradingLiquidityProduct,
                stakedBalance: data.liquidity.stakedBalance
            })
        });

        sourcePoolCollection.migratePoolOut(pool, targetPoolCollection);
        targetPoolCollection.migratePoolIn(pool, newData);
    }
}
