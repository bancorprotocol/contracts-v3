import Contracts, { ContractBuilder, Contract } from '../../components/Contracts';
import { ProxyAdmin } from '../../typechain';
import { ExecutionError } from './errors';
import { executionSettings } from './initialization';
import { log } from './logger';
import { ContractReceipt, ContractTransaction } from '@ethersproject/contracts';
import { ContractFactory, Overrides } from 'ethers';

export const initExecutionFunctions = (contracts: typeof Contracts, executionSettings: executionSettings) => {
    const overrides: Overrides = {
        gasPrice: executionSettings.gasPrice
    };

    const deploy = async <F extends ContractFactory>(
        factory: ContractBuilder<F>,
        ...args: Parameters<ContractBuilder<F>['deploy']>
    ): Promise<ReturnType<ContractBuilder<F>['deploy']>> => {
        log.basicExecutionHeader('Deploying', `${factory.contractName} 🚀 `, args);

        const contract = await factory.deploy(...([...args, overrides] as any));

        log.debug(`Deployment Tx: `, contract.deployTransaction.hash);
        log.greyed(`Waiting to be mined...`);

        const receipt = await contract.deployTransaction.wait(executionSettings.confirmationToWait);
        if (receipt.status !== 1) {
            log.error(`Error while executing`);
            throw new ExecutionError(contract.deployTransaction, receipt);
        }

        log.success(`Deployed ${factory.contractName} at ${contract.address} 🚀 !`);
        return contract;
    };

    const execute = async <T extends (...args: any[]) => Promise<ContractTransaction>>(
        executionInstruction: string,
        func: T,
        ...args: Parameters<T>
    ): Promise<ContractReceipt> => {
        log.basicExecutionHeader('Executing', executionInstruction, args);

        const tx = await func(...args, overrides);
        log.debug(`Executing tx: `, tx.hash);

        const receipt = await tx.wait(executionSettings.confirmationToWait);
        if (receipt.status !== 1) {
            log.error(`Error while executing`);
            throw new ExecutionError(tx, receipt);
        }

        log.success(`Executed ✨`);
        return receipt;
    };

    type initializeArgs = Parameters<any> | 'skipInit';
    type proxy<F extends ContractFactory> = { proxy: Contract<F>; logicContractAddress: string };
    const deployProxy = async <F extends ContractFactory>(
        admin: ProxyAdmin,
        logicContractToDeploy: ContractBuilder<F>,
        initializeArgs: initializeArgs,
        ...ctorArgs: Parameters<F['deploy']>
    ): Promise<proxy<F>> => {
        log.debug('Deploying proxy');
        const logicContract = await deploy(logicContractToDeploy, ...ctorArgs);

        const data =
            initializeArgs === 'skipInit'
                ? []
                : logicContract.interface.encodeFunctionData('initialize', initializeArgs);

        const proxy = await deploy(contracts.TransparentUpgradeableProxy, logicContract.address, admin.address, data);

        log.success('Proxy deployed 🚀 ');
        return {
            proxy: await logicContractToDeploy.attach(proxy.address),
            logicContractAddress: logicContract.address
        };
    };

    const upgradeProxy = async <F extends ContractFactory>(
        admin: ProxyAdmin,
        logicContractToDeploy: ContractBuilder<F>,
        proxyAddress: string,
        initializeArgs:
            | {
                  params: Parameters<any>;
                  initializeFctName: string;
              }
            | 'skipInit',
        ...ctorArgs: Parameters<F['deploy']>
    ): Promise<proxy<F>> => {
        log.debug('Upgrading proxy');
        const newLogicContract = await deploy(logicContractToDeploy, ...ctorArgs);

        const data =
            initializeArgs === 'skipInit'
                ? []
                : newLogicContract.interface.encodeFunctionData(
                      initializeArgs.initializeFctName,
                      initializeArgs.params
                  );

        if (initializeArgs === 'skipInit')
            await execute('Upgrading proxy', admin.upgrade, proxyAddress, newLogicContract.address);
        else
            await execute(
                `Upgrading proxy and call ${initializeArgs.initializeFctName}`,
                admin.upgradeAndCall,
                proxyAddress,
                newLogicContract.address,
                data
            );

        log.success('Proxy upgraded 🚀 ');
        return {
            proxy: await logicContractToDeploy.attach(proxyAddress),
            logicContractAddress: newLogicContract.address
        };
    };

    return {
        deploy,
        execute,
        deployProxy,
        upgradeProxy
    };
};
