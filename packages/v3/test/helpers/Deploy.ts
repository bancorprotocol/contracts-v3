import { isMainnetFork, isLive, deploymentExists } from '../../utils/Deploy';
import { deployments } from 'hardhat';
import { Suite } from 'mocha';

const { run } = deployments;

export const performTestDeployment = async (tag: string) => {
    if (isLive()) {
        throw new Error('Unsupported network');
    }

    return run(tag, { resetMemory: false, deletePreviousDeployments: true });
};

export const describeDeployment = async (
    title: string,
    tag: string,
    fn: (this: Suite) => void
): Promise<Suite | void> => {
    // if we're running against a mainnet fork, ensure to skip tests for already existing deployments
    if (isMainnetFork() && (await deploymentExists(tag))) {
        return describe.skip(title, fn);
    }

    return describe(title, async function (this: Suite) {
        beforeEach(async () => {
            await performTestDeployment(tag);
        });

        fn.apply(this);
    });
};
