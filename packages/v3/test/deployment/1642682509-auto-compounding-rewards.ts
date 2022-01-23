import { AutoCompoundingStakingRewards, ProxyAdmin } from '../../components/Contracts';
import { ContractName } from '../../utils/Constants';
import { DeployedContracts, runTestDeployment } from '../../utils/Deploy';
import { expectRole, Roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describe('1642682509-auto-compounding-rewards', () => {
    let proxyAdmin: ProxyAdmin;
    let deployer: string;
    let autoCompoundingStakingRewards: AutoCompoundingStakingRewards;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(ContractName.AutoCompoundingStakingRewards);

        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        autoCompoundingStakingRewards = await DeployedContracts.AutoCompoundingStakingRewards.deployed();
    });

    it('should deploy and configure the auto-compounding rewards contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(autoCompoundingStakingRewards.address)).to.equal(proxyAdmin.address);

        expect(await autoCompoundingStakingRewards.version()).to.equal(1);

        await expectRole(autoCompoundingStakingRewards, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
            deployer
        ]);
    });
});
