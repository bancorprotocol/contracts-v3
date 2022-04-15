import { AutoCompoundingRewards, BancorNetworkInfo, IERC20, StandardRewards } from '../../components/Contracts';
import { RewardsDistributionType } from '../../utils/Constants';
import { DeployedContracts } from '../../utils/Deploy';
import { duration } from '../../utils/Time';
import { toWei } from '../../utils/Types';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';

const PROGRAM_DURATION = duration.weeks(4);
const TOTAL_REWARDS = toWei(40_000);

describeDeployment(__filename, () => {
    let testToken1: IERC20;
    let testToken2: IERC20;
    let testToken5: IERC20;
    let networkInfo: BancorNetworkInfo;
    let standardRewards: StandardRewards;
    let autoCompoundingRewards: AutoCompoundingRewards;

    beforeEach(async () => {
        testToken1 = await DeployedContracts.TestToken1.deployed();
        testToken2 = await DeployedContracts.TestToken2.deployed();
        testToken5 = await DeployedContracts.TestToken5.deployed();
        networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
        standardRewards = await DeployedContracts.StandardRewards.deployed();
        autoCompoundingRewards = await DeployedContracts.AutoCompoundingRewards.deployed();
    });

    it('should create test rewards programs', async () => {
        const id = await standardRewards.latestProgramId(testToken1.address);
        expect(await standardRewards.isProgramActive(id)).to.be.false;
        expect(await standardRewards.isProgramEnabled(id)).to.be.true;

        const programs = await standardRewards.programs([id]);
        const standardProgram = programs[0];
        expect(standardProgram.id).to.equal(id);
        expect(standardProgram.pool).to.equal(testToken1.address);
        expect(standardProgram.poolToken).to.equal(await networkInfo.poolToken(testToken1.address));
        expect(standardProgram.rewardsToken).to.equal(testToken2.address);
        expect(standardProgram.endTime).to.equal(standardProgram.startTime + PROGRAM_DURATION);
        expect(standardProgram.rewardRate).to.equal(
            TOTAL_REWARDS.div(standardProgram.endTime - standardProgram.startTime)
        );

        const autoCompoundingProgram = await autoCompoundingRewards.program(testToken5.address);
        expect(await standardRewards.isProgramActive(testToken5.address)).to.be.false;
        expect(autoCompoundingProgram.poolToken).to.equal(await networkInfo.poolToken(testToken5.address));
        expect(autoCompoundingProgram.distributionType).to.equal(RewardsDistributionType.ExponentialDecay);
        expect(autoCompoundingProgram.totalRewards).to.equal(TOTAL_REWARDS);
        expect(autoCompoundingProgram.remainingRewards).to.equal(TOTAL_REWARDS);
        expect(autoCompoundingProgram.startTime).to.be.gt(0);
        expect(autoCompoundingProgram.endTime).to.equal(0);
    });
});
