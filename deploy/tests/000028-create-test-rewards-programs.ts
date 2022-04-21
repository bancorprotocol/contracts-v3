import { BancorNetworkInfo, IERC20, StandardRewards } from '../../components/Contracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts, isLive } from '../../utils/Deploy';
import { duration } from '../../utils/Time';
import { toWei } from '../../utils/Types';
import { expect } from 'chai';

const PROGRAM_DURATION = duration.weeks(4);
const TOTAL_REWARDS = toWei(40_000);

describeDeployment(
    __filename,
    () => {
        let testToken1: IERC20;
        let testToken2: IERC20;
        let networkInfo: BancorNetworkInfo;
        let standardRewards: StandardRewards;

        beforeEach(async () => {
            testToken1 = await DeployedContracts.TestToken1.deployed();
            testToken2 = await DeployedContracts.TestToken2.deployed();
            networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
            standardRewards = await DeployedContracts.StandardRewards.deployed();
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
        });
    },
    () => isLive()
);
