import { BancorNetworkInfo, StandardStakingRewards } from '../../components/Contracts';
import { BNT } from '../../components/LegacyContracts';
import { DeployedContracts } from '../../utils/Deploy';
import { duration } from '../../utils/Time';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

// TODO: make sure to update the starting time of all beta programs
const PROGRAM_DURATION = duration.weeks(4);
const TOTAL_REWARDS = toWei(40_000);

describeDeployment(__filename, () => {
    let bnt: BNT;
    let networkInfo: BancorNetworkInfo;
    let standardStakingRewards: StandardStakingRewards;

    beforeEach(async () => {
        bnt = await DeployedContracts.BNT.deployed();
        networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
        standardStakingRewards = await DeployedContracts.StandardStakingRewards.deployed();
    });

    it('should create beta standard staking rewards programs', async () => {
        const { dai, link } = await getNamedAccounts();

        for (const pool of [bnt.address, NATIVE_TOKEN_ADDRESS, dai, link]) {
            const id = await standardStakingRewards.latestProgramId(pool);

            expect(await standardStakingRewards.isProgramActive(id)).to.be.false;
            expect(await standardStakingRewards.isProgramEnabled(id)).to.be.true;

            const programs = await standardStakingRewards.programs([id]);
            const program = programs[0];

            expect(program.id).to.equal(id);
            expect(program.pool).to.equal(pool);
            expect(program.poolToken).to.equal(await networkInfo.poolToken(pool));
            expect(program.rewardsToken).to.equal(bnt.address);
            expect(program.endTime).to.equal(program.startTime + PROGRAM_DURATION);
            expect(program.rewardRate).to.equal(TOTAL_REWARDS.div(program.endTime - program.startTime));
        }
    });
});
