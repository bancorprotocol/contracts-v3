import { deployExecuteType } from './executions';
import Contracts, { Contract, ContractBuilder } from 'components/Contracts';
import { BaseContract, ContractFactory } from 'ethers';
import { ProxyAdmin, TransparentUpgradeableProxy } from 'typechain';

export type proxyType = ReturnType<typeof initProxy>;

export type initializeArgs = Parameters<any> | 'skipInit';

export const initProxy = (contracts: typeof Contracts, { deploy }: deployExecuteType) => {
    const createTransparentProxy = async (
        admin: BaseContract,
        logicContract: BaseContract,
        initializeArgs: initializeArgs = []
    ) => {
        const data =
            initializeArgs === 'skipInit'
                ? []
                : logicContract.interface.encodeFunctionData('initialize', initializeArgs);

        return await deploy(contracts.TransparentUpgradeableProxy, logicContract.address, admin.address, data);
    };

    const createProxy = async <F extends ContractFactory>(
        admin: ProxyAdmin,
        logicContractToDeploy: ContractBuilder<F>,
        initializeArgs: initializeArgs,
        ...ctorArgs: Parameters<F['deploy']>
    ): Promise<Contract<F>> => {
        const logicContract = await deploy(logicContractToDeploy, ...ctorArgs);
        const proxy = await createTransparentProxy(admin, logicContract, initializeArgs);
        return await logicContractToDeploy.attach(proxy.address);
    };

    return { createProxy };
};
