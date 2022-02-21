import {
    AccessControlEnumerable,
    OmniPool,
    MasterVault,
    PoolToken,
    ProxyAdmin,
    TransparentUpgradeableProxyImmutable
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { ContractName, DeployedContracts, isMainnet } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682503-omni-pool', ContractName.OmniPoolV1, () => {
    let deployer: string;
    let liquidityProtection: string;
    let stakingRewards: string;
    let proxyAdmin: ProxyAdmin;
    let bntGovernance: TokenGovernance;
    let vbntGovernance: TokenGovernance;
    let masterVault: MasterVault;
    let networkProxy: TransparentUpgradeableProxyImmutable;
    let omniPool: OmniPool;
    let omniPoolToken: PoolToken;

    before(async () => {
        ({ deployer, liquidityProtection, stakingRewards } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();
        bntGovernance = await DeployedContracts.BNTGovernance.deployed();
        vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
        masterVault = await DeployedContracts.MasterVaultV1.deployed();
        omniPoolToken = await DeployedContracts.OmniPoolTokenV1.deployed();
        omniPool = await DeployedContracts.OmniPoolV1.deployed();
    });

    it('should deploy and configure the omni pool contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(omniPool.address)).to.equal(proxyAdmin.address);

        expect(await omniPool.version()).to.equal(1);

        expect(await omniPool.poolToken()).to.equal(omniPoolToken.address);

        await expectRoleMembers(omniPool, Roles.Upgradeable.ROLE_ADMIN, [deployer, networkProxy.address]);
        await expectRoleMembers(omniPool, Roles.OmniPool.ROLE_OMNI_POOL_TOKEN_MANAGER);
        await expectRoleMembers(omniPool, Roles.OmniPool.ROLE_BNT_MANAGER);
        await expectRoleMembers(omniPool, Roles.OmniPool.ROLE_VAULT_MANAGER);
        await expectRoleMembers(omniPool, Roles.OmniPool.ROLE_FUNDING_MANAGER);
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet() ? [omniPool.address, liquidityProtection, stakingRewards] : [omniPool.address]
        );
        await expectRoleMembers(
            vbntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet() ? [omniPool.address, liquidityProtection] : [omniPool.address]
        );
        await expectRoleMembers(masterVault, Roles.MasterVault.ROLE_BNT_MANAGER, [omniPool.address]);
    });
});
