import { ExternalRewardsVault, StandardRewards } from '../../components/Contracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';

describeDeployment(__filename, () => {
    let standardRewards: StandardRewards;
    let externalAutoCompoundingRewardsVault: ExternalRewardsVault;

    beforeEach(async () => {
        standardRewards = await DeployedContracts.StandardRewards.deployed();
        externalAutoCompoundingRewardsVault = await DeployedContracts.ExternalAutoCompoundingRewardsVault.deployed();
    });

    it('should upgrade the standard rewards contract', async () => {
        expect(await standardRewards.version()).to.equal(4);

        const programIds = await standardRewards.programIds();
        for (const id of programIds) {
            expect(await standardRewards.isProgramPaused(id)).to.be.false;
        }

        await expectRoleMembers(externalAutoCompoundingRewardsVault, Roles.Vault.ROLE_ASSET_MANAGER);
    });
});
