import { ArtifactData } from '../components/ContractBuilder';
import {
    AutoCompoundingRewards,
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
    StandardRewards,
    TestERC20Token,
    TransparentUpgradeableProxyImmutable
} from '../components/Contracts';
import { BNT, TokenGovernance, VBNT } from '../components/LegacyContracts';
import { BancorNetworkV1, NetworkSettingsV1 } from '../components/LegacyContractsV3';
import { ExternalContracts } from '../deployments/data';
import { DeploymentNetwork, ZERO_BYTES } from './Constants';
import { RoleIds } from './Roles';
import { toWei } from './Types';
import { BigNumber, Contract } from 'ethers';
import fs from 'fs';
import { config, deployments, ethers, getNamedAccounts, tenderly } from 'hardhat';
import { Address, DeployFunction, ProxyOptions as DeployProxyOptions } from 'hardhat-deploy/types';
import path from 'path';

const {
    deploy: deployContract,
    execute: executeTransaction,
    getNetworkName,
    save: saveContract,
    getExtendedArtifact,
    getArtifact
} = deployments;

interface EnvOptions {
    FORKING?: boolean;
    TENDERLY_FORK_ID?: string;
}

const { FORKING: isForking, TENDERLY_FORK_ID }: EnvOptions = process.env as any as EnvOptions;

const deployed = <F extends Contract>(name: InstanceName) => ({
    deployed: async () => ethers.getContract<F>(name)
});

enum LegacyInstanceName {
    BNT = 'BNT',
    BNTGovernance = 'BNTGovernance',
    VBNT = 'VBNT',
    VBNTGovernance = 'VBNTGovernance'
}

enum NewInstanceName {
    AutoCompoundingRewards = 'AutoCompoundingRewards',
    BancorNetworkInfo = 'BancorNetworkInfo',
    BancorNetworkProxy = 'BancorNetworkProxy',
    BancorNetwork = 'BancorNetwork',
    BancorPortal = 'BancorPortal',
    BancorV1Migration = 'BancorV1Migration',
    bnBNT = 'bnBNT',
    BNTPoolProxy = 'BNTPoolProxy',
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
    StandardRewards = 'StandardRewards'
}

enum TestInstanceName {
    MockUniswapV2Factory = 'MockUniswapV2Factory',
    MockUniswapV2Pair = 'MockUniswapV2Pair',
    MockUniswapV2Router02 = 'MockUniswapV2Router02'
}

export enum TestTokenInstanceName {
    TestToken1 = 'TestToken1',
    TestToken2 = 'TestToken2',
    TestToken3 = 'TestToken3',
    TestToken4 = 'TestToken4',
    TestToken5 = 'TestToken5',
    TestToken6 = 'TestToken6',
    TestToken7 = 'TestToken7'
}

export const InstanceName = {
    ...LegacyInstanceName,
    ...NewInstanceName,
    ...TestInstanceName,
    ...TestTokenInstanceName
};

export type InstanceName = LegacyInstanceName | NewInstanceName | TestInstanceName | TestTokenInstanceName;

const DeployedLegacyContracts = {
    BNT: deployed<BNT>(InstanceName.BNT),
    BNTGovernance: deployed<TokenGovernance>(InstanceName.BNTGovernance),
    VBNT: deployed<VBNT>(InstanceName.VBNT),
    VBNTGovernance: deployed<TokenGovernance>(InstanceName.VBNTGovernance),

    BancorNetworkV1: deployed<BancorNetworkV1>(InstanceName.BancorNetwork),
    NetworkSettingsV1: deployed<NetworkSettingsV1>(InstanceName.NetworkSettings)
};

const DeployedNewContracts = {
    AutoCompoundingRewards: deployed<AutoCompoundingRewards>(InstanceName.AutoCompoundingRewards),
    BancorNetworkInfo: deployed<BancorNetworkInfo>(InstanceName.BancorNetworkInfo),
    BancorNetworkProxy: deployed<TransparentUpgradeableProxyImmutable>(InstanceName.BancorNetworkProxy),
    BancorNetwork: deployed<BancorNetwork>(InstanceName.BancorNetwork),
    BancorPortal: deployed<BancorPortal>(InstanceName.BancorPortal),
    BancorV1Migration: deployed<BancorV1Migration>(InstanceName.BancorV1Migration),
    bnBNT: deployed<PoolToken>(InstanceName.bnBNT),
    BNTPoolProxy: deployed<TransparentUpgradeableProxyImmutable>(InstanceName.BNTPoolProxy),
    BNTPool: deployed<BNTPool>(InstanceName.BNTPool),
    ExternalProtectionVault: deployed<ExternalProtectionVault>(InstanceName.ExternalProtectionVault),
    ExternalRewardsVault: deployed<ExternalRewardsVault>(InstanceName.ExternalRewardsVault),
    MasterVault: deployed<MasterVault>(InstanceName.MasterVault),
    NetworkSettings: deployed<NetworkSettings>(InstanceName.NetworkSettings),
    PendingWithdrawals: deployed<PendingWithdrawals>(InstanceName.PendingWithdrawals),
    PoolCollectionType1V1: deployed<PoolCollection>(InstanceName.PoolCollectionType1V1),
    PoolMigrator: deployed<PoolMigrator>(InstanceName.PoolMigrator),
    PoolTokenFactory: deployed<PoolTokenFactory>(InstanceName.PoolTokenFactory),
    ProxyAdmin: deployed<ProxyAdmin>(InstanceName.ProxyAdmin),
    StandardRewards: deployed<StandardRewards>(InstanceName.StandardRewards)
};

const DeployedTestContracts = {
    MockUniswapV2Factory: deployed<MockUniswapV2Factory>(InstanceName.MockUniswapV2Factory),
    MockUniswapV2Pair: deployed<MockUniswapV2Pair>(InstanceName.MockUniswapV2Pair),
    MockUniswapV2Router02: deployed<MockUniswapV2Router02>(InstanceName.MockUniswapV2Router02),
    TestToken1: deployed<TestERC20Token>(InstanceName.TestToken1),
    TestToken2: deployed<TestERC20Token>(InstanceName.TestToken2),
    TestToken3: deployed<TestERC20Token>(InstanceName.TestToken3),
    TestToken4: deployed<TestERC20Token>(InstanceName.TestToken4),
    TestToken5: deployed<TestERC20Token>(InstanceName.TestToken5),
    TestToken6: deployed<TestERC20Token>(InstanceName.TestToken6),
    TestToken7: deployed<TestERC20Token>(InstanceName.TestToken7)
};

export const DeployedContracts = {
    ...DeployedLegacyContracts,
    ...DeployedNewContracts,
    ...DeployedTestContracts
};

export const isHardhat = () => getNetworkName() === DeploymentNetwork.Hardhat;
export const isLocalhost = () => getNetworkName() === DeploymentNetwork.Localhost;
export const isHardhatMainnetFork = () => isHardhat() && isForking!;
export const isTenderlyFork = () => getNetworkName() === DeploymentNetwork.Tenderly;
export const isMainnetFork = () => isHardhatMainnetFork() || isTenderlyFork();
export const isMainnet = () => getNetworkName() === DeploymentNetwork.Mainnet || isMainnetFork();
export const isRinkeby = () => getNetworkName() === DeploymentNetwork.Rinkeby;
export const isLive = () => (isMainnet() && !isMainnetFork()) || isRinkeby();

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
    name: InstanceName;
    contract: string;
}

const saveTypes = async (options: SaveTypeOptions) => {
    const { name, contract } = options;

    // don't attempt to save the types for legacy contracts
    if (Object.keys(LegacyInstanceName).includes(name)) {
        return;
    }

    const { sourceName } = await getArtifact(contract);
    const contractSrcDir = path.dirname(sourceName);

    const typechainDir = path.resolve('./', config.typechain.outDir);

    // for some reason, the types of some contracts are stored in a "Contract.sol" dir, in which case we'd have to use
    // it as the root source dir
    let srcDir;
    let factoriesSrcDir;
    if (fs.existsSync(path.join(typechainDir, sourceName))) {
        srcDir = path.join(typechainDir, sourceName);
        factoriesSrcDir = path.join(typechainDir, 'factories', sourceName);
    } else {
        srcDir = path.join(typechainDir, contractSrcDir);
        factoriesSrcDir = path.join(typechainDir, 'factories', contractSrcDir);
    }

    const typesDir = path.join(config.paths.deployments, getNetworkName(), 'types');
    const destDir = path.join(typesDir, contractSrcDir);
    const factoriesDestDir = path.join(typesDir, 'factories', contractSrcDir);

    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    if (!fs.existsSync(factoriesDestDir)) {
        fs.mkdirSync(factoriesDestDir, { recursive: true });
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

interface BaseDeployOptions {
    name: InstanceName;
    contract?: string;
    args?: any[];
    from: string;
    value?: BigNumber;
    contractArtifactData?: ArtifactData;
    legacy?: boolean;
}

interface DeployOptions extends BaseDeployOptions {
    proxy?: ProxyOptions;
}

const PROXY_CONTRACT = 'TransparentUpgradeableProxyImmutable';
const INITIALIZE = 'initialize';
const POST_UPGRADE = 'postUpgrade';

const WAIT_CONFIRMATIONS = isLive() ? 2 : 1;

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
            viaAdminContract: InstanceName.ProxyAdmin,
            execute: proxy.skipInitialization ? undefined : { init: { methodName: INITIALIZE, args: [] } }
        };

        console.log(`deploying proxy ${contractName} as ${name}`);
    } else {
        console.log(`deploying ${contractName} as ${name}`);
    }

    const res = await deployContract(name, {
        contract: contractArtifactData || contractName,
        from,
        value,
        args,
        proxy: isProxy ? proxyOptions : undefined,
        waitConfirmations: WAIT_CONFIRMATIONS,
        log: true
    });

    if (!proxy || !proxy.skipInitialization) {
        const data = { name, contract: contractName };
        saveTypes(data);

        await verifyTenderlyFork({
            address: res.address,
            proxy: isProxy,
            implementation: isProxy ? res.implementation : undefined,
            ...data
        });
    }

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
        viaAdminContract: InstanceName.ProxyAdmin,
        execute: { onUpgrade: { methodName: POST_UPGRADE, args: upgradeArgs || [ZERO_BYTES] } }
    };

    console.log(`upgrading proxy ${contractName} V${prevVersion} as ${name}`);

    const res = await deployContract(name, {
        contract: contractArtifactData || contractName,
        from,
        value,
        args,
        proxy: proxyOptions,
        waitConfirmations: WAIT_CONFIRMATIONS,
        log: true
    });

    const data = { name, contract: contractName };
    saveTypes(data);

    await verifyTenderlyFork({
        address: res.address,
        proxy: true,
        implementation: res.implementation,
        ...data
    });

    return res.address;
};

interface ExecuteOptions {
    name: InstanceName;
    methodName: string;
    args?: any[];
    from: string;
    value?: BigNumber;
}

export const execute = async (options: ExecuteOptions) => {
    const { name, methodName, from, value, args } = options;

    await fundAccount(from);

    return executeTransaction(
        name,
        { from, value, waitConfirmations: WAIT_CONFIRMATIONS, log: true },
        methodName,
        ...(args || [])
    );
};

interface InitializeProxyOptions {
    name: InstanceName;
    proxyName: InstanceName;
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
    name: InstanceName;
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
    name: InstanceName;
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

    // publish the contract to a Tenderly fork
    return verifyTenderlyFork(deployment);
};

interface ContractData {
    name: string;
    address: Address;
}

const verifyTenderlyFork = async (deployment: Deployment) => {
    // verify contracts on Tenderly only for mainnet or tenderly mainnet forks deployments
    if (!isTenderlyFork()) {
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
        console.log('verifying (Tenderly fork)', contract.name, 'at', contract.address);

        await tenderlyNetwork.verify(contract);
    }
};

export const deploymentTagExists = async (tag: string) => {
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

const deploymentFileNameToTag = (filename: string) => Number(path.basename(filename).split('-')[0]).toString();

export const getPreviousDeploymentTag = (tag: string) => {
    const files = fs.readdirSync(config.paths.deploy[0]).sort();

    const index = files.map((f) => deploymentFileNameToTag(f)).lastIndexOf(tag);
    if (index === -1) {
        throw new Error(`Unable to find deployment with tag ${tag}`);
    }

    return index === 0 ? undefined : deploymentFileNameToTag(files[index - 1]);
};

export const getLatestDeploymentTag = () => {
    const files = fs.readdirSync(config.paths.deploy[0]).sort();
    return Number(files[files.length - 1].split('-')[0]).toString();
};

export const deploymentMetadata = (filename: string) => {
    const id = path.basename(filename).split('.')[0];
    const tag = deploymentFileNameToTag(filename);
    const prevTag = getPreviousDeploymentTag(tag);

    return {
        id,
        tag,
        dependency: prevTag
    };
};

export const setDeploymentMetadata = (filename: string, func: DeployFunction) => {
    const { id, tag, dependency } = deploymentMetadata(filename);

    func.id = id;
    func.tags = [tag];
    func.dependencies = dependency ? [dependency] : undefined;

    return func;
};
