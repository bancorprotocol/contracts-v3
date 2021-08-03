import { NETWORK_TOKEN_POOL_TOKEN_SYMBOL, NETWORK_TOKEN_POOL_TOKEN_NAME } from './Constants';
import Contracts, { Contract, ContractBuilder } from 'components/Contracts';
import { BaseContract, BigNumber, ContractFactory } from 'ethers';
import { isEqual } from 'lodash';
import { toAddress } from 'test/helpers/Utils';
import { BancorNetwork, PoolCollection, NetworkSettings, ProxyAdmin, TestERC20Token } from 'typechain';

const TOTAL_SUPPLY = BigNumber.from(1_000_000_000).mul(BigNumber.from(10).pow(18));

type CtorArgs = Parameters<any>;
type InitArgs = Parameters<any>;

interface ProxyArguments {
    skipInitialization?: boolean;
    initArgs?: InitArgs;
    ctorArgs?: CtorArgs;
}

interface Logic {
    ctorArgs: CtorArgs;
    contract: BaseContract;
}

let logicContractsCache: Record<string, Logic> = {};
let admin: ProxyAdmin;

export const proxyAdmin = async () => {
    if (!admin) {
        admin = await Contracts.ProxyAdmin.deploy();
    }

    return admin;
};

const createLogic = async <F extends ContractFactory>(factory: ContractBuilder<F>, ctorArgs: CtorArgs = []) => {
    // check if we can reuse a previously cached exact logic contract (e.g., the same contract and constructor arguments)
    const cached = logicContractsCache[factory.contractName];
    if (cached && isEqual(cached.ctorArgs, ctorArgs)) {
        return cached.contract;
    }

    const logicContract = await (factory.deploy as Function)(...(ctorArgs || []));
    logicContractsCache[factory.contractName] = { ctorArgs, contract: logicContract };

    return logicContract;
};

const createTransparentProxy = async (
    logicContract: BaseContract,
    skipInitialization: boolean = false,
    initArgs: InitArgs = []
) => {
    const admin = await proxyAdmin();
    const data = skipInitialization ? [] : logicContract.interface.encodeFunctionData('initialize', initArgs);
    return Contracts.TransparentUpgradeableProxy.deploy(logicContract.address, admin.address, data);
};

const createProxy = async <F extends ContractFactory>(
    factory: ContractBuilder<F>,
    args?: ProxyArguments
): Promise<Contract<F>> => {
    const logicContract = await createLogic(factory, args?.ctorArgs);
    const proxy = await createTransparentProxy(logicContract, args?.skipInitialization, args?.initArgs);

    return factory.attach(proxy.address);
};

export const createNetworkToken = async () => Contracts.TestERC20Token.deploy('BNT', 'BNT', TOTAL_SUPPLY);

export const createTokenHolder = async () => {
    const tokenHolder = await Contracts.TokenHolderUpgradeable.deploy();
    await tokenHolder.initialize();

    return tokenHolder;
};

export const createPoolCollection = async (network: string | BaseContract) =>
    Contracts.TestPoolCollection.deploy(toAddress(network));

export const createSystem = async () => {
    const networkToken = await createNetworkToken();

    const networkSettings = await createProxy(Contracts.NetworkSettings);

    const network = await createProxy(Contracts.TestBancorNetwork, {
        skipInitialization: true,
        ctorArgs: [networkToken.address, networkSettings.address]
    });

    const vault = await createProxy(Contracts.BancorVault, { ctorArgs: [networkToken.address] });
    const networkTokenPoolToken = await Contracts.PoolToken.deploy(
        NETWORK_TOKEN_POOL_TOKEN_NAME,
        NETWORK_TOKEN_POOL_TOKEN_SYMBOL,
        networkToken.address
    );
    const networkTokenPool = await createProxy(Contracts.TestNetworkTokenPool, {
        skipInitialization: true,
        ctorArgs: [network.address, vault.address, networkTokenPoolToken.address]
    });
    await networkTokenPoolToken.transferOwnership(networkTokenPool.address);
    await networkTokenPool.initialize();

    const pendingWithdrawals = await createProxy(Contracts.TestPendingWithdrawals, {
        ctorArgs: [network.address, networkTokenPool.address]
    });
    const poolCollection = await createPoolCollection(network);

    await network.initialize(pendingWithdrawals.address);

    return {
        networkSettings,
        network,
        networkToken,
        networkTokenPoolToken,
        vault,
        networkTokenPool,
        pendingWithdrawals,
        poolCollection
    };
};

export const createPool = async (
    reserveToken: TestERC20Token,
    network: BancorNetwork,
    networkSettings: NetworkSettings,
    poolCollection: PoolCollection
) => {
    await networkSettings.addTokenToWhitelist(reserveToken.address);

    await network.addPoolCollection(poolCollection.address);
    await network.createPool(await poolCollection.poolType(), reserveToken.address);

    const pool = await poolCollection.poolData(reserveToken.address);
    return Contracts.PoolToken.attach(pool.poolToken);
};
