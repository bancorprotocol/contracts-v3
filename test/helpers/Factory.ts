import { ContractBuilder, Contract } from '../../components/ContractBuilder';
import Contracts, {
    BancorNetwork,
    BancorNetworkInfo,
    ExternalProtectionVault,
    ExternalRewardsVault,
    IERC20,
    MasterPool,
    MasterVault,
    NetworkSettings,
    PoolCollectionUpgrader,
    PoolToken,
    PoolTokenFactory,
    ProxyAdmin,
    TestBancorNetwork,
    TestERC20Burnable,
    TestERC20Token,
    TestMasterPool,
    TestPendingWithdrawals,
    TestPoolCollection
} from '../../components/Contracts';
import LegacyContracts, { TokenGovernance, BNT__factory, VBNT__factory } from '../../components/LegacyContracts';
import { isProfiling } from '../../components/Profiler';
import { MAX_UINT256 } from '../../utils/Constants';
import { Roles } from '../../utils/Roles';
import { NATIVE_TOKEN_ADDRESS, TokenData, TokenSymbol } from '../../utils/TokenData';
import { fromPPM, toWei, Addressable } from '../../utils/Types';
import { toAddress } from './Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BaseContract, BigNumber, ContractFactory, BigNumberish, Wallet, utils } from 'ethers';
import { ethers, waffle } from 'hardhat';

const { formatBytes32String } = utils;

const TOTAL_SUPPLY = toWei(1_000_000_000);
const V1 = 1;

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
    return (factory.deploy as Function)(...(ctorArgs || []));
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

export const createProxy = async <F extends ContractFactory>(
    factory: ContractBuilder<F>,
    args?: ProxyArguments
): Promise<Contract<F>> => {
    const logicContract = await createLogic(factory, args?.ctorArgs);
    const proxy = await createTransparentProxy(logicContract, args?.skipInitialization, args?.initArgs);

    return factory.attach(proxy.address);
};

const getDeployer = async () => (await ethers.getSigners())[0];

export const createStakingRewards = async (
    network: TestBancorNetwork | BancorNetwork,
    networkSettings: NetworkSettings,
    bnt: IERC20,
    masterPool: TestMasterPool | MasterPool,
    externalRewardsVault: ExternalRewardsVault
) => {
    const autoCompoundingStakingRewards = await createProxy(Contracts.TestAutoCompoundingStakingRewards, {
        ctorArgs: [network.address, networkSettings.address, bnt.address, masterPool.address]
    });

    await masterPool.grantRole(Roles.MasterPool.ROLE_MASTER_POOL_TOKEN_MANAGER, autoCompoundingStakingRewards.address);

    await externalRewardsVault.grantRole(Roles.Vault.ROLE_ASSET_MANAGER, autoCompoundingStakingRewards.address);

    return autoCompoundingStakingRewards;
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
        legacyToken.issue(deployer.address, totalSupply);

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
    masterPool: string | MasterPool,
    externalProtectionVault: string | ExternalProtectionVault,
    poolTokenFactory: string | PoolTokenFactory,
    poolCollectionUpgrader: string | PoolCollectionUpgrader,
    version: number = V1
) =>
    Contracts.TestPoolCollection.deploy(
        version,
        toAddress(network),
        toAddress(bnt),
        toAddress(networkSettings),
        toAddress(masterVault),
        toAddress(masterPool),
        toAddress(externalProtectionVault),
        toAddress(poolTokenFactory),
        toAddress(poolCollectionUpgrader)
    );

const createMasterPool = async (
    network: TestBancorNetwork,
    networkSettings: NetworkSettings,
    bntGovernance: TokenGovernance,
    vbntGovernance: TokenGovernance,
    masterVault: MasterVault,
    masterPoolToken: PoolToken
) => {
    const masterPool = await createProxy(Contracts.TestMasterPool, {
        skipInitialization: true,
        ctorArgs: [
            network.address,
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            masterVault.address,
            masterPoolToken.address
        ]
    });

    await masterPoolToken.transferOwnership(masterPool.address);

    await masterPool.initialize();

    await masterPool.grantRole(Roles.Upgradeable.ROLE_ADMIN, network.address);

    await bntGovernance.grantRole(Roles.TokenGovernance.ROLE_MINTER, masterPool.address);
    await vbntGovernance.grantRole(Roles.TokenGovernance.ROLE_MINTER, masterPool.address);
    await masterVault.grantRole(Roles.MasterVault.ROLE_BNT_MANAGER, masterPool.address);

    return masterPool;
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

const createNetwork = async (
    bntGovernance: TokenGovernance,
    vbntGovernance: TokenGovernance,
    networkSettings: NetworkSettings,
    masterVault: MasterVault,
    externalProtectionVault: ExternalProtectionVault,
    masterPoolToken: PoolToken
) => {
    const network = await createProxy(Contracts.TestBancorNetwork, {
        skipInitialization: true,
        ctorArgs: [
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            masterVault.address,
            externalProtectionVault.address,
            masterPoolToken.address
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
    const masterPoolToken = await createPoolToken(poolTokenFactory, bnt);

    const networkSettings = await createProxy(Contracts.NetworkSettings);

    const network = await createNetwork(
        bntGovernance,
        vbntGovernance,
        networkSettings,
        masterVault,
        externalProtectionVault,
        masterPoolToken
    );

    const masterPool = await createMasterPool(
        network,
        networkSettings,
        bntGovernance,
        vbntGovernance,
        masterVault,
        masterPoolToken
    );

    const pendingWithdrawals = await createProxy(Contracts.TestPendingWithdrawals, {
        ctorArgs: [network.address, bnt.address, masterPool.address]
    });

    const poolCollectionUpgrader = await createProxy(Contracts.TestPoolCollectionUpgrader, {
        ctorArgs: [network.address]
    });

    await network.initialize(masterPool.address, pendingWithdrawals.address, poolCollectionUpgrader.address);

    const networkInfo = await createProxy(Contracts.BancorNetworkInfo, {
        ctorArgs: [
            network.address,
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            masterVault.address,
            externalProtectionVault.address,
            externalRewardsVault.address,
            masterPool.address,
            pendingWithdrawals.address,
            poolCollectionUpgrader.address
        ]
    });

    const poolCollection = await createPoolCollection(
        network,
        bnt,
        networkSettings,
        masterVault,
        masterPool,
        externalProtectionVault,
        poolTokenFactory,
        poolCollectionUpgrader
    );

    return {
        networkSettings,
        networkInfo,
        network,
        bnt,
        bntGovernance,
        vbnt,
        vbntGovernance,
        masterPoolToken,
        masterVault,
        externalProtectionVault,
        externalRewardsVault,
        masterPool,
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
    balance: BigNumberish;
    requestedLiquidity: BigNumberish;
    bntRate: BigNumberish;
    baseTokenRate: BigNumberish;
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
    if (spec.tokenData.isBNT()) {
        const poolToken = await Contracts.PoolToken.attach(await networkInfo.masterPoolToken());
        const factory = isProfiling ? Contracts.TestGovernedToken : LegacyContracts.BNT;
        const bnt = await factory.attach(await networkInfo.bnt());

        // ensure that there is enough space to deposit BNT
        const reserveToken = await createTestToken();
        await createPool(reserveToken, network, networkSettings, poolCollection);

        await networkSettings.setFundingLimit(reserveToken.address, MAX_UINT256);
        await poolCollection.requestFundingT(formatBytes32String(''), reserveToken.address, spec.requestedLiquidity);

        await depositToPool(provider, bnt, spec.balance, network);

        return { poolToken, token: bnt };
    }

    const token = await createToken(spec.tokenData);
    const poolToken = await createPool(token, network, networkSettings, poolCollection);

    await networkSettings.setFundingLimit(token.address, MAX_UINT256);
    await poolCollection.setDepositLimit(token.address, MAX_UINT256);
    await poolCollection.setTradingFeePPM(token.address, spec.tradingFeePPM ?? 0);

    await depositToPool(provider, token, spec.balance, network);

    if (enableTrading) {
        await poolCollection.enableTrading(token.address, spec.bntRate, spec.baseTokenRate);
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
