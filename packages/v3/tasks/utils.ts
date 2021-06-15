import fs from 'fs';
import path from 'path';
import hre from 'hardhat';
import { Contract } from 'components/Contracts';
import { ContractReceipt, ContractTransaction } from '@ethersproject/contracts';

export type deployFct = <C extends Contract>(name: string, toDeployContract: Promise<C>) => Promise<C>;
export type executeFct = (txExecution: Promise<ContractTransaction>) => Promise<ContractReceipt>;

export class executionError extends Error {
    tx: ContractTransaction;
    receipt: ContractReceipt;

    constructor(tx: ContractTransaction, receipt: ContractReceipt) {
        super('Execution Error');
        this.receipt = receipt;
        this.tx = tx;
    }
}

// Advanced
export const deploy: deployFct = async <C extends Contract>(name: string, toDeployContract: Promise<C>): Promise<C> => {
    const contract = await toDeployContract;
    console.log(`Deploying contract ${name} (${contract.__contractName__})`);
    console.log('Tx: ', contract.deployTransaction.hash);

    console.log('Waiting to be mined ...');
    const receipt = await contract.deployTransaction.wait();

    if (receipt.status !== 1) {
        throw new executionError(contract.deployTransaction, receipt);
    }

    console.log(`Deployed at ${contract.address} 🚀 `);
    return contract;
};

export const execute: executeFct = async (txExecution: Promise<ContractTransaction>): Promise<ContractReceipt> => {
    const tx = await txExecution;
    console.log('Executing tx: ', tx.hash);

    const receipt = await tx.wait();

    if (receipt.status !== 1) {
        throw new executionError(tx, receipt);
    }

    console.log('Executed ✨');
    return receipt;
};

// File management
export const saveConfig = async (fileName: string, obj: Object) => {
    await fs.promises.writeFile(
        path.join(hre.config.paths.root, './deployments-data/', fileName + '.' + hre.network.name + '.json'),
        JSON.stringify(obj, null, 4)
    );
};

export const loadConfig = async <C>(path: string): Promise<C> => {
    return JSON.parse(fs.readFileSync(path, 'utf8')) as C;
};
