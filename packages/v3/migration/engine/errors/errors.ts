import { ContractReceipt, ContractTransaction } from '@ethersproject/contracts';

export class ExecutionError extends Error {
    tx: ContractTransaction;
    receipt: ContractReceipt;

    constructor(tx: ContractTransaction, receipt: ContractReceipt) {
        super('Execution Error');
        this.receipt = receipt;
        this.tx = tx;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ExecutionError);
        }
    }
}

export class MigrationError extends Error {
    constructor(msg: string) {
        super('Migration Error: ' + msg);
    }
}

export class InvalidRole extends MigrationError {
    constructor() {
        super('Invalid role');
    }
}

export class InvalidOwner extends MigrationError {
    constructor() {
        super('Owner not set or correct');
    }
}
