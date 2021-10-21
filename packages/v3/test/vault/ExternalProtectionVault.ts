import Contracts from '../../components/Contracts';
import { NetworkToken } from '../../components/LegacyContracts';
import { withdrawFundsTest } from '../../test/helpers/Vault';
import { ExternalProtectionVault } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { BNT, ETH, TKN } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
import { prepareEach } from '../helpers/Fixture';
import { shouldHaveGap } from '../helpers/Proxy';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles, ExternalProtectionVault: ExternalProtectionVaultRoles } = roles;

describe('ExternalProtectionVault', () => {
    shouldHaveGap('ExternalProtectionVault');

    before(async () => {});

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            const { externalProtectionVault } = await createSystem();

            await expect(externalProtectionVault.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be payable', async () => {
            const { externalProtectionVault } = await createSystem();

            expect(await externalProtectionVault.isPayable()).to.be.true;
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();

            const externalProtectionVault = await Contracts.ExternalProtectionVault.deploy();
            await externalProtectionVault.initialize();

            expect(await externalProtectionVault.version()).to.equal(1);

            await expectRole(externalProtectionVault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [
                deployer.address
            ]);
            await expectRole(
                externalProtectionVault,
                ExternalProtectionVaultRoles.ROLE_ASSET_MANAGER,
                ExternalProtectionVaultRoles.ROLE_ASSET_MANAGER,
                [deployer.address]
            );
        });
    });

    describe('asset management', () => {
        let externalProtectionVault: ExternalProtectionVault;
        let networkToken: NetworkToken;

        prepareEach(async () => {
            ({ externalProtectionVault, networkToken } = await createSystem());
        });

        withdrawFundsTest(async () => {
            return { vault: externalProtectionVault, networkToken };
        }, [
            {
                token: BNT,
                roles: [
                    {
                        role: ExternalProtectionVaultRoles.ROLE_ASSET_MANAGER,
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
                        role: ExternalProtectionVaultRoles.ROLE_ASSET_MANAGER,
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
                        role: ExternalProtectionVaultRoles.ROLE_ASSET_MANAGER,
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
