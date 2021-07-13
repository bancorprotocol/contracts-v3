import { BaseContract, BigNumber, ContractFactory } from 'ethers';
import { isEqual } from 'lodash';

import Contracts, { Contract, ContractBuilder } from 'components/Contracts';

import { ProxyAdmin } from 'typechain';

import { toAddress } from 'test/helpers/Utils';

const TOTAL_SUPPLY = BigNumber.from(1_000_000_000).mul(BigNumber.from(10).pow(18));

type CtorArgs = Parameters<any>;
type InitArgs = Parameters<any>;

interface ProxyArguments {
    initArgs?: InitArgs;
    ctorArgs?: CtorArgs;
}

interface Logic {
    ctorArgs: CtorArgs;
    contract: BaseContract;
}

let logicCache: Record<string, Logic> = {};

let admin: ProxyAdmin;

export const proxyAdmin = async () => {
    if (!admin) {
        admin = await Contracts.ProxyAdmin.deploy();
    }

    return admin;
};

const createLogic = async <F extends ContractFactory>(factory: ContractBuilder<F>, ctorArgs: CtorArgs = []) => {
    // check if we can reuse a previously cached exact logic contract (e.g., the same contract and constructor arguments)
    const cached = logicCache[factory.contractName];
    if (cached && isEqual(cached.ctorArgs, ctorArgs)) {
        return cached.contract;
    }

    const logic = await factory.deploy(...(ctorArgs || []));
    logicCache[factory.contractName] = { ctorArgs, contract: logic };

    return logic;
};

const createTransparentProxy = async (logic: BaseContract, initArgs: InitArgs = []) => {
    const admin = await proxyAdmin();
    return Contracts.TransparentUpgradeableProxy.deploy(
        logic.address,
        admin.address,
        logic.interface.encodeFunctionData('initialize', initArgs)
    );
};

const createProxy = async <F extends ContractFactory>(
    factory: ContractBuilder<F>,
    args?: ProxyArguments
): Promise<Contract<F>> => {
    const logic = await createLogic(factory, args?.ctorArgs);
    const proxy = await createTransparentProxy(logic, args?.initArgs);

    return factory.attach(proxy.address);
};

export const createNetworkToken = async () => Contracts.TestERC20Token.deploy('BNT', 'BNT', TOTAL_SUPPLY);
export const createTokenHolder = async () => createProxy(Contracts.TokenHolderUpgradeable);

export const createSystem = async () => {
    const networkSettings = await createProxy(Contracts.NetworkSettings);
    const network = await createProxy(Contracts.BancorNetwork, { ctorArgs: [toAddress(networkSettings)] });
    const networkToken = await createNetworkToken();
    const vault = await createProxy(Contracts.BancorVault, { ctorArgs: [toAddress(networkToken)] });
    const networkTokenPool = await createProxy(Contracts.NetworkTokenPool, {
        ctorArgs: [toAddress(network), toAddress(vault)]
    });
    const pendingWithdrawals = await createProxy(Contracts.PendingWithdrawals, {
        ctorArgs: [toAddress(network), toAddress(networkTokenPool)]
    });
    const collection = await Contracts.LiquidityPoolCollection.deploy(toAddress(network));

    await network.initializePendingWithdrawals(pendingWithdrawals.address);

    return { networkSettings, network, networkToken, vault, networkTokenPool, pendingWithdrawals, collection };
};
