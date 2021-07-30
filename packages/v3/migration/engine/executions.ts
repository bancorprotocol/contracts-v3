import { ExecutionError } from './errors/errors';
import { executionSettings } from './initialization';
import { log } from './logger/logger';
import { ContractReceipt, ContractTransaction } from '@ethersproject/contracts';
import Contracts, { ContractBuilder, Contract } from 'components/Contracts';
import { BaseContract, ContractFactory, Overrides } from 'ethers';
import { ProxyAdmin } from 'typechain';

export const initExecutionFunctions = (contracts: typeof Contracts, executionSettings: executionSettings) => {
    const overrides: Overrides = {
        gasPrice: executionSettings.gasPrice
    };

    const deploy = async <F extends ContractFactory>(
        factory: ContractBuilder<F>,
        ...args: Parameters<ContractBuilder<F>['deploy']>
    ): Promise<ReturnType<ContractBuilder<F>['deploy']>> => {
        const contract = await factory.deploy(...([...args, overrides] as any));

        log.executingTx(`Deploying contract \${${factory.contractName}}`);
        log.executingTx(`Params: [${args}]`);
        log.normal(`Tx: `, contract.deployTransaction.hash);

        log.greyed(`Waiting to be mined...`);
        const receipt = await contract.deployTransaction.wait(executionSettings.confirmationToWait);

        if (receipt.status !== 1) {
            log.error(`Error while executing`);
            throw new ExecutionError(contract.deployTransaction, receipt);
        }

        log.success(`Deployed \${${factory.contractName}} at ${contract.address} 🚀 !`);
        return contract;
    };

    const execute = async <T extends (...args: any[]) => Promise<ContractTransaction>>(
        executionInstruction: string,
        func: T,
        ...args: Parameters<T>
    ): Promise<ContractReceipt> => {
        const tx = await func(...args, overrides);
        log.normal(executionInstruction);
        log.normal(`Executing tx: `, tx.hash);

        const receipt = await tx.wait(executionSettings.confirmationToWait);
        if (receipt.status !== 1) {
            log.error(`Error while executing`);
            throw new ExecutionError(tx, receipt);
        }

        log.success(`Executed ✨`);
        return receipt;
    };

    type initializeArgs = Parameters<any> | 'skipInit';
    const deployProxy = async <F extends ContractFactory>(
        admin: ProxyAdmin,
        logicContractToDeploy: ContractBuilder<F>,
        initializeArgs: initializeArgs,
        ...ctorArgs: Parameters<F['deploy']>
    ): Promise<Contract<F>> => {
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

        const logicContract = await deploy(logicContractToDeploy, ...ctorArgs);
        const proxy = await createTransparentProxy(admin, logicContract, initializeArgs);
        return await logicContractToDeploy.attach(proxy.address);
    };

    return {
        deploy,
        execute,
        deployProxy
    };
};
