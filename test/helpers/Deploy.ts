import { deploymentMetadata, deploymentTagExists, isLive, isMainnetFork } from '../../utils/Deploy';
import { deployments, ethers, getNamedAccounts, network } from 'hardhat';
import { Suite } from 'mocha';

const { run } = deployments;

export const performTestDeployment = async (tag: string) => {
    if (isLive()) {
        throw new Error('Unsupported network');
    }

    await cleanupTestDeployment();

    return run(tag, { resetMemory: false, deletePreviousDeployments: !isMainnetFork() });
};

const { ETHEREUM_PROVIDER_URL = '' } = process.env;
let forkBlockNumber: number;

export const cleanupTestDeployment = async () => {
    // if we're running the tests on a mainnet fork, ensure that the fork is reset between every run of the suite
    if (!isMainnetFork()) {
        return;
    }

    if (!forkBlockNumber) {
        forkBlockNumber = await ethers.provider.getBlockNumber();
    }

    await network.provider.request({
        method: 'hardhat_reset',
        params: [
            {
                forking: {
                    jsonRpcUrl: ETHEREUM_PROVIDER_URL,
                    blockNumber: forkBlockNumber
                }
            }
        ]
    });

    // re-impersonate all named accounts
    const namedAccounts = Object.values(await getNamedAccounts());
    for (const account of namedAccounts) {
        await network.provider.request({
            method: 'hardhat_impersonateAccount',
            params: [account]
        });
    }
};

export const describeDeployment = async (
    filename: string,
    fn: (this: Suite) => void,
    skip: () => boolean = () => false
): Promise<Suite | void> => {
    const { id, tag } = deploymentMetadata(filename);

    // if we're running against a mainnet fork, ensure to skip tests for already existing deployments
    if (skip() || (isMainnetFork() && (await deploymentTagExists(tag)))) {
        return describe.skip(id, fn);
    }

    return describe(id, async function (this: Suite) {
        beforeEach(async () => {
            await performTestDeployment(tag);
        });

        fn.apply(this);
    });
};
