import { executeOverride, executionConfig } from '../task';
import chalk from 'chalk';

export const palette = {
    white: (...str: string[]) => console.log(`${str}`),
    magenta: (...str: string[]) => console.log(chalk.magenta`${str}`),
    yellow: (...str: string[]) => console.log(chalk.yellow`${str}`)
};

export const log = {
    // Basic logging
    normal: (...str: string[]) => console.log(...str),
    info: (str: string) => console.log(chalk.cyanBright`⚠️  ${str}`),
    done: (str: string) => console.log(chalk.yellowBright`${str}`),
    executing: (str: string) => console.log(chalk.blue`${str}`),
    executingTx: (str: string) => console.log(chalk.yellow`${str}`),
    greyed: (str: string) => console.log(chalk.grey`${str}`),
    success: (str: string) => console.log(chalk.greenBright`${str}`),
    error: (str: string) => console.log(chalk.red`⛔️  ${str}`),

    // Specific logging
    defaultParams: (signerAddress: string, overrides: executeOverride, executionConfig: executionConfig) => {
        palette.yellow(`********************`);
        palette.yellow(`** Default Params **`);
        palette.yellow(`********************`);

        palette.yellow(`Basic info`);
        palette.white(`        Signer: ${signerAddress}`);
        palette.yellow(`Overrides:`);
        palette.white(`        GasPrice: ${overrides.gasPrice} (gwei)`);
        palette.yellow(`Execution Config:`);
        palette.white(`        Confirmation to wait: ${executionConfig.confirmationToWait}`);
        palette.yellow(`********************`);
    }
};
