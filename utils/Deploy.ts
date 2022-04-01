import {
    AutoCompoundingStakingRewards,
    BancorNetwork,
    BancorNetworkInfo,
    BancorPortal,
    BancorV1Migration,
    BNTPool,
    ExternalProtectionVault,
    ExternalRewardsVault,
    IVersioned,
    MasterVault,
    MockUniswapV2Factory,
    MockUniswapV2Pair,
    MockUniswapV2Router02,
    NetworkSettings,
    PendingWithdrawals,
    PoolCollection,
    PoolMigrator,
    PoolToken,
    PoolTokenFactory,
    ProxyAdmin,
    StandardStakingRewards,
    TestERC20Token,
    TransparentUpgradeableProxyImmutable
} from '../components/Contracts';
import { BancorNetworkV1, BNT, NetworkSettingsV1, TokenGovernance, VBNT } from '../components/LegacyContracts';
import { ExternalContracts } from '../deployments/data';
import { DeploymentNetwork, ZERO_BYTES } from './Constants';
import { RoleIds } from './Roles';
import { toWei } from './Types';
import { BigNumber, Contract } from 'ethers';
import fs from 'fs';
import { config, deployments, ethers, getNamedAccounts, tenderly } from 'hardhat';
import { ABI, Address, ProxyOptions as DeployProxyOptions } from 'hardhat-deploy/types';
import { capitalize } from 'lodash';
import path from 'path';

const {
    deploy: deployContract,
    execute: executeTransaction,
    getNetworkName,
    save: saveContract,
    getExtendedArtifact
} = deployments;

interface EnvOptions {
    FORKING?: boolean;
    TENDERLY_FORK_ID?: string;
}

const { FORKING: isForking, TENDERLY_FORK_ID }: EnvOptions = process.env as any as EnvOptions;

const deployed = <F extends Contract>(name: ContractName) => ({
    deployed: async () => ethers.getContract<F>(name)
});

enum LegacyContractName {
    BNT = 'BNT',
    BNTGovernance = 'BNTGovernance',
    VBNT = 'VBNT',
    VBNTGovernance = 'VBNTGovernance'
}

enum NewContractName {
    AutoCompoundingStakingRewards = 'AutoCompoundingStakingRewards',
    BancorNetworkInfo = 'BancorNetworkInfo',
    BancorNetworkProxy = 'BancorNetworkProxy',
    BancorNetwork = 'BancorNetwork',
    BancorPortal = 'BancorPortal',
    BancorV1Migration = 'BancorV1Migration',
    BNTPoolToken = 'BNTPoolToken',
    BNTPool = 'BNTPool',
    ExternalProtectionVault = 'ExternalProtectionVault',
    ExternalRewardsVault = 'ExternalRewardsVault',
    MasterVault = 'MasterVault',
    NetworkSettings = 'NetworkSettings',
    PendingWithdrawals = 'PendingWithdrawals',
    PoolCollectionType1V1 = 'PoolCollectionType1V1',
    PoolMigrator = 'PoolMigrator',
    PoolTokenFactory = 'PoolTokenFactory',
    ProxyAdmin = 'ProxyAdmin',
    StandardStakingRewards = 'StandardStakingRewards'
}

enum TestContractName {
    MockUniswapV2Factory = 'MockUniswapV2Factory',
    MockUniswapV2Pair = 'MockUniswapV2Pair',
    MockUniswapV2Router02 = 'MockUniswapV2Router02',
    TestToken1 = 'TestToken1',
    TestToken2 = 'TestToken2',
    TestToken3 = 'TestToken3',
    TestToken4 = 'TestToken4',
    TestToken5 = 'TestToken5'
}

export const ContractName = {
    ...LegacyContractName,
    ...NewContractName,
    ...TestContractName
};

export type ContractName = LegacyContractName | NewContractName | TestContractName;

enum LegacyDeploymentTag {
    V2 = 'V2'
}

enum NewDeploymentTag {
    AutoCompoundingStakingRewardsV1 = 'AutoCompoundingStakingRewardsV1',
    BancorNetworkInfoV1 = 'BancorNetworkInfoV1',
    BancorNetworkProxy = 'BancorNetworkProxy',
    BancorNetworkV1 = 'BancorNetworkV1',
    BancorPortalV1 = 'BancorPortalV1',
    BancorV1MigrationV1 = 'BancorV1MigrationV1',
    BNTPoolTokenV1 = 'BNTPoolTokenV1',
    BNTPoolV1 = 'BNTPoolV1',
    ExternalProtectionVaultV1 = 'ExternalProtectionVaultV1',
    ExternalRewardsVaultV1 = 'ExternalRewardsVaultV1',
    MasterVaultV1 = 'MasterVaultV1',
    NetworkSettingsV1 = 'NetworkSettingsV1',
    PendingWithdrawalsV1 = 'PendingWithdrawalsV1',
    PoolCollectionType1V1 = 'PoolCollectionType1V1',
    PoolMigratorV1 = 'PoolMigratorV1',
    PoolTokenFactoryV1 = 'PoolTokenFactoryV1',
    StandardStakingRewardsV1 = 'StandardStakingRewardsV1',
    ProxyAdmin = 'ProxyAdmin',

    V3 = 'V3',

    BancorNetworkV2 = 'BancorNetworkV2',
    NetworkSettingsV2 = 'NetworkSettingsV2'
}

export const DeploymentTag = {
    ...LegacyContractName,
    ...LegacyDeploymentTag,
    ...NewDeploymentTag,
    ...TestContractName
};

export type DeploymentTag = LegacyContractName | LegacyDeploymentTag | NewDeploymentTag | TestContractName;

const DeployedLegacyContracts = {
    BNT: deployed<BNT>(ContractName.BNT),
    BNTGovernance: deployed<TokenGovernance>(ContractName.BNTGovernance),
    VBNT: deployed<VBNT>(ContractName.VBNT),
    VBNTGovernance: deployed<TokenGovernance>(ContractName.VBNTGovernance),

    BancorNetworkV1: deployed<BancorNetworkV1>(ContractName.BancorNetwork),
    NetworkSettingsV1: deployed<NetworkSettingsV1>(ContractName.NetworkSettings)
};

const DeployedNewContracts = {
    AutoCompoundingStakingRewards: deployed<AutoCompoundingStakingRewards>(ContractName.AutoCompoundingStakingRewards),
    BancorNetworkInfo: deployed<BancorNetworkInfo>(ContractName.BancorNetworkInfo),
    BancorNetworkProxy: deployed<TransparentUpgradeableProxyImmutable>(ContractName.BancorNetworkProxy),
    BancorNetwork: deployed<BancorNetwork>(ContractName.BancorNetwork),
    BancorPortal: deployed<BancorPortal>(ContractName.BancorPortal),
    BancorV1Migration: deployed<BancorV1Migration>(ContractName.BancorV1Migration),
    BNTPoolToken: deployed<PoolToken>(ContractName.BNTPoolToken),
    BNTPool: deployed<BNTPool>(ContractName.BNTPool),
    ExternalProtectionVault: deployed<ExternalProtectionVault>(ContractName.ExternalProtectionVault),
    ExternalRewardsVault: deployed<ExternalRewardsVault>(ContractName.ExternalRewardsVault),
    MasterVault: deployed<MasterVault>(ContractName.MasterVault),
    NetworkSettings: deployed<NetworkSettings>(ContractName.NetworkSettings),
    PendingWithdrawals: deployed<PendingWithdrawals>(ContractName.PendingWithdrawals),
    PoolCollectionType1V1: deployed<PoolCollection>(ContractName.PoolCollectionType1V1),
    PoolMigrator: deployed<PoolMigrator>(ContractName.PoolMigrator),
    PoolTokenFactory: deployed<PoolTokenFactory>(ContractName.PoolTokenFactory),
    ProxyAdmin: deployed<ProxyAdmin>(ContractName.ProxyAdmin),
    StandardStakingRewards: deployed<StandardStakingRewards>(ContractName.StandardStakingRewards)
};

const DeployedTestContracts = {
    MockUniswapV2Factory: deployed<MockUniswapV2Factory>(ContractName.MockUniswapV2Factory),
    MockUniswapV2Pair: deployed<MockUniswapV2Pair>(ContractName.MockUniswapV2Pair),
    MockUniswapV2Router02: deployed<MockUniswapV2Router02>(ContractName.MockUniswapV2Router02),
    TestToken1: deployed<TestERC20Token>(ContractName.TestToken1),
    TestToken2: deployed<TestERC20Token>(ContractName.TestToken2),
    TestToken3: deployed<TestERC20Token>(ContractName.TestToken3),
    TestToken4: deployed<TestERC20Token>(ContractName.TestToken4),
    TestToken5: deployed<TestERC20Token>(ContractName.TestToken5)
};

export const DeployedContracts = {
    ...DeployedLegacyContracts,
    ...DeployedNewContracts,
    ...DeployedTestContracts
};

export const isHardhat = () => getNetworkName() === DeploymentNetwork.Hardhat;
export const isHardhatMainnetFork = () => isHardhat() && isForking!;
export const isTenderlyFork = () => getNetworkName() === DeploymentNetwork.Tenderly;
export const isMainnetFork = () => isHardhatMainnetFork() || isTenderlyFork();
export const isMainnet = () => getNetworkName() === DeploymentNetwork.Mainnet || isMainnetFork();
export const isLive = () => isMainnet() && !isMainnetFork();

const TEST_MINIMUM_BALANCE = toWei(10);
const TEST_FUNDING = toWei(10);

export const fundAccount = async (account: string) => {
    if (!isMainnetFork()) {
        return;
    }

    const balance = await ethers.provider.getBalance(account);
    if (balance.gte(TEST_MINIMUM_BALANCE)) {
        return;
    }

    const { ethWhale } = await getNamedAccounts();
    const whale = await ethers.getSigner(ethWhale);

    return whale.sendTransaction({
        value: TEST_FUNDING,
        to: account
    });
};

interface SaveTypeOptions {
    name: ContractName;
    contract: string;
}

const saveTypes = async (options: SaveTypeOptions) => {
    const { name, contract } = options;

    const srcDir = path.join(path.resolve('./', config.typechain.outDir));
    const factoriesSrcDir = path.join(srcDir, 'factories');
    const destDir = path.join(config.paths.deployments, getNetworkName(), 'types');
    const factoriesDestDir = path.join(destDir, 'factories');

    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir);
    }

    if (!fs.existsSync(factoriesDestDir)) {
        fs.mkdirSync(factoriesDestDir);
    }

    // save the factory typechain
    fs.copyFileSync(
        path.join(factoriesSrcDir, `${contract}__factory.ts`),
        path.join(factoriesDestDir, `${name}__factory.ts`)
    );

    // save the typechain of the contract itself
    fs.copyFileSync(path.join(srcDir, `${contract}.ts`), path.join(destDir, `${name}.ts`));
};

interface ProxyOptions {
    skipInitialization?: boolean;
}

interface ArtifactData {
    contractName: string;
    abi: ABI;
    bytecode: string;
}

interface ContractArtifactData {
    metadata: ArtifactData;
}

interface BaseDeployOptions {
    name: ContractName;
    contract?: string;
    args?: any[];
    from: string;
    value?: BigNumber;
    contractArtifactData?: ContractArtifactData;
    legacy?: boolean;
}

interface DeployOptions extends BaseDeployOptions {
    proxy?: ProxyOptions;
}

const PROXY_CONTRACT = 'TransparentUpgradeableProxyImmutable';
const INITIALIZE = 'initialize';
const POST_UPGRADE = 'postUpgrade';

export const deploy = async (options: DeployOptions) => {
    const { name, contract, from, value, args, contractArtifactData, proxy } = options;
    const isProxy = !!proxy;
    const contractName = contract || name;

    await fundAccount(from);

    let proxyOptions: DeployProxyOptions = {};

    if (isProxy) {
        const proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();

        proxyOptions = {
            proxyContract: PROXY_CONTRACT,
            owner: await proxyAdmin.owner(),
            viaAdminContract: ContractName.ProxyAdmin,
            execute: proxy.skipInitialization ? undefined : { init: { methodName: INITIALIZE, args: [] } }
        };

        console.log(`deploying proxy ${contractName} as ${name}`);
    } else {
        console.log(`deploying ${contractName} as ${name}`);
    }

    const res = await deployContract(name, {
        contract: contractArtifactData?.metadata || contractName,
        from,
        value,
        args,
        proxy: isProxy ? proxyOptions : undefined,
        log: true
    });

    const data = { name, contract: contractName };
    saveTypes(data);

    await verifyTenderly({
        address: res.address,
        proxy: isProxy,
        implementation: isProxy ? res.implementation : undefined,
        ...data
    });

    return res.address;
};

export const deployProxy = async (options: DeployOptions, proxy: ProxyOptions = {}) =>
    deploy({
        ...options,
        proxy
    });

interface UpgradeProxyOptions extends DeployOptions {
    upgradeArgs?: string;
}

export const upgradeProxy = async (options: UpgradeProxyOptions) => {
    const { name, contract, from, value, args, upgradeArgs, contractArtifactData } = options;
    const contractName = contract || name;

    await fundAccount(from);

    const deployed = await DeployedContracts[name].deployed();
    if (!deployed) {
        throw new Error(`Proxy ${name} can't be found!`);
    }

    const prevVersion = await (deployed as IVersioned).version();

    const proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
    const proxyOptions = {
        proxyContract: PROXY_CONTRACT,
        owner: await proxyAdmin.owner(),
        viaAdminContract: ContractName.ProxyAdmin,
        execute: { onUpgrade: { methodName: POST_UPGRADE, args: upgradeArgs || [ZERO_BYTES] } }
    };

    console.log(`upgrading proxy ${contractName} V${prevVersion} as ${name}`);

    const res = await deployContract(name, {
        contract: contractArtifactData?.metadata || contractName,
        from,
        value,
        args,
        proxy: proxyOptions,
        log: true
    });

    const data = { name, contract: contractName };
    saveTypes(data);

    await verifyTenderly({
        address: res.address,
        proxy: true,
        implementation: res.implementation,
        ...data
    });

    return res.address;
};

interface ExecuteOptions {
    name: ContractName;
    methodName: string;
    args?: any[];
    from: string;
    value?: BigNumber;
}

export const execute = async (options: ExecuteOptions) => {
    const { name, methodName, from, value, args } = options;

    await fundAccount(from);

    return executeTransaction(name, { from, value, log: true }, methodName, ...(args || []));
};

interface InitializeProxyOptions {
    name: ContractName;
    proxyName: ContractName;
    args?: any[];
    from: string;
}

export const initializeProxy = async (options: InitializeProxyOptions) => {
    const { name, proxyName, args, from } = options;

    console.log(`initializing proxy ${name}`);

    await execute({
        name: proxyName,
        methodName: INITIALIZE,
        args,
        from
    });

    const { address } = await ethers.getContract(proxyName);

    await save({
        name,
        address,
        proxy: true,
        skipVerification: true
    });

    return address;
};

interface RolesOptions {
    name: ContractName;
    id: typeof RoleIds[number];
    member: string;
    from: string;
}

const setRole = async (options: RolesOptions, set: boolean) => {
    const { name, id, from, member } = options;

    return execute({
        name,
        methodName: set ? 'grantRole' : 'revokeRole',
        args: [id, member],
        from
    });
};

export const grantRole = async (options: RolesOptions) => setRole(options, true);
export const revokeRole = async (options: RolesOptions) => setRole(options, false);

interface Deployment {
    name: ContractName;
    contract?: string;
    address: Address;
    proxy?: boolean;
    implementation?: Address;
    skipVerification?: boolean;
}

export const save = async (deployment: Deployment) => {
    const { name, contract, address, proxy, skipVerification } = deployment;

    const contractName = contract || name;
    const { abi } = await getExtendedArtifact(contractName);

    // save the typechain for future use
    saveTypes({ name, contract: contractName });

    // save the deployment json data in the deployments folder
    await saveContract(name, { abi, address });

    if (proxy) {
        const { abi } = await getExtendedArtifact(PROXY_CONTRACT);
        await saveContract(`${name}_Proxy`, { abi, address });
    }

    if (skipVerification) {
        return;
    }

    // publish the contract to Tenderly
    return verifyTenderly(deployment);
};

interface ContractData {
    name: string;
    address: Address;
}

const verifyTenderly = async (deployment: Deployment) => {
    // verify contracts on Tenderly only for mainnet or tenderly mainnet forks deployments
    if (!isLive() && !isTenderlyFork()) {
        return;
    }

    const tenderlyNetwork = tenderly.network();
    tenderlyNetwork.setFork(TENDERLY_FORK_ID);

    const { name, contract, address, proxy, implementation } = deployment;

    const contracts: ContractData[] = [];
    let contractAddress = address;

    if (proxy) {
        contracts.push({
            name: PROXY_CONTRACT,
            address
        });

        contractAddress = implementation!;
    }

    contracts.push({
        name: contract || name,
        address: contractAddress
    });

    for (const contract of contracts) {
        console.log('verifying (Tenderly)', contract.name, 'at', contract.address);

        await tenderlyNetwork.verify(contract);
    }
};

export const deploymentExists = async (tag: string) => {
    const externalDeployments = (ExternalContracts.deployments as Record<string, string[]>)[getNetworkName()];
    const migrationsPath = path.resolve(
        __dirname,
        '../',
        externalDeployments ? externalDeployments[0] : path.join('deployments', getNetworkName()),
        '.migrations.json'
    );

    if (!fs.existsSync(migrationsPath)) {
        return false;
    }

    const migrations = JSON.parse(fs.readFileSync(migrationsPath, 'utf-8'));
    return !!migrations[tag];
};

export const toDeployTag = (filename: string) =>
    path
        .basename(filename)
        .split('.')[0]
        .split('-')
        .slice(1)
        .reduce((res, c) => res + capitalize(c), '');
