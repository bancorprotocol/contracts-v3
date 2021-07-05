import { ContractReceipt, ContractTransaction } from '@ethersproject/contracts';

export class ExecutionError extends Error {
    tx: ContractTransaction;
    receipt: ContractReceipt;

    constructor(tx: ContractTransaction, receipt: ContractReceipt) {
        super('Execution Error');
        this.receipt = receipt;
        this.tx = tx;
    }
}
