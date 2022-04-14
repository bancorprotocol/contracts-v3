import { AccessControlEnumerableUpgradeable } from '../../components/Contracts';
import { DeployedContracts, InstanceName } from '../../utils/Deploy';
import { Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let daoMultisig: string;

    before(async () => {
        ({ deployer, daoMultisig } = await getNamedAccounts());
    });

    it('should revoke deployer roles', async () => {
        for (const name of [
            InstanceName.AutoCompoundingRewards,
            InstanceName.BancorNetworkInfo,
            InstanceName.BancorNetwork,
            InstanceName.BancorPortal,
            InstanceName.BNTPool,
            InstanceName.ExternalProtectionVault,
            InstanceName.ExternalRewardsVault,
            InstanceName.MasterVault,
            InstanceName.NetworkSettings,
            InstanceName.PendingWithdrawals,
            InstanceName.PoolMigrator,
            InstanceName.PoolTokenFactory,
            InstanceName.StandardRewards
        ]) {
            const contract = (await DeployedContracts[name].deployed()) as AccessControlEnumerableUpgradeable;
            expect(await contract.hasRole(Roles.Upgradeable.ROLE_ADMIN, daoMultisig)).to.be.true;
            expect(await contract.hasRole(Roles.Upgradeable.ROLE_ADMIN, deployer)).to.be.false;
        }
    });
});
