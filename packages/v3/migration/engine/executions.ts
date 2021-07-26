import { ExecutionError } from './errors/errors';
import { log } from './logger/logger';
import { executeOverride, executionConfig } from './task';
import { ContractReceipt, ContractTransaction } from '@ethersproject/contracts';
import { Contract } from 'ethers';

export type deployExecuteType = ReturnType<typeof initDeployExecute>;

export const initDeployExecute = (executionConfig: executionConfig, overrides: executeOverride) => {
    const deploy = async <C extends Contract, T extends (...args: any[]) => Promise<C>>(
        name: string,
        func: T,
        ...args: Parameters<T>
    ): Promise<ReturnType<T>> => {
        const contract = await func(...args, overrides);

        log.executingTx(`Deploying contract ${name}`);
        log.normal(`Tx: `, contract.deployTransaction.hash);

        log.greyed(`Waiting to be mined...`);
        const receipt = await contract.deployTransaction.wait(executionConfig.confirmationToWait);

        if (receipt.status !== 1) {
            log.error(`Error while executing`);
            throw new ExecutionError(contract.deployTransaction, receipt);
        }

        log.success(`Deployed ${name} at ${contract.address} 🚀 !`);
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
