import { ethers } from 'hardhat';
import { BigNumber, ContractFactory } from 'ethers';

import Contracts, { Contract, ContractBuilder } from 'components/Contracts';

import { TestERC20Token, NetworkSettings, PendingWithdrawals, BancorNetwork, BancorVault } from 'typechain';

import { toAddress } from 'test/helpers/Utils';

const TOTAL_SUPPLY = BigNumber.from(1_000_000_000).mul(BigNumber.from(10).pow(18));

interface ProxyArguments {
    initArgs?: Parameters<any>;
    ctorArgs?: Parameters<any>;
}

const createProxy = async <F extends ContractFactory>(
    factory: ContractBuilder<F>,
    args?: ProxyArguments
): Promise<Contract<F>> => {
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

export const createTokenHolder = async () => {
    const tokenHolder = await Contracts.TokenHolderUpgradeable.deploy();
    await tokenHolder.initialize();

    return tokenHolder;
};

export const createBancorVault = async (networkToken: TestERC20Token | string) =>
    createProxy(Contracts.BancorVault, { ctorArgs: [toAddress(networkToken)] });

export const createNetworkSettings = async () => createProxy(Contracts.NetworkSettings);

export const createPendingWithdrawals = async () => createProxy(Contracts.PendingWithdrawals);

export const createBancorNetwork = async (
    networkSettings: NetworkSettings | string,
    pendingWithdrawals: PendingWithdrawals | string
) => createProxy(Contracts.BancorNetwork, { ctorArgs: [toAddress(networkSettings), toAddress(pendingWithdrawals)] });

export const createLiquidityPoolCollection = async (network: BancorNetwork | string) =>
    Contracts.LiquidityPoolCollection.deploy(toAddress(network));

export const createNetworkTokenPool = async (network: BancorNetwork | string, vault: BancorVault | string) =>
    createProxy(Contracts.NetworkTokenPool, { ctorArgs: [toAddress(network), toAddress(vault)] });
