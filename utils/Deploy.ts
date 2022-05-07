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
    NetworkSettings,
    PendingWithdrawals,
    PoolCollection,
    PoolMigrator,
    PoolToken,
    PoolTokenFactory,
    ProxyAdmin,
    StandardRewards,
    TransparentUpgradeableProxyImmutable
} from '../components/Contracts';
import {
    BNT,
    CheckpointStore,
    ContractRegistry,
    LiquidityProtection,
    LiquidityProtectionSettings,
    LiquidityProtectionStats,
    LiquidityProtectionStore,
    LiquidityProtectionSystemStore,
    StakingRewards,
    TokenGovernance,
    TokenHolder,
    VBNT
} from '../components/LegacyContracts';
import {
    BancorNetworkV1,
    BancorNetworkV2,
    NetworkSettingsV1,
    PendingWithdrawalsV1,
    PoolCollectionType1V1,
    StandardRewardsV1,
    StandardRewardsV2
} from '../components/LegacyContractsV3';
import { ExternalContracts } from '../deployments/data';
import { DeploymentNetwork, ZERO_BYTES } from './Constants';
import { RoleIds } from './Roles';
import { toWei } from './Types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
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
    getArtifact,
    run
} = deployments;

interface EnvOptions {
    TENDERLY_FORK_ID?: string;
    TEMP_FORK?: boolean;
}

const { TENDERLY_FORK_ID: forkId, TEMP_FORK: isTempFork }: EnvOptions = process.env as any as EnvOptions;

const deployed = <F extends Contract>(name: InstanceName) => ({
    deployed: async () => ethers.getContract<F>(name)
});

enum LegacyInstanceNameV2 {
    BNT = 'BNT',
    BNTGovernance = 'BNTGovernance',
    VBNT = 'VBNT',
    VBNTGovernance = 'VBNTGovernance',
    ContractRegistry = 'ContractRegistry',
    LiquidityProtection = 'LiquidityProtection',
    LegacyLiquidityProtection = 'LegacyLiquidityProtection',
    LegacyLiquidityProtection2 = 'LegacyLiquidityProtection2',
    LiquidityProtectionSettings = 'LiquidityProtectionSettings',
    LiquidityProtectionStats = 'LiquidityProtectionStats',
    LiquidityProtectionStore = 'LiquidityProtectionStore',
    LiquidityProtectionSystemStore = 'LiquidityProtectionSystemStore',
    LiquidityProtectionWallet = 'LiquidityProtectionWallet',
    StakingRewards = 'StakingRewards',
    CheckpointStore = 'CheckpointStore'
}

enum LegacyInstanceNameV3 {
    PoolCollectionType1V1 = 'PoolCollectionType1V1'
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
    PoolCollectionType1V2 = 'PoolCollectionType1V2',
    PoolMigrator = 'PoolMigrator',
    PoolTokenFactory = 'PoolTokenFactory',
    ProxyAdmin = 'ProxyAdmin',
    StandardRewards = 'StandardRewards'
}

export const LegacyInstanceName = {
    ...LegacyInstanceNameV2,
    ...LegacyInstanceNameV3
};

export const InstanceName = {
    ...LegacyInstanceName,
    ...NewInstanceName
};

export type InstanceName = NewInstanceName | LegacyInstanceNameV2 | LegacyInstanceNameV3;

const DeployedLegacyContractsV2 = {
    BNT: deployed<BNT>(InstanceName.BNT),
    BNTGovernance: deployed<TokenGovernance>(InstanceName.BNTGovernance),
    VBNT: deployed<VBNT>(InstanceName.VBNT),
    VBNTGovernance: deployed<TokenGovernance>(InstanceName.VBNTGovernance),
    ContractRegistry: deployed<ContractRegistry>(InstanceName.ContractRegistry),
    LegacyLiquidityProtection: deployed<LiquidityProtection>(InstanceName.LegacyLiquidityProtection),
    LegacyLiquidityProtection2: deployed<LiquidityProtection>(InstanceName.LegacyLiquidityProtection2),
    LiquidityProtection: deployed<LiquidityProtection>(InstanceName.LiquidityProtection),
    LiquidityProtectionSettings: deployed<LiquidityProtectionSettings>(InstanceName.LiquidityProtectionSettings),
    LiquidityProtectionStats: deployed<LiquidityProtectionStats>(InstanceName.LiquidityProtectionStats),
    LiquidityProtectionStore: deployed<LiquidityProtectionStore>(InstanceName.LiquidityProtectionStore),
    LiquidityProtectionSystemStore: deployed<LiquidityProtectionSystemStore>(
        InstanceName.LiquidityProtectionSystemStore
    ),
    LiquidityProtectionWallet: deployed<TokenHolder>(InstanceName.LiquidityProtectionWallet),
    StakingRewards: deployed<StakingRewards>(InstanceName.StakingRewards),
    CheckpointStore: deployed<CheckpointStore>(InstanceName.CheckpointStore)
};

const DeployedLegacyContracts = {
    BancorNetworkV1: deployed<BancorNetworkV1>(InstanceName.BancorNetwork),
    BancorNetworkV2: deployed<BancorNetworkV2>(InstanceName.BancorNetwork),
    NetworkSettingsV1: deployed<NetworkSettingsV1>(InstanceName.NetworkSettings),
    StandardRewardsV1: deployed<StandardRewardsV1>(InstanceName.StandardRewards),
    StandardRewardsV2: deployed<StandardRewardsV2>(InstanceName.StandardRewards),
    PendingWithdrawalsV1: deployed<PendingWithdrawalsV1>(InstanceName.PendingWithdrawals),
    PoolCollectionType1V1: deployed<PoolCollectionType1V1>(InstanceName.PoolCollectionType1V1)
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
    PoolCollectionType1V2: deployed<PoolCollection>(InstanceName.PoolCollectionType1V2),
    PoolMigrator: deployed<PoolMigrator>(InstanceName.PoolMigrator),
    PoolTokenFactory: deployed<PoolTokenFactory>(InstanceName.PoolTokenFactory),
    ProxyAdmin: deployed<ProxyAdmin>(InstanceName.ProxyAdmin),
    StandardRewards: deployed<StandardRewards>(InstanceName.StandardRewards)
};

export const DeployedContracts = {
    ...DeployedLegacyContractsV2,
    ...DeployedLegacyContracts,
    ...DeployedNewContracts
};

export const isTenderlyFork = () => getNetworkName() === DeploymentNetwork.Tenderly;
export const isMainnetFork = () => isTenderlyFork();
export const isMainnet = () => getNetworkName() === DeploymentNetwork.Mainnet || isMainnetFork();
export const isRinkeby = () => getNetworkName() === DeploymentNetwork.Rinkeby;
export const isLive = () => (isMainnet() && !isMainnetFork()) || isRinkeby();

const TEST_MINIMUM_BALANCE = toWei(10);
const TEST_FUNDING = toWei(10);

export const getNamedSigners = async (): Promise<Record<string, SignerWithAddress>> => {
    const signers: Record<string, SignerWithAddress> = {};

    for (const [name, address] of Object.entries(await getNamedAccounts())) {
        signers[name] = await ethers.getSigner(address);
    }

    return signers;
};

export const fundAccount = async (account: string | SignerWithAddress) => {
    if (!isMainnetFork()) {
        return;
    }

    const address = typeof account === 'string' ? account : account.address;

    const balance = await ethers.provider.getBalance(address);
    if (balance.gte(TEST_MINIMUM_BALANCE)) {
        return;
    }

    const { ethWhale } = await getNamedSigners();

    return ethWhale.sendTransaction({
        value: TEST_FUNDING,
        to: address
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

    const customAlias = contractName === name ? '' : ` as ${name};`;

    if (isProxy) {
        const proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();

        proxyOptions = {
            proxyContract: PROXY_CONTRACT,
            owner: await proxyAdmin.owner(),
            viaAdminContract: InstanceName.ProxyAdmin,
            execute: proxy.skipInitialization ? undefined : { init: { methodName: INITIALIZE, args: [] } }
        };

        console.log(`deploying proxy ${contractName}${customAlias}`);
    } else {
        console.log(`deploying ${contractName}${customAlias}`);
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

    const res = await deployContract(name, {
        contract: contractArtifactData || contractName,
        from,
        value,
        args,
        proxy: proxyOptions,
        waitConfirmations: WAIT_CONFIRMATIONS,
        log: true
    });

    const newVersion = await (deployed as IVersioned).version();

    console.log(`upgraded proxy ${contractName} V${prevVersion} to V${newVersion}`);

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

interface RenounceRoleOptions {
    name: InstanceName;
    id: typeof RoleIds[number];
    from: string;
}

const setRole = async (options: RolesOptions, methodName: string) => {
    const { name, id, from, member } = options;

    return execute({
        name,
        methodName,
        args: [id, member],
        from
    });
};

export const grantRole = async (options: RolesOptions) => setRole(options, 'grantRole');
export const revokeRole = async (options: RolesOptions) => setRole(options, 'revokeRole');
export const renounceRole = async (options: RenounceRoleOptions) =>
    setRole({ member: options.from, ...options }, 'renounceRole');

interface Deployment {
    name: InstanceName;
    contract?: string;
    address: Address;
    proxy?: boolean;
    implementation?: Address;
    skipTypechain?: boolean;
    skipVerification?: boolean;
}

export const save = async (deployment: Deployment) => {
    const { name, contract, address, proxy, skipVerification, skipTypechain } = deployment;

    const contractName = contract || name;
    const { abi } = await getExtendedArtifact(contractName);

    // save the typechain for future use
    if (!skipTypechain) {
        saveTypes({ name, contract: contractName });
    }

    // save the deployment json data in the deployments folder
    await saveContract(name, { abi, address });

    if (proxy) {
        const { abi } = await getExtendedArtifact(PROXY_CONTRACT);
        await saveContract(`${name}_Proxy`, { abi, address });
    }

    // publish the contract to a Tenderly fork
    if (!skipVerification) {
        await verifyTenderlyFork(deployment);
    }
};

interface ContractData {
    name: string;
    address: Address;
}

const verifyTenderlyFork = async (deployment: Deployment) => {
    // verify contracts on Tenderly only for mainnet or tenderly mainnet forks deployments
    if (!isTenderlyFork() || isTempFork) {
        return;
    }

    const tenderlyNetwork = tenderly.network();
    tenderlyNetwork.setFork(forkId);

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
        console.log('verifying on tenderly', contract.name, 'at', contract.address);

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
    const tags = Object.keys(migrations).map((tag) => deploymentFileNameToTag(tag));

    return tags.includes(tag);
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

export const runPendingDeployments = async () => {
    const { tag } = deploymentMetadata(getLatestDeploymentTag());

    return run(tag, {
        resetMemory: false,
        deletePreviousDeployments: false,
        writeDeploymentsToFiles: true
    });
};
