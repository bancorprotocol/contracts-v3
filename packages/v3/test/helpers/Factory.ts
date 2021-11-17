import { ContractBuilder, Contract } from '../../components/ContractBuilder';
import Contracts from '../../components/Contracts';
import LegacyContracts from '../../components/LegacyContracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import {
    BancorVault,
    NetworkSettings,
    PoolToken,
    PoolTokenFactory,
    ProxyAdmin,
    TestPoolCollection,
    TestBancorNetwork
} from '../../typechain';
import { roles } from './AccessControl';
import { NATIVE_TOKEN_ADDRESS, MAX_UINT256, DEFAULT_DECIMALS, BNT, vBNT } from './Constants';
import { Fraction } from './Types';
import { toAddress, TokenWithAddress, createTokenBySymbol } from './Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BaseContract, BigNumber, ContractFactory } from 'ethers';
import { ethers, waffle } from 'hardhat';

const {
    TokenGovernance: TokenGovernanceRoles,
    BancorVault: BancorVaultRoles,
    ExternalProtectionVault: ExternalProtectionVaultRoles
} = roles;

const TOTAL_SUPPLY = BigNumber.from(1_000_000_000).mul(BigNumber.from(10).pow(18));
const V1 = 1;

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

let admin: ProxyAdmin;

export const proxyAdmin = async () => {
    if (!admin) {
        admin = await Contracts.ProxyAdmin.deploy();
    }

    return admin;
};

const createLogic = async <F extends ContractFactory>(factory: ContractBuilder<F>, ctorArgs: CtorArgs = []) => {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (factory.deploy as Function)(...(ctorArgs || []));
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

export const createProxy = async <F extends ContractFactory>(
    factory: ContractBuilder<F>,
    args?: ProxyArguments
): Promise<Contract<F>> => {
    const logicContract = await createLogic(factory, args?.ctorArgs);
    const proxy = await createTransparentProxy(logicContract, args?.skipInitialization, args?.initArgs);

    return factory.attach(proxy.address);
};

const getDeployer = async () => (await ethers.getSigners())[0];

const createGovernedToken = async <F extends ContractFactory>(
    legacyFactory: ContractBuilder<F>,
    totalSupply: BigNumber,
    ...args: Parameters<F['deploy']>
) => {
    const deployer = await getDeployer();

    const token = await legacyFactory.deploy(...args);
    await token.issue(deployer.address, totalSupply);

    const tokenGovernance = await LegacyContracts.TokenGovernance.deploy(token.address);
    await tokenGovernance.grantRole(TokenGovernanceRoles.ROLE_GOVERNOR, deployer.address);
    await tokenGovernance.grantRole(TokenGovernanceRoles.ROLE_MINTER, deployer.address);
    await token.transferOwnership(tokenGovernance.address);
    await tokenGovernance.acceptTokenOwnership();

    return { token, tokenGovernance };
};

const createGovernedTokens = async () => {
    const { token: networkToken, tokenGovernance: networkTokenGovernance } = await createGovernedToken(
        LegacyContracts.NetworkToken,
        TOTAL_SUPPLY,
        BNT,
        BNT,
        DEFAULT_DECIMALS
    );
    const { token: govToken, tokenGovernance: govTokenGovernance } = await createGovernedToken(
        LegacyContracts.GovToken,
        TOTAL_SUPPLY,
        vBNT,
        vBNT,
        DEFAULT_DECIMALS
    );

    return { networkToken, networkTokenGovernance, govToken, govTokenGovernance };
};

export const createPoolCollection = async (
    network: string | BaseContract,
    poolTokenFactory: string | BaseContract,
    poolCollectionUpgrader: string | BaseContract,
    version: number = V1
) =>
    Contracts.TestPoolCollection.deploy(
        version,
        toAddress(network),
        toAddress(poolTokenFactory),
        toAddress(poolCollectionUpgrader)
    );

const createNetworkTokenPoolUninitialized = async (
    network: TestBancorNetwork,
    vault: BancorVault,
    networkPoolToken: PoolToken,
    networkTokenGovernance: TokenGovernance,
    govTokenGovernance: TokenGovernance
) => {
    const networkTokenPool = await createProxy(Contracts.TestNetworkTokenPool, {
        skipInitialization: true,
        ctorArgs: [network.address, networkPoolToken.address]
    });

    await networkPoolToken.acceptOwnership();
    await networkPoolToken.transferOwnership(networkTokenPool.address);

    await networkTokenGovernance.grantRole(TokenGovernanceRoles.ROLE_MINTER, networkTokenPool.address);
    await govTokenGovernance.grantRole(TokenGovernanceRoles.ROLE_MINTER, networkTokenPool.address);

    await vault.grantRole(BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, networkTokenPool.address);

    return networkTokenPool;
};

export const createPoolToken = async (poolTokenFactory: PoolTokenFactory, reserveToken: string | BaseContract) => {
    const poolTokenAddress = await poolTokenFactory.callStatic.createPoolToken(toAddress(reserveToken));

    await poolTokenFactory.createPoolToken(toAddress(reserveToken));

    return Contracts.PoolToken.attach(poolTokenAddress);
};

export const createPool = async (
    reserveToken: TokenWithAddress,
    network: TestBancorNetwork,
    networkSettings: NetworkSettings,
    poolCollection: TestPoolCollection
) => {
    await networkSettings.addTokenToWhitelist(reserveToken.address);

    const poolCollections = await network.poolCollections();
    if (!poolCollections.includes(poolCollection.address)) {
        await network.addPoolCollection(poolCollection.address);
    }
    await network.createPool(await poolCollection.poolType(), reserveToken.address);

    const pool = await poolCollection.poolData(reserveToken.address);
    return Contracts.PoolToken.attach(pool.poolToken);
};

const createSystemFixture = async () => {
    const { networkToken, networkTokenGovernance, govToken, govTokenGovernance } = await createGovernedTokens();

    const bancorVault = await createProxy(Contracts.BancorVault, { ctorArgs: [networkToken.address] });

    const networkFeeVault = await createProxy(Contracts.NetworkFeeVault);
    const externalProtectionVault = await createProxy(Contracts.ExternalProtectionVault);
    const externalRewardsVault = await createProxy(Contracts.ExternalRewardsVault);

    const poolTokenFactory = await createProxy(Contracts.PoolTokenFactory);
    const networkPoolToken = await createPoolToken(poolTokenFactory, networkToken);

    const networkSettings = await createProxy(Contracts.NetworkSettings, { ctorArgs: [networkFeeVault.address] });

    const network = await createProxy(Contracts.TestBancorNetwork, {
        skipInitialization: true,
        ctorArgs: [
            networkTokenGovernance.address,
            govTokenGovernance.address,
            networkSettings.address,
            bancorVault.address,
            networkPoolToken.address,
            externalProtectionVault.address
        ]
    });

    const networkTokenPool = await createNetworkTokenPoolUninitialized(
        network,
        bancorVault,
        networkPoolToken,
        networkTokenGovernance,
        govTokenGovernance
    );

    await networkTokenPool.initialize();

    const pendingWithdrawals = await createProxy(Contracts.TestPendingWithdrawals, {
        ctorArgs: [network.address, networkTokenPool.address]
    });

    const poolCollectionUpgrader = await createProxy(Contracts.TestPoolCollectionUpgrader, {
        ctorArgs: [network.address]
    });

    const poolCollection = await createPoolCollection(network, poolTokenFactory, poolCollectionUpgrader);

    await network.initialize(networkTokenPool.address, pendingWithdrawals.address, poolCollectionUpgrader.address);

    await bancorVault.grantRole(BancorVaultRoles.ROLE_ASSET_MANAGER, network.address);
    await externalProtectionVault.grantRole(ExternalProtectionVaultRoles.ROLE_ASSET_MANAGER, network.address);

    return {
        networkSettings,
        network,
        networkToken,
        networkTokenGovernance,
        govToken,
        govTokenGovernance,
        networkPoolToken,
        bancorVault,
        externalProtectionVault,
        externalRewardsVault,
        networkFeeVault,
        networkTokenPool,
        pendingWithdrawals,
        poolTokenFactory,
        poolCollection,
        poolCollectionUpgrader
    };
};

export const createSystem = async () => waffle.loadFixture(createSystemFixture);

export const depositToPool = async (
    provider: SignerWithAddress,
    token: TokenWithAddress,
    amount: BigNumber,
    network: TestBancorNetwork
) => {
    let value = BigNumber.from(0);
    if (token.address === NATIVE_TOKEN_ADDRESS) {
        value = amount;
    } else {
        const reserveToken = await Contracts.TestERC20Token.attach(token.address);
        await reserveToken.transfer(provider.address, amount);
        await reserveToken.connect(provider).approve(network.address, amount);
    }

    await network.connect(provider).deposit(token.address, amount, { value });
};

export interface PoolSpec {
    symbol: string;
    balance: BigNumber;
    initialRate: Fraction<BigNumber>;
    tradingFeePPM?: number;
}

export const setupSimplePool = async (
    spec: PoolSpec,
    provider: SignerWithAddress,
    network: TestBancorNetwork,
    networkSettings: NetworkSettings,
    poolCollection: TestPoolCollection
) => {
    const isNetworkToken = spec.symbol === BNT;

    if (isNetworkToken) {
        const poolToken = await Contracts.PoolToken.attach(await network.networkPoolToken());
        const networkToken = await LegacyContracts.NetworkToken.attach(await network.networkToken());

        return { poolToken, token: networkToken };
    }

    const token = await createTokenBySymbol(spec.symbol);

    const poolToken = await createPool(token, network, networkSettings, poolCollection);

    await networkSettings.setPoolMintingLimit(token.address, MAX_UINT256);
    await poolCollection.setDepositLimit(token.address, MAX_UINT256);
    await poolCollection.setInitialRate(token.address, spec.initialRate);
    await poolCollection.setTradingFeePPM(token.address, spec.tradingFeePPM ?? BigNumber.from(0));

    await depositToPool(provider, token, spec.balance, network);

    return { poolToken, token };
};
