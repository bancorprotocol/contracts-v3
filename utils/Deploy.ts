import {
    AutoCompoundingStakingRewards,
    BancorNetwork,
    BancorNetworkInfo,
    BancorPortal,
    BancorV1Migration,
    BNTPool,
    ExternalProtectionVault,
    ExternalRewardsVault,
    MasterVault,
    MockUniswapV2Factory,
    MockUniswapV2Pair,
    MockUniswapV2Router02,
    NetworkSettings,
    PendingWithdrawals,
    PoolCollection,
    PoolCollectionUpgrader,
    PoolToken,
    PoolTokenFactory,
    ProxyAdmin,
    StandardStakingRewards,
    TestERC20Token,
    TransparentUpgradeableProxyImmutable
} from '../components/Contracts';
import { BNT, TokenGovernance, VBNT } from '../components/LegacyContracts';
import { DeploymentNetwork } from './Constants';
import { RoleIds } from './Roles';
import { toWei } from './Types';
import { Contract } from 'ethers';
import fs from 'fs';
import { config, deployments, ethers, getNamedAccounts, tenderly } from 'hardhat';
import { Address, ProxyOptions as DeployProxyOptions } from 'hardhat-deploy/types';
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
}

const { FORKING: isForking }: EnvOptions = process.env as any as EnvOptions;

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
    MockUniswapV2FactoryV1 = 'MockUniswapV2FactoryV1',
    MockUniswapV2PairV1 = 'MockUniswapV2PairV1',
    MockUniswapV2Router02V1 = 'MockUniswapV2Router02V1',
    NetworkSettingsV1 = 'NetworkSettingsV1',
    PendingWithdrawalsV1 = 'PendingWithdrawalsV1',
    PoolCollectionType1V1 = 'PoolCollectionType1V1',
    PoolCollectionUpgraderV1 = 'PoolCollectionUpgraderV1',
    PoolTokenFactoryV1 = 'PoolTokenFactoryV1',
    ProxyAdmin = 'ProxyAdmin',
    StandardStakingRewardsV1 = 'StandardStakingRewardsV1'
}

enum TestContractName {
    TestToken1 = 'TestToken1',
    TestToken2 = 'TestToken2',
    TestToken3 = 'TestToken3'
}

export const ContractName = {
    ...LegacyContractName,
    ...NewContractName,
    ...TestContractName
};

export type ContractName = LegacyContractName | NewContractName | TestContractName;

export enum DeploymentTag {
    V2 = 'V2',
    V3 = 'V3'
}

const DeployedLegacyContracts = {
    BNT: deployed<BNT>(ContractName.BNT),
    BNTGovernance: deployed<TokenGovernance>(ContractName.BNTGovernance),
    VBNT: deployed<VBNT>(ContractName.VBNT),
    VBNTGovernance: deployed<TokenGovernance>(ContractName.VBNTGovernance)
};

const DeployedNewContracts = {
    AutoCompoundingStakingRewardsV1: deployed<AutoCompoundingStakingRewards>(
        ContractName.AutoCompoundingStakingRewardsV1
    ),
    BancorNetworkInfoV1: deployed<BancorNetworkInfo>(ContractName.BancorNetworkInfoV1),
    BancorNetworkProxy: deployed<TransparentUpgradeableProxyImmutable>(ContractName.BancorNetworkProxy),
    BancorNetworkV1: deployed<BancorNetwork>(ContractName.BancorNetworkV1),
    BancorPortalV1: deployed<BancorPortal>(ContractName.BancorPortalV1),
    BancorV1MigrationV1: deployed<BancorV1Migration>(ContractName.BancorV1MigrationV1),
    BNTPoolTokenV1: deployed<PoolToken>(ContractName.BNTPoolTokenV1),
    BNTPoolV1: deployed<BNTPool>(ContractName.BNTPoolV1),
    ExternalProtectionVaultV1: deployed<ExternalProtectionVault>(ContractName.ExternalProtectionVaultV1),
    ExternalRewardsVaultV1: deployed<ExternalRewardsVault>(ContractName.ExternalRewardsVaultV1),
    MasterVaultV1: deployed<MasterVault>(ContractName.MasterVaultV1),
    MockUniswapV2FactoryV1: deployed<MockUniswapV2Factory>(ContractName.MockUniswapV2FactoryV1),
    MockUniswapV2PairV1: deployed<MockUniswapV2Pair>(ContractName.MockUniswapV2PairV1),
    MockUniswapV2Router02V1: deployed<MockUniswapV2Router02>(ContractName.MockUniswapV2Router02V1),
    NetworkSettingsV1: deployed<NetworkSettings>(ContractName.NetworkSettingsV1),
    PendingWithdrawalsV1: deployed<PendingWithdrawals>(ContractName.PendingWithdrawalsV1),
    PoolCollectionType1V1: deployed<PoolCollection>(ContractName.PoolCollectionType1V1),
    PoolCollectionUpgraderV1: deployed<PoolCollectionUpgrader>(ContractName.PoolCollectionUpgraderV1),
    PoolTokenFactoryV1: deployed<PoolTokenFactory>(ContractName.PoolTokenFactoryV1),
    ProxyAdmin: deployed<ProxyAdmin>(ContractName.ProxyAdmin),
    StandardStakingRewardsV1: deployed<StandardStakingRewards>(ContractName.StandardStakingRewardsV1)
};

const DeployedTestContracts = {
    TestToken1: deployed<TestERC20Token>(ContractName.TestToken1),
    TestToken2: deployed<TestERC20Token>(ContractName.TestToken2),
    TestToken3: deployed<TestERC20Token>(ContractName.TestToken3)
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

// remove internal versioning (== a contract name ends in "V" and some number) from the name of the contract
const normalizedContractName = (contractName: string) => contractName.replace(/V\d+$/, '');

interface SaveTypeOptions {
    name: ContractName;
    contract: string;
}

const saveTypes = async (options: SaveTypeOptions) => {
    const { name, contract } = options;

    const src = path.join(path.resolve('./', config.typechain.outDir), `${contract}.ts`);
    const networkName = getNetworkName();
    const deploymentDir = config.external?.deployments![networkName][0];
    const destDir = deploymentDir || path.join(config.paths.deployments, networkName);
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

    const contractName = normalizedContractName(contract || name);
    const res = await deployContract(name, {
        contract: contractName,
        from,
        args,
        proxy: proxy ? proxyOptions : undefined,
        log: true
    });

    const data = { name, contract: contractName };
    await saveTypes(data);
    await verifyTenderly({ address: res.address, ...data });

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

    const contractName = normalizedContractName(contract || name);
    const { abi } = await getExtendedArtifact(contractName);

    // save the typechain for future use
    await saveTypes({ name, contract: contractName });

    // save the deployment json data in the deployments folder
    await saveContract(name, { abi, address });

    // publish the contract to Tenderly
    return verifyTenderly(deployment);
};

const verifyTenderly = async (deployment: Deployment) => {
    const { name, contract, address } = deployment;

    const contractName = normalizedContractName(contract || name);

    return tenderly.verify({
        name: contractName,
        address
    });
};

export const deploymentExists = async (tag: string) => (await ethers.getContractOrNull(tag)) !== null;

export const toDeployTag = (filename: string) =>
    path
        .basename(filename)
        .split('.')[0]
        .split('-')
        .slice(1)
        .reduce((res, c) => res + capitalize(c), '');
