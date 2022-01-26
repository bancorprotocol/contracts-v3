import {
    BancorNetwork,
    BancorNetworkInfo,
    ExternalProtectionVault,
    ExternalRewardsVault,
    MasterPool,
    MasterVault,
    NetworkSettings,
    PendingWithdrawals,
    PoolCollectionUpgrader,
    PoolToken,
    ProxyAdmin
} from '../../components/Contracts';
import { GovToken, NetworkToken, TokenGovernance } from '../../components/LegacyContracts';
import { ContractName, DeployedContracts, runTestDeployment } from '../../utils/Deploy';
import { expectRole, Roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describe('1642682507-network-info', () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let network: BancorNetwork;
    let networkToken: NetworkToken;
    let govToken: GovToken;
    let networkTokenGovernance: TokenGovernance;
    let govTokenGovernance: TokenGovernance;
    let networkSettings: NetworkSettings;
    let masterVault: MasterVault;
    let externalProtectionVault: ExternalProtectionVault;
    let externalRewardsVault: ExternalRewardsVault;
    let masterPool: MasterPool;
    let masterPoolToken: PoolToken;
    let pendingWithdrawals: PendingWithdrawals;
    let poolCollectionUpgrader: PoolCollectionUpgrader;

    let networkInfo: BancorNetworkInfo;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(ContractName.BancorNetworkInfoV1);

        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        network = await DeployedContracts.BancorNetworkV1.deployed();
        networkToken = await DeployedContracts.NetworkToken.deployed();
        govToken = await DeployedContracts.GovToken.deployed();
        networkTokenGovernance = await DeployedContracts.NetworkTokenGovernance.deployed();
        govTokenGovernance = await DeployedContracts.GovTokenGovernance.deployed();
        networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
        masterVault = await DeployedContracts.MasterVaultV1.deployed();
        externalProtectionVault = await DeployedContracts.ExternalProtectionVaultV1.deployed();
        externalRewardsVault = await DeployedContracts.ExternalRewardsVaultV1.deployed();
        masterPool = await DeployedContracts.MasterPoolV1.deployed();
        masterPoolToken = await DeployedContracts.MasterPoolTokenV1.deployed();
        pendingWithdrawals = await DeployedContracts.PendingWithdrawalsV1.deployed();
        poolCollectionUpgrader = await DeployedContracts.PoolCollectionUpgraderV1.deployed();
        networkInfo = await DeployedContracts.BancorNetworkInfoV1.deployed();
    });

    it('should deploy and configure the network info contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(networkInfo.address)).to.equal(proxyAdmin.address);

        expect(await networkInfo.version()).to.equal(1);

        expect(await networkInfo.network()).to.equal(network.address);
        expect(await networkInfo.networkToken()).to.equal(networkToken.address);
        expect(await networkInfo.networkTokenGovernance()).to.equal(networkTokenGovernance.address);
        expect(await networkInfo.govToken()).to.equal(govToken.address);
        expect(await networkInfo.govTokenGovernance()).to.equal(govTokenGovernance.address);
        expect(await networkInfo.networkSettings()).to.equal(networkSettings.address);
        expect(await networkInfo.masterVault()).to.equal(masterVault.address);
        expect(await networkInfo.externalProtectionVault()).to.equal(externalProtectionVault.address);
        expect(await networkInfo.externalRewardsVault()).to.equal(externalRewardsVault.address);
        expect(await networkInfo.masterPool()).to.equal(masterPool.address);
        expect(await networkInfo.masterPoolToken()).to.equal(masterPoolToken.address);
        expect(await networkInfo.pendingWithdrawals()).to.equal(pendingWithdrawals.address);
        expect(await networkInfo.poolCollectionUpgrader()).to.equal(poolCollectionUpgrader.address);

        await expectRole(networkInfo, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
    });
});
