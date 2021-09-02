import { executionSettings } from './initialization';
import chalk from 'chalk';

export const palette = {
    white: (...str: string[]) => console.log(`${str}`),
    magenta: (...str: string[]) => console.log(chalk.magenta(`${str}`)),
    yellow: (...str: string[]) => console.log(chalk.yellow(`${str}`))
};

export const log = {
    // basic logging
    warning: (...str: string[]) => console.log(chalk.cyanBright(`⚠️  ${str}`)),
    info: (...str: string[]) => console.log(chalk.rgb(0, 0, 0).bgWhiteBright(`\n${str}`)),
    done: (...str: string[]) => console.log(chalk.yellowBright(...str)),
    //
    debug: (...str: string[]) => console.log(chalk.rgb(123, 104, 238).italic(...str)),
    //
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
    //
    greyed: (...str: string[]) => console.log(chalk.grey(...str)),
    success: (...str: string[]) => console.log(chalk.greenBright(...str)),
    error: (...str: string[]) => console.log(chalk.red(`⛔️ ${str}`)),

    // specific logging
    migrationConfig: (
        signerAddress: string,
        networkName: string,
        isLedger: boolean,
        executionSettings: executionSettings
    ) => {
        palette.yellow(`**********************`);
        palette.yellow(`** Migration Config **`);
        palette.yellow(`**********************`);

        palette.yellow(`Basic info`);
        palette.white(`        Network: ${networkName}`);
        palette.white(`        Signer: ${signerAddress} ${isLedger ? '(ledger)' : ''}`);
        palette.yellow(`Overrides:`);
        palette.white(`        GasPrice: ${executionSettings.gasPrice} (gwei)`);
        palette.yellow(`Execution Setting:`);
        palette.white(`        Confirmation to wait: ${executionSettings.confirmationToWait}`);
        palette.yellow(`********************`);
    }
};
