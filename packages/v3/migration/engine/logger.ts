import chalk from 'chalk';

export const log = {
    info: (str: string) => console.log(chalk.cyanBright`⚠️  ${str}`),
    done: (str: string) => console.log(chalk.bold.yellowBright`${str}`),
    executing: (str: string) => console.log(chalk.bold.blue`${str}`),
    executingTx: (str: string) => console.log(chalk.bold.yellow`${str}`),
    greyed: (str: string) => console.log(chalk.grey`${str}`),
    success: (str: string) => console.log(chalk.bold.greenBright`${str}`),
    error: (str: string) => console.log(chalk.bold.red`⛔️  ${str}`)
};
