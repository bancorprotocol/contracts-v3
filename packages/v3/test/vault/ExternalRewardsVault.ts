import Contracts from '../../components/Contracts';
import { NetworkToken } from '../../components/LegacyContracts';
import { ExternalRewardsVault } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { BNT, ETH, TKN } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
import { prepareEach } from '../helpers/Fixture';
import { shouldHaveGap } from '../helpers/Proxy';
import { withdrawFundsTest } from '../helpers/Vault';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles, ExternalRewardsVault: ExternalRewardsVaultRoles } = roles;

describe('ExternalRewardsVault', () => {
    shouldHaveGap('ExternalRewardsVault');

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            const { externalRewardsVault } = await createSystem();

            await expect(externalRewardsVault.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be payable', async () => {
            const { externalRewardsVault } = await createSystem();

            expect(await externalRewardsVault.isPayable()).to.be.true;
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();

            const externalRewardsVault = await Contracts.ExternalRewardsVault.deploy();
            await externalRewardsVault.initialize();

            expect(await externalRewardsVault.version()).to.equal(1);

            await expectRole(externalRewardsVault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [
                deployer.address
            ]);
            await expectRole(
                externalRewardsVault,
                ExternalRewardsVaultRoles.ROLE_ASSET_MANAGER,
                ExternalRewardsVaultRoles.ROLE_ASSET_MANAGER,
                [deployer.address]
            );
        });
    });

    describe('asset management', () => {
        let externalRewardsVault: ExternalRewardsVault;
        let networkToken: NetworkToken;

        prepareEach(async () => {
            ({ externalRewardsVault, networkToken } = await createSystem());
        });

        withdrawFundsTest(async () => {
            return { vault: externalRewardsVault, networkToken };
        }, [
            {
                token: BNT,
                roles: [
                    {
                        role: ExternalRewardsVaultRoles.ROLE_ASSET_MANAGER,
                        isExpectedSuccessful: true
                    },
                    {
                        role: undefined,
                        isExpectedSuccessful: false
                    }
                ]
            },
            {
                token: ETH,
                roles: [
                    {
                        role: ExternalRewardsVaultRoles.ROLE_ASSET_MANAGER,
                        isExpectedSuccessful: true
                    },
                    {
                        role: undefined,
                        isExpectedSuccessful: false
                    }
                ]
            },
            {
                token: TKN,
                roles: [
                    {
                        role: ExternalRewardsVaultRoles.ROLE_ASSET_MANAGER,
                        isExpectedSuccessful: true
                    },
                    {
                        role: undefined,
                        isExpectedSuccessful: false
                    }
                ]
            }
        ]);
    });
});
