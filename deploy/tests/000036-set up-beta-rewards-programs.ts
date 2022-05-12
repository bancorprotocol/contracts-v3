import { BancorNetworkInfo, StandardRewards } from '../../components/Contracts';
import { BNT } from '../../components/LegacyContracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { increaseTime } from '../../test/helpers/Time';
import { DeployedContracts } from '../../utils/Deploy';
import { duration } from '../../utils/Time';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers, getNamedAccounts } from 'hardhat';

const PROGRAM_START_DELAY = duration.minutes(10);
const PROGRAM_DURATION = duration.days(30);

const prevIds: Record<string, BigNumber> = {};

const savePreviousProgramData = async () => {
    const bnt = await DeployedContracts.BNT.deployed();
    const standardRewards = await DeployedContracts.StandardRewards.deployed();

    const { dai, link } = await getNamedAccounts();

    for (const pool of [bnt.address, NATIVE_TOKEN_ADDRESS, dai, link]) {
        prevIds[pool] = await standardRewards.latestProgramId(pool);
    }
};

describeDeployment(
    __filename,
    () => {
        let bnt: BNT;
        let networkInfo: BancorNetworkInfo;
        let standardRewards: StandardRewards;

        beforeEach(async () => {
            bnt = await DeployedContracts.BNT.deployed();
            networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
            standardRewards = await DeployedContracts.StandardRewards.deployed();
        });

        it('should terminate the beta reward programs and create launch reward programs', async () => {
            const { dai, link } = await getNamedAccounts();

            const programRewards = {
                [bnt.address]: toWei(35_000),
                [NATIVE_TOKEN_ADDRESS]: toWei(100_000),
                [dai]: toWei(35_000),
                [link]: toWei(35_000)
            };

            const { timestamp: now } = await ethers.provider.getBlock('latest');

            await increaseTime(PROGRAM_START_DELAY + duration.minutes(10));

            for (const pool of [bnt.address, NATIVE_TOKEN_ADDRESS, dai, link]) {
                const prevId = prevIds[pool];
                expect(await standardRewards.isProgramActive(prevId)).to.be.false;

                const currId = await standardRewards.latestProgramId(pool);
                expect(currId).not.to.equal(prevId);

                expect(await standardRewards.isProgramActive(currId)).to.be.true;

                const programs = await standardRewards.programs([currId]);
                const program = programs[0];

                expect(program.id).to.equal(currId);
                expect(program.pool).to.equal(pool);
                expect(program.poolToken).to.equal(await networkInfo.poolToken(pool));
                expect(program.rewardsToken).to.equal(bnt.address);

                expect(program.startTime).to.be.closeTo(now + PROGRAM_START_DELAY, duration.minutes(5));
                expect(program.endTime).to.equal(program.startTime + PROGRAM_DURATION);
                expect(program.rewardRate).to.equal(programRewards[pool].div(program.endTime - program.startTime));
            }
        });
    },
    { beforeDeployments: savePreviousProgramData }
);
