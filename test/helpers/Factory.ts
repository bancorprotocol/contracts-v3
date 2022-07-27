import { ContractBuilder } from '../../components/ContractBuilder';
import Contracts, {
    BancorNetwork,
    BancorNetworkInfo,
    BNTPool,
    ExternalProtectionVault,
    ExternalRewardsVault,
    IERC20,
    IPoolCollection,
    MasterVault,
    NetworkSettings,
    PoolMigrator,
    PoolToken,
    PoolTokenFactory,
    ProxyAdmin,
    TestBancorNetwork,
    TestBNTPool,
    TestERC20Burnable,
    TestERC20Token,
    TestPendingWithdrawals,
    TestPoolCollection
} from '../../components/Contracts';
import LegacyContracts, { BNT__factory, TokenGovernance, VBNT__factory } from '../../components/LegacyContracts';
import { isProfiling } from '../../components/Profiler';
import { MAX_UINT256, PoolType } from '../../utils/Constants';
import { Roles } from '../../utils/Roles';
import { NATIVE_TOKEN_ADDRESS, TokenData, TokenSymbol } from '../../utils/TokenData';
import { Addressable, fromPPM, toWei } from '../../utils/Types';
import { toAddress } from './Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BaseContract, BigNumber, BigNumberish, BytesLike, ContractFactory, utils, Wallet } from 'ethers';
import { ethers, waffle } from 'hardhat';

const { formatBytes32String } = utils;

const TOTAL_SUPPLY = toWei(1_000_000_000);
const POOL_COLLECTION_CURRENT_VERSION = 10;

type CtorArgs = Parameters<any>;
type InitArgs = Parameters<any>;

interface ProxyArguments {
    skipInitialization?: boolean;
    initArgs?: InitArgs;
    ctorArgs?: CtorArgs;
}

let admin: ProxyAdmin;

export type TokenWithAddress = TestERC20Token | Addressable;

export const proxyAdmin = async () => {
    if (!admin) {
        admin = await Contracts.ProxyAdmin.deploy();
    }

    return admin;
};

const createLogic = async <F extends ContractFactory>(factory: ContractBuilder<F>, ctorArgs: CtorArgs = []) => {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (factory.deploy as Function)(...(ctorArgs ?? []));
};

const createTransparentProxy = async (
    logicContract: BaseContract,
    skipInitialization = false,
    initArgs: InitArgs = []
) => {
    const admin = await proxyAdmin();
    const data = skipInitialization ? [] : logicContract.interface.encodeFunctionData('initialize', initArgs);
    return Contracts.TransparentUpgradeableProxyImmutable.deploy(logicContract.address, admin.address, data);
};

export const createProxy = async <F extends ContractFactory>(factory: ContractBuilder<F>, args?: ProxyArguments) => {
    const logicContract = await createLogic(factory, args?.ctorArgs);
    const proxy = await createTransparentProxy(logicContract, args?.skipInitialization, args?.initArgs);

    return factory.attach(proxy.address);
};

interface ProxyUpgradeArgs extends ProxyArguments {
    upgradeCallData?: BytesLike;
}

export const upgradeProxy = async <F extends ContractFactory>(
    proxy: BaseContract,
    factory: ContractBuilder<F>,
    args?: ProxyUpgradeArgs
) => {
    const logicContract = await createLogic(factory, args?.ctorArgs);
    const admin = await proxyAdmin();

    await admin.upgradeAndCall(
        proxy.address,
        logicContract.address,
        logicContract.interface.encodeFunctionData('postUpgrade', [args?.upgradeCallData ?? []])
    );

    return factory.attach(proxy.address);
};

const getDeployer = async () => (await ethers.getSigners())[0];

export const createAutoCompoundingRewards = async (
    network: TestBancorNetwork | BancorNetwork,
    networkSettings: NetworkSettings,
    bnt: IERC20,
    bntPool: TestBNTPool | BNTPool,
    externalRewardsVault: ExternalRewardsVault
) => {
    const rewards = await createProxy(Contracts.TestAutoCompoundingRewards, {
        ctorArgs: [network.address, networkSettings.address, bnt.address, bntPool.address, externalRewardsVault.address]
    });

    await bntPool.grantRole(Roles.BNTPool.ROLE_BNT_POOL_TOKEN_MANAGER, rewards.address);

    await externalRewardsVault.grantRole(Roles.Vault.ROLE_ASSET_MANAGER, rewards.address);

    return rewards;
};

export const createStandardRewards = async (
    network: TestBancorNetwork | BancorNetwork,
    networkSettings: NetworkSettings,
    bntGovernance: TokenGovernance,
    vbnt: IERC20,
    bntPool: TestBNTPool | BNTPool
) => {
    const rewards = await createProxy(Contracts.TestStandardRewards, {
        ctorArgs: [network.address, networkSettings.address, bntGovernance.address, vbnt.address, bntPool.address]
    });

    await bntGovernance.grantRole(Roles.TokenGovernance.ROLE_MINTER, rewards.address);

    return rewards;
};

const createGovernedToken = async (
    // eslint-disable-next-line camelcase
    legacyFactory: ContractBuilder<BNT__factory | VBNT__factory>,
    name: string,
    symbol: string,
    decimals: number,
    totalSupply: BigNumber
) => {
    const deployer = await getDeployer();

    let token: IERC20;
    let tokenGovernance: TokenGovernance;

    if (isProfiling) {
        const testToken = await Contracts.TestGovernedToken.deploy(name, symbol, totalSupply);
        await testToken.updateDecimals(decimals);

        tokenGovernance = (await Contracts.TestTokenGovernance.deploy(testToken.address)) as TokenGovernance;
        await tokenGovernance.grantRole(Roles.TokenGovernance.ROLE_GOVERNOR, deployer.address);
        await tokenGovernance.grantRole(Roles.TokenGovernance.ROLE_MINTER, deployer.address);

        token = testToken;
    } else {
        const legacyToken = await legacyFactory.deploy(name, symbol, decimals);
        await legacyToken.issue(deployer.address, totalSupply);

        tokenGovernance = await LegacyContracts.TokenGovernance.deploy(legacyToken.address);
        await tokenGovernance.grantRole(Roles.TokenGovernance.ROLE_GOVERNOR, deployer.address);
        await tokenGovernance.grantRole(Roles.TokenGovernance.ROLE_MINTER, deployer.address);
        await legacyToken.transferOwnership(tokenGovernance.address);
        await tokenGovernance.acceptTokenOwnership();

        token = legacyToken as any as IERC20;
    }

    return { token, tokenGovernance };
};

const createGovernedTokens = async () => {
    const bntData = new TokenData(TokenSymbol.BNT);
    const { token: bnt, tokenGovernance: bntGovernance } = await createGovernedToken(
        LegacyContracts.BNT,
        bntData.name(),
        bntData.symbol(),
        bntData.decimals(),
        TOTAL_SUPPLY
    );

    const vbntData = new TokenData(TokenSymbol.BNT);
    const { token: vbnt, tokenGovernance: vbntGovernance } = await createGovernedToken(
        LegacyContracts.VBNT,
        vbntData.name(),
        vbntData.symbol(),
        vbntData.decimals(),
        TOTAL_SUPPLY
    );

    return { bnt, bntGovernance, vbnt, vbntGovernance };
};

export const createPoolCollection = async (
    network: string | BancorNetwork,
    bnt: string | IERC20,
    networkSettings: string | NetworkSettings,
    masterVault: string | MasterVault,
    bntPool: string | BNTPool,
    externalProtectionVault: string | ExternalProtectionVault,
    poolTokenFactory: string | PoolTokenFactory,
    poolMigrator: string | PoolMigrator,
    type: number = PoolType.Standard,
    version: number = POOL_COLLECTION_CURRENT_VERSION
) =>
    Contracts.TestPoolCollection.deploy(
        type,
        BigNumber.from(version),
        toAddress(network),
        toAddress(bnt),
        toAddress(networkSettings),
        toAddress(masterVault),
        toAddress(bntPool),
        toAddress(externalProtectionVault),
        toAddress(poolTokenFactory),
        toAddress(poolMigrator)
    );

const createBNTPool = async (
    network: TestBancorNetwork,
    networkSettings: NetworkSettings,
    bntGovernance: TokenGovernance,
    vbntGovernance: TokenGovernance,
    masterVault: MasterVault,
    bntPoolToken: PoolToken
) => {
    const bntPool = await createProxy(Contracts.TestBNTPool, {
        skipInitialization: true,
        ctorArgs: [
            network.address,
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            masterVault.address,
            bntPoolToken.address
        ]
    });

    await bntPoolToken.transferOwnership(bntPool.address);

    await bntPool.initialize();

    await bntPool.grantRole(Roles.Upgradeable.ROLE_ADMIN, network.address);

    await bntGovernance.grantRole(Roles.TokenGovernance.ROLE_MINTER, bntPool.address);
    await vbntGovernance.grantRole(Roles.TokenGovernance.ROLE_MINTER, bntPool.address);
    await masterVault.grantRole(Roles.MasterVault.ROLE_BNT_MANAGER, bntPool.address);

    return bntPool;
};

export const createPoolToken = async (poolTokenFactory: PoolTokenFactory, reserveToken: string | BaseContract) => {
    const poolTokenAddress = await poolTokenFactory.callStatic.createPoolToken(toAddress(reserveToken));

    await poolTokenFactory.createPoolToken(toAddress(reserveToken));

    const poolToken = await Contracts.PoolToken.attach(poolTokenAddress);

    await poolToken.acceptOwnership();

    return poolToken;
};

export const createPool = async (
    reserveToken: TokenWithAddress,
    network: TestBancorNetwork,
    networkSettings: NetworkSettings,
    poolCollection: IPoolCollection
) => {
    await networkSettings.addTokenToWhitelist(reserveToken.address);

    const poolCollections = await network.poolCollections();
    if (!poolCollections.includes(poolCollection.address)) {
        await network.registerPoolCollection(poolCollection.address);
    }
    await network.createPools([reserveToken.address], poolCollection.address);

    const poolToken = await poolCollection.poolToken(reserveToken.address);
    return Contracts.PoolToken.attach(poolToken);
};

const createNetwork = async (
    bntGovernance: TokenGovernance,
    vbntGovernance: TokenGovernance,
    networkSettings: NetworkSettings,
    masterVault: MasterVault,
    externalProtectionVault: ExternalProtectionVault,
    bntPoolToken: PoolToken
) => {
    const network = await createProxy(Contracts.TestBancorNetwork, {
        skipInitialization: true,
        ctorArgs: [
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            masterVault.address,
            externalProtectionVault.address,
            bntPoolToken.address
        ]
    });

    await masterVault.grantRole(Roles.Upgradeable.ROLE_ADMIN, network.address);
    await masterVault.grantRole(Roles.Vault.ROLE_ASSET_MANAGER, network.address);

    await externalProtectionVault.grantRole(Roles.Upgradeable.ROLE_ADMIN, network.address);
    await externalProtectionVault.grantRole(Roles.Vault.ROLE_ASSET_MANAGER, network.address);

    return network;
};

const createSystemFixture = async () => {
    const { bnt, bntGovernance, vbnt, vbntGovernance } = await createGovernedTokens();

    const masterVault = await createProxy(Contracts.MasterVault, {
        ctorArgs: [bntGovernance.address, vbntGovernance.address]
    });

    const externalProtectionVault = await createProxy(Contracts.ExternalProtectionVault, {
        ctorArgs: [bntGovernance.address, vbntGovernance.address]
    });

    const externalRewardsVault = await createProxy(Contracts.ExternalRewardsVault, {
        ctorArgs: [bntGovernance.address, vbntGovernance.address]
    });

    const poolTokenFactory = await createProxy(Contracts.PoolTokenFactory);
    const bntPoolToken = await createPoolToken(poolTokenFactory, bnt);

    const networkSettings = await createProxy(Contracts.NetworkSettings, { ctorArgs: [bnt.address] });

    const network = await createNetwork(
        bntGovernance,
        vbntGovernance,
        networkSettings,
        masterVault,
        externalProtectionVault,
        bntPoolToken
    );

    const bntPool = await createBNTPool(
        network,
        networkSettings,
        bntGovernance,
        vbntGovernance,
        masterVault,
        bntPoolToken
    );

    const pendingWithdrawals = await createProxy(Contracts.TestPendingWithdrawals, {
        ctorArgs: [network.address, bnt.address, bntPool.address]
    });

    const poolMigrator = await createProxy(Contracts.TestPoolMigrator, {
        ctorArgs: [network.address]
    });

    await network.initialize(bntPool.address, pendingWithdrawals.address, poolMigrator.address);

    const networkInfo = await createProxy(Contracts.BancorNetworkInfo, {
        ctorArgs: [
            network.address,
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            masterVault.address,
            externalProtectionVault.address,
            externalRewardsVault.address,
            bntPool.address,
            pendingWithdrawals.address,
            poolMigrator.address
        ]
    });

    const poolCollection = await createPoolCollection(
        network,
        bnt,
        networkSettings,
        masterVault,
        bntPool,
        externalProtectionVault,
        poolTokenFactory,
        poolMigrator
    );

    return {
        networkSettings,
        networkInfo,
        network,
        bnt,
        bntGovernance,
        vbnt,
        vbntGovernance,
        bntPoolToken,
        masterVault,
        externalProtectionVault,
        externalRewardsVault,
        bntPool,
        pendingWithdrawals,
        poolTokenFactory,
        poolCollection,
        poolMigrator
    };
};

export const createSystem = async () => waffle.loadFixture(createSystemFixture);

export const depositToPool = async (
    provider: SignerWithAddress | Wallet,
    token: TokenWithAddress,
    amount: BigNumberish,
    network: TestBancorNetwork
) => {
    let value = BigNumber.from(0);
    if (token.address === NATIVE_TOKEN_ADDRESS) {
        value = BigNumber.from(amount);
    } else {
        const reserveToken = await Contracts.TestERC20Token.attach(token.address);
        await reserveToken.transfer(provider.address, amount);
        await reserveToken.connect(provider).approve(network.address, amount);
    }

    await network.connect(provider).deposit(token.address, amount, { value });
};

export interface PoolSpec {
    tokenData: TokenData;
    token?: TokenWithAddress;
    balance: BigNumberish;
    requestedFunding?: BigNumberish;
    bntVirtualBalance: BigNumberish;
    baseTokenVirtualBalance: BigNumberish;
    tradingFeePPM?: number;
}

export const specToString = (spec: PoolSpec) =>
    `${spec.tokenData.symbol()} (balance=${spec.balance}, trading fee=${fromPPM(spec.tradingFeePPM)}%)`;

const setupPool = async (
    spec: PoolSpec,
    provider: SignerWithAddress,
    network: TestBancorNetwork,
    networkInfo: BancorNetworkInfo,
    networkSettings: NetworkSettings,
    poolCollection: TestPoolCollection,
    enableTrading: boolean
) => {
    const factory = isProfiling ? Contracts.TestGovernedToken : LegacyContracts.BNT;
    const bnt = await factory.attach(await networkInfo.bnt());

    if (spec.token?.address === bnt.address || spec.tokenData.isBNT()) {
        const poolToken = await Contracts.PoolToken.attach(await networkInfo.poolToken(bnt.address));

        // ensure that there is enough space to deposit BNT
        const reserveToken = await createTestToken();
        await createPool(reserveToken, network, networkSettings, poolCollection);

        await networkSettings.setFundingLimit(reserveToken.address, MAX_UINT256);
        if (spec.requestedFunding) {
            await poolCollection.requestFundingT(formatBytes32String(''), reserveToken.address, spec.requestedFunding);
        }

        await depositToPool(provider, bnt, spec.balance, network);

        return { poolToken, token: bnt };
    }

    const token = spec.token ?? (await createToken(spec.tokenData));
    const poolToken = await createPool(token, network, networkSettings, poolCollection);

    await networkSettings.setFundingLimit(token.address, MAX_UINT256);
    await poolCollection.setTradingFeePPM(token.address, spec.tradingFeePPM ?? 0);

    await depositToPool(provider, token, spec.balance, network);

    if (enableTrading) {
        await poolCollection.enableTrading(token.address, spec.bntVirtualBalance, spec.baseTokenVirtualBalance);
    }

    return { poolToken, token };
};

export const setupFundedPool = async (
    spec: PoolSpec,
    provider: SignerWithAddress,
    network: TestBancorNetwork,
    networkInfo: BancorNetworkInfo,
    networkSettings: NetworkSettings,
    poolCollection: TestPoolCollection
) => setupPool(spec, provider, network, networkInfo, networkSettings, poolCollection, true);

export const initWithdraw = async (
    provider: SignerWithAddress | Wallet,
    network: TestBancorNetwork,
    pendingWithdrawals: TestPendingWithdrawals,
    poolToken: PoolToken,
    amount: BigNumber
) => {
    await poolToken.connect(provider).approve(network.address, amount);
    await network.connect(provider).initWithdrawal(poolToken.address, amount);

    const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
    const id = withdrawalRequestIds[withdrawalRequestIds.length - 1];
    const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);
    const creationTime = withdrawalRequest.createdAt;

    return { id, creationTime };
};

export const createToken = async (
    tokenData: TokenData,
    totalSupply: BigNumberish = toWei(1_000_000_000_000),
    burnable = false
): Promise<TokenWithAddress> => {
    const symbol = tokenData.symbol();

    switch (symbol) {
        case TokenSymbol.ETH:
            return { address: NATIVE_TOKEN_ADDRESS };

        case TokenSymbol.TKN:
        case TokenSymbol.TKN1:
        case TokenSymbol.TKN2: {
            const token = await (burnable ? Contracts.TestERC20Burnable : Contracts.TestERC20Token).deploy(
                tokenData.name(),
                tokenData.symbol(),
                totalSupply
            );

            if (!tokenData.isDefaultDecimals()) {
                await token.updateDecimals(tokenData.decimals());
            }

            return token;
        }

        default:
            throw new Error(`Unsupported type ${symbol}`);
    }
};

export const createBurnableToken = async (tokenData: TokenData, totalSupply: BigNumberish = toWei(1_000_000_000)) =>
    createToken(tokenData, totalSupply, true) as Promise<TestERC20Burnable>;

export const createTestToken = async (totalSupply: BigNumberish = toWei(1_000_000_000)) =>
    createToken(new TokenData(TokenSymbol.TKN), totalSupply) as Promise<TestERC20Burnable>;
