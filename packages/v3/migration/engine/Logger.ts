import chalk from 'chalk';
import { Overrides } from 'ethers';
import { test } from '.';
import { Engine } from './Engine';
import { ExecutionSettings } from './Types';

// in order to prevent printing in tests
const customConsole = {
    log: (text: any) => {
        if (!test) {
            console.log(text);
        }
    }
};

export const palette = {
    white: (...str: string[]) => customConsole.log(`${str}`),
    magenta: (...str: string[]) => customConsole.log(chalk.magenta(`${str}`)),
    yellow: (...str: string[]) => customConsole.log(chalk.yellow(`${str}`))
};

export const log = {
    warning: (...str: string[]) => customConsole.log(chalk.cyanBright(`⚠️  ${str}`)),
    info: (...str: string[]) => customConsole.log(chalk.rgb(0, 0, 0).bgWhiteBright(`\n${str}`)),
    done: (...str: string[]) => customConsole.log(chalk.yellowBright(...str)),
    debug: (...str: string[]) => customConsole.log(chalk.rgb(123, 104, 238).italic(...str)),

    basicExecutionHeader: (head: string, body: string, args: any[]) => {
        let space = '  ';
        for (let i = 0; i < head.length; i++) space += ' ';

        return customConsole.log(
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

    greyed: (...str: string[]) => customConsole.log(chalk.grey(...str)),
    success: (...str: string[]) => customConsole.log(chalk.greenBright(...str)),
    error: (...str: string[]) => customConsole.log(chalk.red(`⛔️ ${str}`)),

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
