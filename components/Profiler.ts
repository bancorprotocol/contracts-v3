import { getTransactionGas } from '../test/helpers/Utils';
import { ContractTransaction } from 'ethers';
import { mean } from 'lodash';

export const { PROFILE: isProfiling } = process.env;

export class Profiler {
    private summary: Record<string, number[]> = {};

    async profile(description: string, tx: Promise<ContractTransaction>) {
        const res = await tx;

        const gas = await getTransactionGas(res);
        console.log(`${description}: ${gas}`);

        this.summary[description] ||= [];

        this.summary[description].push(gas.toNumber());

        return res;
    }

    printSummary() {
        console.log();
        console.log('Summary:');

        for (const [desc, samples] of Object.entries(this.summary)) {
            console.log(`${desc},${mean(samples)}`);
        }
    }
}
