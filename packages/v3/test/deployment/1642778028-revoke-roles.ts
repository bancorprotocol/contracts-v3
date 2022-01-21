import { AccessControlEnumerableUpgradeable } from '../../components/Contracts';
import { ContractName, DeploymentTag } from '../../utils/Constants';
import { DeployedContracts, runTestDeployment } from '../../utils/Deploy';
import { Roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describe('1642778028-revoke-roles', () => {
    let deployer: string;
    let daoMultisig: string;

    before(async () => {
        ({ deployer, daoMultisig } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(DeploymentTag.V3);
    });

    it('should revoke deployer roles', async () => {
        for (const name of [
            ContractName.ExternalRewardsVault,
            ContractName.PoolTokenFactory,
            ContractName.NetworkSettings,
            ContractName.MasterPool,
            ContractName.PendingWithdrawals,
            ContractName.PoolCollectionUpgrader,
            ContractName.BancorNetwork,
            ContractName.BancorNetworkInfo
        ]) {
            const contract = (await DeployedContracts[name].deployed()) as AccessControlEnumerableUpgradeable;
            expect(await contract.hasRole(Roles.Upgradeable.ROLE_ADMIN, daoMultisig)).to.be.true;
            expect(await contract.hasRole(Roles.Upgradeable.ROLE_ADMIN, deployer)).to.be.false;
        }
    });
});
