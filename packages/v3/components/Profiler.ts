import { getTransactionGas } from '../test/helpers/Utils';
import { ContractTransaction } from 'ethers';
import { tenderly } from 'hardhat';
import { mean } from 'lodash';
import prompt from 'prompt';

export const { PROFILE: isProfiling, DEBUG: isDebugging } = process.env;

export class Profiler {
    private summary: Record<string, number[]> = {};

    constructor() {
        if (isDebugging) {
            prompt.start();
        }
    }

    async profile(description: string, tx: Promise<ContractTransaction>) {
        if (isDebugging) {
            await prompt.get([`${description}`]);
        }

        const res = await tx;

        const gas = await getTransactionGas(res);
        console.log(`${description}: ${gas}`);

        if (isDebugging) {
            console.log(`   ${(await res.wait()).transactionHash}`);
            await prompt.get(['Press any key to continue to the next test']);
        }

        if (this.summary[description] === undefined) {
            this.summary[description] = [];
        }

        this.summary[description].push(gas.toNumber());

        return res;
    }

    static async persistArtifacts(contractName: string, address: string) {
        if (!isProfiling || !isDebugging) {
            return;
        }

        console.log('Persisting', contractName, address);

        return tenderly.persistArtifacts({
            name: contractName,
            address
        });
    }

    printSummary() {
        console.log();
        console.log('Summary:');

        for (const [desc, samples] of Object.entries(this.summary)) {
            console.log(`${desc},${mean(samples)}`);
        }
    }
}
