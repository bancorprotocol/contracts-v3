import { ExecutionError } from './errors/errors';
import { log } from './logger/logger';
import { executeOverride, executionConfig } from './task';
import { ContractReceipt, ContractTransaction } from '@ethersproject/contracts';
import { ContractBuilder, Contract } from 'components/Contracts';
import { ContractFactory } from 'ethers';

export type deployExecuteType = ReturnType<typeof initDeployExecute>;

export const initDeployExecute = (executionConfig: executionConfig, overrides: executeOverride) => {
    const deploy = async <F extends ContractFactory, T extends (...args: any[]) => Promise<Contract<F>>>(
        factory: ContractBuilder<F>,
        ...args: Parameters<ContractBuilder<F>['deploy']>
    ): Promise<ReturnType<T>> => {
        const contract = await factory.deploy(...([...args, overrides] as any));

        log.executingTx(`Deploying contract \${${factory.contractName}}`);
        log.normal(`Tx: `, contract.deployTransaction.hash);

        log.greyed(`Waiting to be mined...`);
        const receipt = await contract.deployTransaction.wait(executionConfig.confirmationToWait);

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

        const receipt = await tx.wait(executionConfig.confirmationToWait);
        if (receipt.status !== 1) {
            log.error(`Error while executing`);
            throw new ExecutionError(tx, receipt);
        }

        log.success(`Executed ✨`);
        return receipt;
    };

    return {
        deploy,
        execute
    };
};
