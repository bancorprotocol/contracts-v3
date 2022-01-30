import {
    AutoCompoundingStakingRewards,
    BancorV1Migration,
    BancorNetwork,
    BancorNetworkInfo,
    ExternalProtectionVault,
    ExternalRewardsVault,
    MasterPool,
    MasterVault,
    NetworkSettings,
    PendingWithdrawals,
    PoolCollection,
    PoolCollectionUpgrader,
    PoolToken,
    PoolTokenFactory,
    ProxyAdmin,
    TransparentUpgradeableProxyImmutable
} from '../components/Contracts';
import { GovToken, NetworkToken, TokenGovernance } from '../components/LegacyContracts';
import { DeploymentNetwork } from './Constants';
import { RoleIds } from './Roles';
import { toWei } from './Types';
import { Contract } from 'ethers';
import fs from 'fs';
import { deployments, ethers, getNamedAccounts, config } from 'hardhat';
import { ProxyOptions as DeployProxyOptions, Address } from 'hardhat-deploy/types';
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
}

const { FORKING: isForking }: EnvOptions = process.env as any as EnvOptions;

const deployed = <F extends Contract>(name: ContractName) => ({
    deployed: async () => ethers.getContract<F>(name)
});

enum LegacyContractName {
    GovToken = 'GovToken',
    GovTokenGovernance = 'GovTokenGovernance',
    NetworkToken = 'NetworkToken',
    NetworkTokenGovernance = 'NetworkTokenGovernance'
}

enum NewContractName {
    AutoCompoundingStakingRewardsV1 = 'AutoCompoundingStakingRewardsV1',
    BancorNetworkInfoV1 = 'BancorNetworkInfoV1',
    BancorNetworkV1 = 'BancorNetworkV1',
    BancorV1MigrationV1 = 'BancorV1MigrationV1',
    BancorNetworkProxy = 'BancorNetworkProxy',
    ExternalProtectionVaultV1 = 'ExternalProtectionVaultV1',
    ExternalRewardsVaultV1 = 'ExternalRewardsVaultV1',
    MasterPoolV1 = 'MasterPoolV1',
    MasterPoolTokenV1 = 'MasterPoolTokenV1',
    MasterVaultV1 = 'MasterVaultV1',
    NetworkSettingsV1 = 'NetworkSettingsV1',
    PendingWithdrawalsV1 = 'PendingWithdrawalsV1',
    PoolCollectionType1V1 = 'PoolCollectionType1V1',
    PoolCollectionUpgraderV1 = 'PoolCollectionUpgraderV1',
    PoolTokenFactoryV1 = 'PoolTokenFactoryV1',
    ProxyAdmin = 'ProxyAdmin'
}

export const ContractName = { ...LegacyContractName, ...NewContractName } as const;
export type ContractName = LegacyContractName | NewContractName;

export enum DeploymentTag {
    V2 = 'V2',
    V3 = 'V3'
}

const DeployedLegacyContracts = {
    GovToken: deployed<GovToken>(ContractName.GovToken),
    GovTokenGovernance: deployed<TokenGovernance>(ContractName.GovTokenGovernance),
    NetworkToken: deployed<NetworkToken>(ContractName.NetworkToken),
    NetworkTokenGovernance: deployed<TokenGovernance>(ContractName.NetworkTokenGovernance)
};

const DeployedNewContracts = {
    AutoCompoundingStakingRewardsV1: deployed<AutoCompoundingStakingRewards>(
        ContractName.AutoCompoundingStakingRewardsV1
    ),
    BancorV1MigrationV1: deployed<BancorV1Migration>(ContractName.BancorV1MigrationV1),
    BancorNetworkV1: deployed<BancorNetwork>(ContractName.BancorNetworkV1),
    BancorNetworkInfoV1: deployed<BancorNetworkInfo>(ContractName.BancorNetworkInfoV1),
    BancorNetworkProxy: deployed<TransparentUpgradeableProxyImmutable>(ContractName.BancorNetworkProxy),
    ExternalProtectionVaultV1: deployed<ExternalProtectionVault>(ContractName.ExternalProtectionVaultV1),
    ExternalRewardsVaultV1: deployed<ExternalRewardsVault>(ContractName.ExternalRewardsVaultV1),
    MasterPoolV1: deployed<MasterPool>(ContractName.MasterPoolV1),
    MasterPoolTokenV1: deployed<PoolToken>(ContractName.MasterPoolTokenV1),
    MasterVaultV1: deployed<MasterVault>(ContractName.MasterVaultV1),
    NetworkSettingsV1: deployed<NetworkSettings>(ContractName.NetworkSettingsV1),
    PendingWithdrawalsV1: deployed<PendingWithdrawals>(ContractName.PendingWithdrawalsV1),
    PoolCollectionType1V1: deployed<PoolCollection>(ContractName.PoolCollectionType1V1),
    PoolCollectionUpgraderV1: deployed<PoolCollectionUpgrader>(ContractName.PoolCollectionUpgraderV1),
    PoolTokenFactoryV1: deployed<PoolTokenFactory>(ContractName.PoolTokenFactoryV1),
    ProxyAdmin: deployed<ProxyAdmin>(ContractName.ProxyAdmin)
};

export const DeployedContracts = { ...DeployedLegacyContracts, ...DeployedNewContracts };

export const isHardhat = () => getNetworkName() === DeploymentNetwork.HARDHAT;
export const isHardhatMainnetFork = () => isHardhat() && isForking!;
export const isMainnetFork = () => isHardhatMainnetFork();
export const isMainnet = () => getNetworkName() === DeploymentNetwork.MAINNET || isMainnetFork();
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

// remove internal versioning (== a contract name ends in "V" and some number) from the name of the contract
const normalizeContractName = (contractName: string) => contractName.replace(/V\d+$/, '');

interface SaveTypeOptions {
    name: ContractName;
    contract: string;
}

const saveTypes = async (options: SaveTypeOptions) => {
    const { name, contract } = options;

    const src = path.join(path.resolve('./', config.typechain.outDir), `${contract}.ts`);
    const destDir = path.join(config.paths.deployments, getNetworkName());
    const dest = path.join(destDir, `${name}.ts`);

    // don't save types for legacy contracts
    if (Object.values(LegacyContractName).includes(name as LegacyContractName)) {
        return;
    }

    // don't overwrite types for an existing deployment
    if (fs.existsSync(dest)) {
        return;
    }

    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir);
    }

    fs.copyFileSync(src, dest);
};

interface ProxyOptions {
    skipInitialization?: boolean;
}

interface DeployOptions {
    name: ContractName;
    contract?: string;
    args?: any[];
    from: string;
    proxy?: ProxyOptions;
}

const INITIALIZE = 'initialize';

export const deploy = async (options: DeployOptions) => {
    const { name, contract, from, args, proxy } = options;

    await fundAccount(from);

    let proxyOptions: DeployProxyOptions = {};
    if (proxy) {
        const proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();

        proxyOptions = {
            proxyContract: 'TransparentUpgradeableProxyImmutable',
            execute: proxy.skipInitialization ? undefined : { init: { methodName: INITIALIZE, args: [] } },
            owner: await proxyAdmin.owner(),
            viaAdminContract: ContractName.ProxyAdmin
        };
    }

    const contractName = normalizeContractName(contract || name);
    const res = await deployContract(name, {
        contract: contractName,
        from,
        args,
        proxy: proxy ? proxyOptions : undefined,
        log: true
    });

    await saveTypes({ name, contract: contractName });

    return res.address;
};

export const deployProxy = async (options: DeployOptions, proxy: ProxyOptions = {}) =>
    deploy({
        ...options,
        proxy
    });

interface ExecuteOptions {
    name: ContractName;
    methodName: string;
    args?: any[];
    from: string;
}

export const execute = async (options: ExecuteOptions) => {
    const { name, methodName, from, args } = options;

    await fundAccount(from);

    return executeTransaction(name, { from, log: true }, methodName, ...(args || []));
};

interface InitializeProxyOptions {
    name: ContractName;
    proxyName: ContractName;
    args?: any[];
    from: string;
}

export const initializeProxy = async (options: InitializeProxyOptions) => {
    const { name, proxyName, args, from } = options;

    await execute({
        name: proxyName,
        methodName: INITIALIZE,
        args,
        from
    });

    const { address } = await ethers.getContract(proxyName);

    await save({
        name,
        address
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
}

export const save = async (deployment: Deployment) => {
    const { name, contract, address } = deployment;

    const { abi } = await getExtendedArtifact(normalizeContractName(contract || name));

    return saveContract(name, { abi, address });
};

export const deploymentExists = async (tag: string) => (await ethers.getContractOrNull(tag)) !== null;
