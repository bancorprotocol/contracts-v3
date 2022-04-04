import { AccessControlEnumerableUpgradeable } from '../../components/Contracts';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
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
            ContractName.AutoCompoundingStakingRewards,
            ContractName.BancorNetworkInfo,
            ContractName.BancorNetwork,
            ContractName.BancorPortal,
            ContractName.BNTPool,
            ContractName.ExternalProtectionVault,
            ContractName.ExternalRewardsVault,
            ContractName.MasterVault,
            ContractName.NetworkSettings,
            ContractName.PendingWithdrawals,
            ContractName.PoolMigrator,
            ContractName.PoolTokenFactory,
            ContractName.StandardStakingRewards
        ]) {
            const contract = (await DeployedContracts[name].deployed()) as AccessControlEnumerableUpgradeable;
            expect(await contract.hasRole(Roles.Upgradeable.ROLE_ADMIN, daoMultisig)).to.be.true;
            expect(await contract.hasRole(Roles.Upgradeable.ROLE_ADMIN, deployer)).to.be.false;
        }
    });
});
