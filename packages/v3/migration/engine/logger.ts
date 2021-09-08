import { Engine } from './engine';
import { ExecutionSettings } from './types';
import chalk from 'chalk';
import { Overrides } from 'ethers';

export const palette = {
    white: (...str: string[]) => console.log(`${str}`),
    magenta: (...str: string[]) => console.log(chalk.magenta(`${str}`)),
    yellow: (...str: string[]) => console.log(chalk.yellow(`${str}`))
};

export const log = {
    warning: (...str: string[]) => console.log(chalk.cyanBright(`⚠️  ${str}`)),
    info: (...str: string[]) => console.log(chalk.rgb(0, 0, 0).bgWhiteBright(`\n${str}`)),
    done: (...str: string[]) => console.log(chalk.yellowBright(...str)),
    debug: (...str: string[]) => console.log(chalk.rgb(123, 104, 238).italic(...str)),

    basicExecutionHeader: (head: string, body: string, args: any[]) => {
        let space = '  ';
        for (let i = 0; i < head.length; i++) space += ' ';

        return console.log(
            chalk.underline.rgb(
                255,
                165,
                51
            )(
                `${head}:` +
                    chalk.reset(` `) +
                    chalk.reset.bold.rgb(255, 215, 51)(`${body}` + `\n${space}Params: [${args}]`)
            )
        );
    },

    greyed: (...str: string[]) => console.log(chalk.grey(...str)),
    success: (...str: string[]) => console.log(chalk.greenBright(...str)),
    error: (...str: string[]) => console.log(chalk.red(`⛔️ ${str}`)),

    migrationConfig: (
        signerAddress: string,
        isLedger: boolean,
        networkConfig: typeof Engine.prototype.networkSettings,
        executionSettings: ExecutionSettings,
        overrides: Overrides
    ) => {
        palette.yellow(`**********************`);
        palette.yellow(`** Migration Config **`);
        palette.yellow(`**********************`);

        palette.yellow(`Basic info`);
        palette.white(`        Signer: ${signerAddress} ${isLedger ? '(ledger)' : ''}`);
        palette.yellow(`Network info`);
        palette.white(`        Network: ${networkConfig.networkName}`);
        palette.yellow(`Overrides:`);
        palette.white(`        GasPrice: ${overrides.gasPrice} (gwei)`);
        palette.yellow(`Execution Setting:`);
        palette.white(`        Confirmation to wait: ${executionSettings.confirmationToWait}`);
        palette.yellow(`********************`);
    }
};
