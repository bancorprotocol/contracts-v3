import { BancorNetworkInfo, StandardRewards } from '../../components/Contracts';
import { BNT } from '../../components/LegacyContracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { duration } from '../../utils/Time';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

const PROGRAM_DURATION = duration.weeks(4);
const TOTAL_REWARDS = toWei(44_500);

describeDeployment(__filename, () => {
    let bnt: BNT;
    let networkInfo: BancorNetworkInfo;
    let standardRewards: StandardRewards;

    beforeEach(async () => {
        bnt = await DeployedContracts.BNT.deployed();
        networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
        standardRewards = await DeployedContracts.StandardRewards.deployed();
    });

    it('should create beta standard rewards programs', async () => {
        const { dai, link } = await getNamedAccounts();

        for (const pool of [bnt.address, NATIVE_TOKEN_ADDRESS, dai, link]) {
            const id = await standardRewards.latestProgramId(pool);

            expect(await standardRewards.isProgramActive(id)).to.be.false;
            expect(await standardRewards.isProgramEnabled(id)).to.be.true;

            const programs = await standardRewards.programs([id]);
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
