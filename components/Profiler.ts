import { getTransactionGas } from '../test/helpers/Utils';
import Logger from '../utils/Logger';
import { ContractTransaction } from 'ethers';
import { mean } from 'lodash';

export const { PROFILE: isProfiling } = process.env;

export class Profiler {
    private summary: Record<string, number[]> = {};

    async profile(description: string, tx: Promise<ContractTransaction>) {
        const res = await tx;

        const gas = await getTransactionGas(res);
        Logger.log(`${description}: ${gas}`);

        this.summary[description] ||= [];

        this.summary[description].push(gas.toNumber());

        return res;
    }

    printSummary() {
        Logger.log();
        Logger.log('Summary:');

        for (const [desc, samples] of Object.entries(this.summary)) {
            Logger.log(`${desc},${mean(samples)}`);
        }
    }
}
