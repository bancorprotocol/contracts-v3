import { AccessControlEnumerableUpgradeable } from '../../components/Contracts';
import { Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts, InstanceName, isLive } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(
    __filename,
    () => {
        let deployer: string;
        let daoMultisig: string;
        let foundationMultisig2: string;

        before(async () => {
            ({ deployer, daoMultisig, foundationMultisig2 } = await getNamedAccounts());
        });

        it('should revoke deployer roles', async () => {
            // ensure that ownership transfer to the DAO was initiated
            const liquidityProtection = await DeployedContracts.LiquidityProtection.deployed();
            expect(await liquidityProtection.newOwner()).to.equal(daoMultisig);

            for (const name of [
                InstanceName.BancorNetworkInfo,
                InstanceName.BancorPortal,
                InstanceName.BNTPool,
                InstanceName.ExternalProtectionVault,
                InstanceName.ExternalAutoCompoundingRewardsVault,
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

            for (const name of [InstanceName.BancorNetwork]) {
                const contract = (await DeployedContracts[name].deployed()) as AccessControlEnumerableUpgradeable;
                expect(await contract.hasRole(Roles.Upgradeable.ROLE_ADMIN, daoMultisig)).to.be.true;
                expect(await contract.hasRole(Roles.Upgradeable.ROLE_ADMIN, deployer)).to.be.false;
                expect(await contract.hasRole(Roles.Upgradeable.ROLE_ADMIN, foundationMultisig2)).to.be.false;
            }
        });
    },
    { skip: isLive }
);
