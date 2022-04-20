import { StandardRewards } from '../../components/Contracts';
import { BNT } from '../../components/LegacyContracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts, isMainnet } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let bnt: BNT;
    let standardRewards: StandardRewards;

    beforeEach(async () => {
        bnt = await DeployedContracts.BNT.deployed();
        standardRewards = await DeployedContracts.StandardRewardsV2.deployed();
    });

    it('should upgrade the standard rewards contract', async () => {
        expect(await standardRewards.version()).to.equal(3);

        if (!isMainnet()) {
            return;
        }

        const { dai, link } = await getNamedAccounts();

        for (const pool of [bnt.address, NATIVE_TOKEN_ADDRESS, dai, link]) {
            const id = await standardRewards.latestProgramId(pool);

            const programs = await standardRewards.programs([id]);
            const program = programs[0];

            expect(program.id).to.equal(id);
            expect(program.pool).to.equal(pool);
        }
    });
});
