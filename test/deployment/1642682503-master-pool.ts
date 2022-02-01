import {
    AccessControlEnumerable,
    MasterPool,
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

describeDeployment('1642682503-master-pool', ContractName.MasterPoolV1, () => {
    let deployer: string;
    let liquidityProtection: string;
    let stakingRewards: string;
    let proxyAdmin: ProxyAdmin;
    let networkTokenGovernance: TokenGovernance;
    let govTokenGovernance: TokenGovernance;
    let masterVault: MasterVault;
    let networkProxy: TransparentUpgradeableProxyImmutable;
    let masterPool: MasterPool;
    let masterPoolToken: PoolToken;

    before(async () => {
        ({ deployer, liquidityProtection, stakingRewards } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();
        networkTokenGovernance = await DeployedContracts.NetworkTokenGovernance.deployed();
        govTokenGovernance = await DeployedContracts.GovTokenGovernance.deployed();
        masterVault = await DeployedContracts.MasterVaultV1.deployed();
        masterPoolToken = await DeployedContracts.MasterPoolTokenV1.deployed();
        masterPool = await DeployedContracts.MasterPoolV1.deployed();
    });

    it('should deploy and configure the master pool contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(masterPool.address)).to.equal(proxyAdmin.address);

        expect(await masterPool.version()).to.equal(1);

        expect(await masterPool.poolToken()).to.equal(masterPoolToken.address);

        await expectRoleMembers(masterPool, Roles.Upgradeable.ROLE_ADMIN, [deployer, networkProxy.address]);
        await expectRoleMembers(masterPool, Roles.MasterPool.ROLE_MASTER_POOL_TOKEN_MANAGER);
        await expectRoleMembers(masterPool, Roles.MasterPool.ROLE_NETWORK_TOKEN_MANAGER);
        await expectRoleMembers(masterPool, Roles.MasterPool.ROLE_VAULT_MANAGER);
        await expectRoleMembers(masterPool, Roles.MasterPool.ROLE_FUNDING_MANAGER);
        await expectRoleMembers(
            networkTokenGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet() ? [masterPool.address, liquidityProtection, stakingRewards] : [masterPool.address]
        );
        await expectRoleMembers(
            govTokenGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet() ? [masterPool.address, liquidityProtection] : [masterPool.address]
        );
        await expectRoleMembers(masterVault, Roles.MasterVault.ROLE_NETWORK_TOKEN_MANAGER, [masterPool.address]);
    });
});
