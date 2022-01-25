import {
    AutoCompoundingStakingRewards,
    ExternalRewardsVault,
    MasterPool,
    ProxyAdmin
} from '../../components/Contracts';
import { ContractName, DeployedContracts, runTestDeployment } from '../../utils/Deploy';
import { expectRole, Roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describe('1642682509-auto-compounding-rewards', () => {
    let proxyAdmin: ProxyAdmin;
    let deployer: string;
    let masterPool: MasterPool;
    let externalRewardsVault: ExternalRewardsVault;
    let autoCompoundingStakingRewards: AutoCompoundingStakingRewards;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(ContractName.AutoCompoundingStakingRewardsV1);

        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        masterPool = await DeployedContracts.MasterPoolV1.deployed();
        externalRewardsVault = await DeployedContracts.ExternalRewardsVaultV1.deployed();
        autoCompoundingStakingRewards = await DeployedContracts.AutoCompoundingStakingRewardsV1.deployed();
    });

    it('should deploy and configure the auto-compounding rewards contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(autoCompoundingStakingRewards.address)).to.equal(proxyAdmin.address);

        expect(await autoCompoundingStakingRewards.version()).to.equal(1);

        await expectRole(autoCompoundingStakingRewards, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
            deployer
        ]);
        await expectRole(masterPool, Roles.MasterPool.ROLE_MASTER_POOL_TOKEN_MANAGER, Roles.Upgradeable.ROLE_ADMIN, [
            autoCompoundingStakingRewards.address
        ]);
        await expectRole(externalRewardsVault, Roles.Vault.ROLE_ASSET_MANAGER, Roles.Upgradeable.ROLE_ADMIN, [
            autoCompoundingStakingRewards.address
        ]);
    });
});
