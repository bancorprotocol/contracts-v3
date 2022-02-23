import { AccessControlEnumerableUpgradeable } from '../../components/Contracts';
import { ContractName, DeploymentTag, DeployedContracts } from '../../utils/Deploy';
import { Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642778028-revoke-roles', DeploymentTag.V3, () => {
    let deployer: string;
    let daoMultisig: string;

    before(async () => {
        ({ deployer, daoMultisig } = await getNamedAccounts());
    });

    it('should revoke deployer roles', async () => {
        for (const name of [
            ContractName.AutoCompoundingStakingRewardsV1,
            ContractName.BancorNetworkInfoV1,
            ContractName.BancorNetworkV1,
            ContractName.BancorPortalV1,
            ContractName.BNTPoolV1,
            ContractName.ExternalProtectionVaultV1,
            ContractName.ExternalRewardsVaultV1,
            ContractName.MasterVaultV1,
            ContractName.NetworkSettingsV1,
            ContractName.PendingWithdrawalsV1,
            ContractName.PoolCollectionUpgraderV1,
            ContractName.PoolTokenFactoryV1
        ]) {
            const contract = (await DeployedContracts[name].deployed()) as AccessControlEnumerableUpgradeable;
            expect(await contract.hasRole(Roles.Upgradeable.ROLE_ADMIN, daoMultisig)).to.be.true;
            expect(await contract.hasRole(Roles.Upgradeable.ROLE_ADMIN, deployer)).to.be.false;
        }
    });
});
