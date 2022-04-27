import { BancorNetwork } from '../../components/Contracts';
import { LiquidityProtection } from '../../components/LegacyContracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts, isMainnet } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(
    __filename,
    () => {
        let network: BancorNetwork;
        let liquidityProtection: LiquidityProtection;

        beforeEach(async () => {
            network = await DeployedContracts.BancorNetwork.deployed();
            liquidityProtection = await DeployedContracts.LiquidityProtection.deployed();
        });

        it.only('should allow the liquidity protection contract to migrate liquidity', async () => {
            await expectRoleMembers(network, Roles.BancorNetwork.ROLE_MIGRATION_MANAGER, [liquidityProtection.address]);
        });
    },
    () => !isMainnet()
);
