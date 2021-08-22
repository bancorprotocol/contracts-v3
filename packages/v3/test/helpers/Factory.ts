import Contracts, { Contract, ContractBuilder } from '../../components/Contracts';
import {
    BancorNetwork,
    BancorVault,
    NetworkSettings,
    PendingWithdrawals,
    PoolCollection,
    PoolToken,
    ProxyAdmin,
    TestERC20Token,
    TokenGovernance
} from '../../typechain';
import { roles } from './AccessControl';
import { NETWORK_TOKEN_POOL_TOKEN_NAME, NETWORK_TOKEN_POOL_TOKEN_SYMBOL } from './Constants';
import { toAddress } from './Utils';
import { BaseContract, BigNumber, ContractFactory } from 'ethers';
import { ethers } from 'hardhat';
import { isEqual } from 'lodash';

const { TokenGovernance: TokenGovernanceRoles, BancorVault: BancorVaultRoles } = roles;

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

const logicContractsCache: Record<string, Logic> = {};
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

    // eslint-disable-next-line @typescript-eslint/ban-types
    const logicContract = await (factory.deploy as Function)(...(ctorArgs || []));
    logicContractsCache[factory.contractName] = { ctorArgs, contract: logicContract };

    return logicContract;
};

const createTransparentProxy = async (
    logicContract: BaseContract,
    skipInitialization = false,
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

const createGovernedToken = async (name: string, symbol: string, totalSupply: BigNumber) => {
    const deployer = (await ethers.getSigners())[0];

    const token = await Contracts.TestSystemToken.deploy(name, symbol, totalSupply);
    const tokenGovernance = await Contracts.TestTokenGovernance.deploy(token.address);
    await tokenGovernance.grantRole(TokenGovernanceRoles.ROLE_GOVERNOR, deployer.address);
    await tokenGovernance.grantRole(TokenGovernanceRoles.ROLE_MINTER, deployer.address);
    await token.transferOwnership(tokenGovernance.address);
    await tokenGovernance.acceptTokenOwnership();

    return { token, tokenGovernance };
};

export const createGovernedTokens = async () => {
    const { token: networkToken, tokenGovernance: networkTokenGovernance } = await createGovernedToken(
        'BNT',
        'BNT',
        TOTAL_SUPPLY
    );
    const { token: govToken, tokenGovernance: govTokenGovernance } = await createGovernedToken(
        'vBNT',
        'vBNT',
        TOTAL_SUPPLY
    );

    return { networkToken, networkTokenGovernance, govToken, govTokenGovernance };
};

export const createTokenHolder = async () => {
    const tokenHolder = await Contracts.TokenHolderUpgradeable.deploy();
    await tokenHolder.initialize();

    return tokenHolder;
};

export const createPoolCollection = async (network: string | BaseContract, networkTokenPool: string | BaseContract) =>
    Contracts.TestPoolCollection.deploy(toAddress(network), toAddress(networkTokenPool));

const createNetworkTokenPoolUninitialized = async (
    network: BancorNetwork,
    pendingWithdrawals: PendingWithdrawals,
    vault: BancorVault,
    networkPoolToken: PoolToken,
    networkTokenGovernance: TokenGovernance,
    govTokenGovernance: TokenGovernance
) => {
    const networkTokenPool = await createProxy(Contracts.TestNetworkTokenPool, {
        skipInitialization: true,
        ctorArgs: [network.address, pendingWithdrawals.address, vault.address, networkPoolToken.address]
    });

    await networkPoolToken.transferOwnership(networkTokenPool.address);

    await networkTokenGovernance.grantRole(TokenGovernanceRoles.ROLE_MINTER, networkTokenPool.address);
    await govTokenGovernance.grantRole(TokenGovernanceRoles.ROLE_MINTER, networkTokenPool.address);

    await vault.grantRole(BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, networkTokenPool.address);

    return networkTokenPool;
};

export const createSystem = async () => {
    const { networkToken, networkTokenGovernance, govToken, govTokenGovernance } = await createGovernedTokens();

    const networkSettings = await createProxy(Contracts.NetworkSettings);

    const network = await createProxy(Contracts.TestBancorNetwork, {
        skipInitialization: true,
        ctorArgs: [networkTokenGovernance.address, govTokenGovernance.address, networkSettings.address]
    });

    const vault = await createProxy(Contracts.BancorVault, { ctorArgs: [networkToken.address] });
    const networkPoolToken = await Contracts.PoolToken.deploy(
        NETWORK_TOKEN_POOL_TOKEN_NAME,
        NETWORK_TOKEN_POOL_TOKEN_SYMBOL,
        networkToken.address
    );
    const pendingWithdrawals = await createProxy(Contracts.TestPendingWithdrawals, {
        ctorArgs: [network.address]
    });
    const networkTokenPool = await createNetworkTokenPoolUninitialized(
        network,
        pendingWithdrawals,
        vault,
        networkPoolToken,
        networkTokenGovernance,
        govTokenGovernance
    );

    await networkTokenPool.initialize();

    const poolCollection = await createPoolCollection(network, networkTokenPool);

    await network.initialize(pendingWithdrawals.address);

    return {
        networkSettings,
        network,
        networkToken,
        networkTokenGovernance,
        govToken,
        govTokenGovernance,
        networkPoolToken,
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
