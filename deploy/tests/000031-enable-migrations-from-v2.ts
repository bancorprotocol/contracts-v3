import { LiquidityProtection } from '../../components/LegacyContracts';
import { BancorNetworkV2 } from '../../components/LegacyContractsV3';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';

describeDeployment(__filename, () => {
    let network: BancorNetworkV2;
    let liquidityProtection: LiquidityProtection;

    beforeEach(async () => {
        network = await DeployedContracts.BancorNetworkV2.deployed();
        liquidityProtection = await DeployedContracts.LiquidityProtection.deployed();
    });

    it('should allow the liquidity protection contract to migrate liquidity', async () => {
        await expectRoleMembers(network, Roles.BancorNetwork.ROLE_MIGRATION_MANAGER, [liquidityProtection.address]);
    });
});
