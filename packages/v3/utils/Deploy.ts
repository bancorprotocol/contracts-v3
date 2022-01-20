import { MasterVault, ProxyAdmin } from '../components/Contracts';
import { NetworkToken, GovToken, TokenGovernance } from '../components/LegacyContracts';
import { ContractName, DeploymentNetwork } from './Constants';
import { Contract } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { ProxyOptions } from 'hardhat-deploy/types';

const { deploy: deployContract, execute: executeTransaction, getNetworkName, fixture, run } = deployments;

const deployed = <F extends Contract>(name: ContractName) => ({
    deployed: async () => ethers.getContract<F>(name)
});

export const DeployedContracts = {
    GovToken: deployed<GovToken>(ContractName.GovToken),
    GovTokenGovernance: deployed<TokenGovernance>(ContractName.GovTokenGovernance),
    MasterVault: deployed<MasterVault>(ContractName.MasterVault),
    NetworkToken: deployed<NetworkToken>(ContractName.NetworkToken),
    NetworkTokenGovernance: deployed<TokenGovernance>(ContractName.NetworkTokenGovernance),
    ProxyAdmin: deployed<ProxyAdmin>(ContractName.ProxyAdmin)
};

export const isHardhat = () =>
    [DeploymentNetwork.HARDHAT, DeploymentNetwork.HARDHAT_MAINNET_FORK].includes(getNetworkName() as DeploymentNetwork);
export const isHardhatMainnetFork = () => getNetworkName() === DeploymentNetwork.HARDHAT_MAINNET_FORK;
export const isMainnetFork = () => isHardhatMainnetFork();
export const isMainnet = () => getNetworkName() === DeploymentNetwork.MAINNET || isMainnetFork();
export const isLive = () => isMainnet() && !isMainnetFork();

interface DeployOptions {
    name: ContractName;
    contract?: string;
    args?: any[];
    from: string;
    proxy?: boolean;
}

export const deploy = async (options: DeployOptions) => {
    const { name, contract, from, args, proxy } = options;

    let proxyOptions: ProxyOptions = {};
    if (proxy) {
        const proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();

        proxyOptions = {
            proxyContract: 'TransparentUpgradeableProxyImmutable',
            execute: { init: { methodName: 'initialize', args: [] } },
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

export const deployProxy = async (options: DeployOptions) =>
    deploy({
        ...options,
        proxy: true
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
