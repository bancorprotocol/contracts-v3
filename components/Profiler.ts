import { getTransactionGas } from '../test/helpers/Utils';
import { ContractTransaction } from 'ethers';
import { tenderly } from 'hardhat';
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

    static async persistArtifacts(contractName: string, address: string) {
        if (!isProfiling) {
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
