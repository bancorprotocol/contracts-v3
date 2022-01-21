import {
    AccessControlEnumerable,
    MasterPool,
    MasterVault,
    PoolToken,
    ProxyAdmin,
    TransparentUpgradeableProxyImmutable
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { ContractName } from '../../utils/Constants';
import { DeployedContracts, runTestDeployment, isMainnet } from '../../utils/Deploy';
import { expectRoles, expectRole, Roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describe('1642682503-master-pool', () => {
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
        await runTestDeployment(ContractName.MasterPool);

        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();
        networkTokenGovernance = await DeployedContracts.NetworkTokenGovernance.deployed();
        govTokenGovernance = await DeployedContracts.GovTokenGovernance.deployed();
        masterVault = await DeployedContracts.MasterVault.deployed();
        masterPoolToken = await DeployedContracts.MasterPoolToken.deployed();
        masterPool = await DeployedContracts.MasterPool.deployed();
    });

    it('should deploy and configure the master pool contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(masterPool.address)).to.equal(proxyAdmin.address);

        expect(await masterPool.version()).to.equal(1);
        expect(await masterPool.isPayable()).to.be.false;

        expect(await masterPool.poolToken()).to.equal(masterPoolToken.address);

        await expectRoles(masterPool, Roles.MasterPool);

        await expectRole(masterPool, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
            deployer,
            networkProxy.address
        ]);
        await expectRole(masterPool, Roles.MasterPool.ROLE_MASTER_POOL_TOKEN_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
        await expectRole(masterPool, Roles.MasterPool.ROLE_NETWORK_TOKEN_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
        await expectRole(masterPool, Roles.MasterPool.ROLE_VAULT_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
        await expectRole(masterPool, Roles.MasterPool.ROLE_FUNDING_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
        await expectRole(
            networkTokenGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            Roles.TokenGovernance.ROLE_GOVERNOR,
            isMainnet() ? [masterPool.address, liquidityProtection, stakingRewards] : [masterPool.address, deployer]
        );
        await expectRole(
            govTokenGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            Roles.TokenGovernance.ROLE_GOVERNOR,
            isMainnet() ? [masterPool.address, liquidityProtection] : [masterPool.address, deployer]
        );
        await expectRole(masterVault, Roles.MasterVault.ROLE_NETWORK_TOKEN_MANAGER, Roles.Upgradeable.ROLE_ADMIN, [
            masterPool.address
        ]);
    });
});
