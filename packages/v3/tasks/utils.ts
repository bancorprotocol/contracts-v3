import fs from 'fs';
import path from 'path';
import hre from 'hardhat';
import { Contract } from 'components/Contracts';
import { ContractReceipt, ContractTransaction } from '@ethersproject/contracts';
import { executionConfig } from 'components/Tasks';

export type deployFct = <C extends Contract>(name: string, toDeployContract: Promise<C>) => Promise<C>;
export type executeFct = (
    executionInstruction: string,
    txExecution: Promise<ContractTransaction>
) => Promise<ContractReceipt>;

export class executionError extends Error {
    tx: ContractTransaction;
    receipt: ContractReceipt;

    constructor(tx: ContractTransaction, receipt: ContractReceipt) {
        super('Execution Error');
        this.receipt = receipt;
        this.tx = tx;
    }
}

let currentExecutionType: string;
let currentExecutionTime: string;

export const startExecutionLog = (type: string) => {
    currentExecutionType = type;
    currentExecutionTime = Date.now().toString();
};

// Advanced
export const deploy = async <C extends Contract, T extends (...args: any[]) => Promise<C>>(
    name: string,
    executionConfig: executionConfig,
    func: T,
    ...args: Parameters<T>
): Promise<ReturnType<T>> => {
    const contract = await func(...args);
    console.log(`Deploying contract ${name} (${contract.__contractName__})`);
    console.log('Tx: ', contract.deployTransaction.hash);

    console.log('Waiting to be mined ...');
    const receipt = await contract.deployTransaction.wait(executionConfig.confirmationToWait);

    if (receipt.status !== 1) {
        throw new executionError(contract.deployTransaction, receipt);
    }

    console.log(`Deployed at ${contract.address} 🚀 `);
    await saveHistory({
        type: 'DEPLOY',
        contractName: name,
        contractType: contract.__contractName__,
        tx: contract.deployTransaction.hash,
        params: args
    });
    return contract;
};

export const execute = async <T extends (...args: any[]) => Promise<ContractTransaction>>(
    executionInstruction: string,
    executionConfig: executionConfig,
    func: T,
    ...args: Parameters<T>
): Promise<ContractReceipt> => {
    const tx = await func(...args);
    console.log('Executing tx: ', tx.hash);

    const receipt = await tx.wait(executionConfig.confirmationToWait);
    if (receipt.status !== 1) {
        throw new executionError(tx, receipt);
    }

    console.log('Executed ✨');
    await saveHistory({
        type: 'EXECUTE',
        execution: executionInstruction,
        tx: tx.hash
    });
    return receipt;
};

// File management
export const saveSystem = async (obj: Object, freshStart = false) => {
    await fs.promises.writeFile(
        path.join(hre.config.paths.root, './deployments/', hre.network.name, 'system.json'),
        JSON.stringify(obj, null, 4)
    );
};

type executionHeader = {
    type: string;
    startTime: string;
    history: [executeLog | deployLog];
};

type executeLog = {
    type: 'EXECUTE';

    execution: string;
    tx: string;
};

type deployLog = {
    type: 'DEPLOY';

    contractName: string;
    contractType: string;
    tx: string;
    params: any[];
};

type executions = { [name: string]: executionHeader };

export const saveHistory = async (obj: executeLog | deployLog) => {
    const pathToHistory = path.join(hre.config.paths.root, './deployments/', hre.network.name, 'history.json');

    // Try to open history file
    try {
        const existingHistory = JSON.parse(fs.readFileSync(pathToHistory, 'utf8')) as executions;

        // Try to append history to an existing one
        try {
            existingHistory[currentExecutionTime].history.push(obj);
        } catch {
            // If it doesn't exist, create a newHistory and append it to the file
            const newHistory: executionHeader = {
                type: currentExecutionType,
                startTime: new Date(Number(currentExecutionTime)).toUTCString(),
                history: [obj]
            };
            // ReWriteHistory in order for the new executions to appear on top of the file
            let reWriteHistory: executions = {};
            reWriteHistory[currentExecutionTime] = newHistory;
            reWriteHistory = { ...reWriteHistory, ...existingHistory };
            await fs.promises.writeFile(pathToHistory, JSON.stringify(reWriteHistory, null, 4));
            return;
        }
        await fs.promises.writeFile(pathToHistory, JSON.stringify(existingHistory, null, 4));
    } catch {
        // If file not created, create one
        const newHistory: executions = {};
        newHistory[currentExecutionTime] = {
            type: currentExecutionType,
            startTime: new Date(Number(currentExecutionTime)).toUTCString(),
            history: [obj]
        };
        await fs.promises.writeFile(pathToHistory, JSON.stringify(newHistory, null, 4));
    }
};
