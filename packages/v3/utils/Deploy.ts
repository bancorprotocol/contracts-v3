import {
    BancorNetwork,
    ExternalProtectionVault,
    ExternalRewardsVault,
    MasterPool,
    MasterVault,
    NetworkSettings,
    PendingWithdrawals,
    PoolCollectionUpgrader,
    PoolToken,
    PoolTokenFactory,
    ProxyAdmin,
    TransparentUpgradeableProxyImmutable
} from '../components/Contracts';
import { GovToken, NetworkToken, TokenGovernance } from '../components/LegacyContracts';
import { ContractName, DeploymentNetwork } from './Constants';
import { Contract } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { ProxyOptions as DeployProxyOptions, Address } from 'hardhat-deploy/types';

const {
    deploy: deployContract,
    execute: executeTransaction,
    getNetworkName,
    fixture,
    run,
    save: saveContract,
    getExtendedArtifact
} = deployments;

const deployed = <F extends Contract>(name: ContractName) => ({
    deployed: async () => ethers.getContract<F>(name)
});

export const DeployedContracts = {
    BancorNetwork: deployed<BancorNetwork>(ContractName.BancorNetwork),
    BancorNetworkProxy: deployed<TransparentUpgradeableProxyImmutable>(ContractName.BancorNetworkProxy),
    ExternalProtectionVault: deployed<ExternalProtectionVault>(ContractName.ExternalProtectionVault),
    ExternalRewardsVault: deployed<ExternalRewardsVault>(ContractName.ExternalRewardsVault),
    GovToken: deployed<GovToken>(ContractName.GovToken),
    GovTokenGovernance: deployed<TokenGovernance>(ContractName.GovTokenGovernance),
    MasterPool: deployed<MasterPool>(ContractName.MasterPool),
    MasterPoolToken: deployed<PoolToken>(ContractName.MasterPoolToken),
    MasterVault: deployed<MasterVault>(ContractName.MasterVault),
    NetworkSettings: deployed<NetworkSettings>(ContractName.NetworkSettings),
    NetworkToken: deployed<NetworkToken>(ContractName.NetworkToken),
    NetworkTokenGovernance: deployed<TokenGovernance>(ContractName.NetworkTokenGovernance),
    PendingWithdrawals: deployed<PendingWithdrawals>(ContractName.PendingWithdrawals),
    PoolCollectionUpgrader: deployed<PoolCollectionUpgrader>(ContractName.PoolCollectionUpgrader),
    PoolTokenFactory: deployed<PoolTokenFactory>(ContractName.PoolTokenFactory),
    ProxyAdmin: deployed<ProxyAdmin>(ContractName.ProxyAdmin)
};

export const isHardhat = () =>
    [DeploymentNetwork.HARDHAT, DeploymentNetwork.HARDHAT_MAINNET_FORK].includes(getNetworkName() as DeploymentNetwork);
export const isHardhatMainnetFork = () => getNetworkName() === DeploymentNetwork.HARDHAT_MAINNET_FORK;
export const isMainnetFork = () => isHardhatMainnetFork();
export const isMainnet = () => getNetworkName() === DeploymentNetwork.MAINNET || isMainnetFork();
export const isLive = () => isMainnet() && !isMainnetFork();

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

    const res = await deployContract(name, {
        contract: contract || name,
        from,
        args,
        proxy: proxy ? proxyOptions : undefined,
        log: true
    });

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
};

interface Deployment {
    name: ContractName;
    contract?: string;
    address: Address;
}

export const save = async (deployment: Deployment) => {
    const { name, contract, address } = deployment;

    const { abi } = await getExtendedArtifact(contract || name);

    return saveContract(name, { abi, address });
};

export const runTestDeployment = async (tags?: string | string[]) => {
    if (isLive()) {
        throw new Error('Unsupported network');
    }

    // mainnet forks don't support evm_snapshot, so we have to run test deployment every time before tests
    if (isMainnetFork()) {
        return run(tags, { resetMemory: false });
    }

    return fixture(tags);
};
