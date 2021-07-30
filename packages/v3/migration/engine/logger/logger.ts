import { executionSettings } from '../initialization';
import chalk from 'chalk';

export const palette = {
    white: (...str: string[]) => console.log(`${str}`),
    magenta: (...str: string[]) => console.log(chalk.magenta(`${str}`)),
    yellow: (...str: string[]) => console.log(chalk.yellow(`${str}`))
};

export const log = {
    // Basic logging
    normal: (...str: string[]) => console.log(...str),
    info: (...str: string[]) => console.log(chalk.cyanBright(`⚠️  ${str}`)),
    done: (...str: string[]) => console.log(chalk.yellowBright(`${str}`)),
    executing: (...str: string[]) => console.log(chalk.blue(`${str}`)),
    executingTx: (...str: string[]) => console.log(chalk.yellow(`${str}`)),
    greyed: (...str: string[]) => console.log(chalk.grey(`${str}`)),
    success: (...str: string[]) => console.log(chalk.greenBright(`${str}`)),
    error: (...str: string[]) => console.log(chalk.red(`⛔️ ${str}`)),

    // Specific logging
    migrationConfig: (signerAddress: string, isLedger: boolean, executionSettings: executionSettings) => {
        palette.yellow(`**********************`);
        palette.yellow(`** Migration Config **`);
        palette.yellow(`**********************`);

        palette.yellow(`Basic info`);
        palette.white(`        Signer: ${signerAddress} ${isLedger ? '(ledger)' : ''}`);
        palette.yellow(`Overrides:`);
        palette.white(`        GasPrice: ${executionSettings.gasPrice} (gwei)`);
        palette.yellow(`Execution Config:`);
        palette.white(`        Confirmation to wait: ${executionSettings.confirmationToWait}`);
        palette.yellow(`********************`);
    }
};
