import Contracts, { Contract, ContractBuilder } from 'components/Contracts';
import { BaseContract, ContractFactory } from 'ethers';
import { ProxyAdmin, TransparentUpgradeableProxy } from 'typechain';
import { deployExecuteType } from './executions';

export type proxyType = ReturnType<typeof initProxy>;

export const initProxy = (contracts: typeof Contracts, { deploy, execute }: deployExecuteType) => {
    const createTransparentProxy = async (admin: BaseContract, logicContract: BaseContract) => {
        return await deploy(
            'Deploying Upgradeable Proxy',
            contracts.TransparentUpgradeableProxy.deploy,
            logicContract.address,
            admin.address,
            []
        );
    };

    const createProxy = async <F extends ContractFactory>(
        admin: ProxyAdmin,
        logicContractToDeploy: ContractBuilder<F>,
        ...ctorArgs: Parameters<F['deploy']>
    ): Promise<Contract<F> & { asProxy: TransparentUpgradeableProxy }> => {
        const logicContract = await deploy(
            'Deploying Logic contract',
            logicContractToDeploy.deploy as any,
            ...ctorArgs
        );
        const proxy = await createTransparentProxy(admin, logicContract);

        return {
            ...(await logicContractToDeploy.attach(proxy.address)),
            asProxy: await contracts.TransparentUpgradeableProxy.attach(proxy.address)
        };
    };

    return { createProxy };
};
