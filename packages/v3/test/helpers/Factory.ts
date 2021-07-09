import { ethers } from 'hardhat';
import { BigNumber, ContractFactory } from 'ethers';

import Contracts, { AsyncReturnType, ContractBuilder } from 'components/Contracts';

import { TestERC20Token, NetworkSettings, PendingWithdrawals, BancorNetwork, BancorVault } from 'typechain';

const TOTAL_SUPPLY = BigNumber.from(1_000_000_000).mul(BigNumber.from(10).pow(18));

interface ProxyArguments {
    initArgs?: Parameters<any>;
    ctorArgs?: Parameters<any>;
}

const createProxy = async <F extends ContractFactory>(
    factory: ContractBuilder<F>,
    args?: ProxyArguments
): Promise<AsyncReturnType<F['deploy']>> => {
    const logic = await factory.deploy(...(args?.ctorArgs || []));

    const proxy = await Contracts.TransparentUpgradeableProxy.deploy(
        logic.address,
        (
            await proxyAdmin()
        ).address,
        logic.interface.encodeFunctionData('initialize', args?.initArgs || [])
    );

    return factory.attach(proxy.address);
};

export const proxyAdmin = async () => (await ethers.getSigners())[9];

export const createNetworkToken = async () => Contracts.TestERC20Token.deploy('BNT', 'BNT', TOTAL_SUPPLY);

export const createBancorVault = async (networkToken: TestERC20Token | string) => {
    const networkTokenAddress = typeof networkToken === 'string' ? networkToken : networkToken.address;

    return createProxy(Contracts.BancorVault, { ctorArgs: [networkTokenAddress] });
};

export const createNetworkSettings = async () => createProxy(Contracts.NetworkSettings);

export const createPendingWithdrawals = async () => createProxy(Contracts.PendingWithdrawals);

export const createBancorNetwork = async (
    networkSettings: NetworkSettings | string,
    pendingWithdrawals: PendingWithdrawals | string
) => {
    const networkSettingsAddress = typeof networkSettings === 'string' ? networkSettings : networkSettings.address;
    const pendingWithdrawalsAddress =
        typeof pendingWithdrawals === 'string' ? pendingWithdrawals : pendingWithdrawals.address;

    return createProxy(Contracts.BancorNetwork, { ctorArgs: [networkSettingsAddress, pendingWithdrawalsAddress] });
};

export const createLiquidityPoolCollection = async (network: BancorNetwork | string) => {
    const networkAddress = typeof network === 'string' ? network : network.address;

    return createProxy(Contracts.LiquidityPoolCollection, { ctorArgs: [networkAddress] });
};

export const createNetworkTokenPool = async (network: BancorNetwork | string, vault: BancorVault | string) => {
    const networkAddress = typeof network === 'string' ? network : network.address;
    const vaultAddress = typeof vault === 'string' ? vault : vault.address;

    return createProxy(Contracts.NetworkTokenPool, { ctorArgs: [networkAddress, vaultAddress] });
};
