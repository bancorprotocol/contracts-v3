import { StakingRewardsStore } from '../../components/LegacyContracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { duration } from '../../utils/Time';
import { PROGRAM_END_DELAY, PROGRAMS_POOL_TOKENS } from '..//scripts/000035-pause-legacy-programs';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describeDeployment(__filename, () => {
    let stakingRewardsStore: StakingRewardsStore;

    beforeEach(async () => {
        stakingRewardsStore = await DeployedContracts.StakingRewardsStore.deployed();
    });

    it('should pause legacy programs', async () => {
        const { timestamp: now } = await ethers.provider.getBlock('latest');

        for (const poolToken of PROGRAMS_POOL_TOKENS) {
            const program = await stakingRewardsStore.poolProgram(poolToken);
            const endTime = program[1];
            expect(endTime.toNumber()).to.be.closeTo(now + PROGRAM_END_DELAY, duration.minutes(5));
        }
    });
});
