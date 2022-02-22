import {
    AccessControlEnumerable,
    BNTPool,
    MasterVault,
    PoolToken,
    ProxyAdmin,
    TransparentUpgradeableProxyImmutable
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { ContractName, DeployedContracts, isMainnet } from '../../utils/Deploy';
import { Roles, expectRoleMembers } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682503-bnt-pool', ContractName.BNTPoolV1, () => {
    let deployer: string;
    let liquidityProtection: string;
    let stakingRewards: string;
    let proxyAdmin: ProxyAdmin;
    let bntGovernance: TokenGovernance;
    let vbntGovernance: TokenGovernance;
    let masterVault: MasterVault;
    let networkProxy: TransparentUpgradeableProxyImmutable;
    let bntPool: BNTPool;
    let bntPoolToken: PoolToken;

    before(async () => {
        ({ deployer, liquidityProtection, stakingRewards } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();
        bntGovernance = await DeployedContracts.BNTGovernance.deployed();
        vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
        masterVault = await DeployedContracts.MasterVaultV1.deployed();
        bntPoolToken = await DeployedContracts.BNTPoolTokenV1.deployed();
        bntPool = await DeployedContracts.BNTPoolV1.deployed();
    });

    it('should deploy and configure the bnt pool contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(bntPool.address)).to.equal(proxyAdmin.address);

        expect(await bntPool.version()).to.equal(1);

        expect(await bntPool.poolToken()).to.equal(bntPoolToken.address);

        await expectRoleMembers(bntPool, Roles.Upgradeable.ROLE_ADMIN, [deployer, networkProxy.address]);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_POOL_TOKEN_MANAGER);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_MANAGER);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_VAULT_MANAGER);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_FUNDING_MANAGER);
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet() ? [bntPool.address, liquidityProtection, stakingRewards] : [bntPool.address]
        );
        await expectRoleMembers(
            vbntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet() ? [bntPool.address, liquidityProtection] : [bntPool.address]
        );
        await expectRoleMembers(masterVault, Roles.MasterVault.ROLE_BNT_MANAGER, [bntPool.address]);
    });
});
