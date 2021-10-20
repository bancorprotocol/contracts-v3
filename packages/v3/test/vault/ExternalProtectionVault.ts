import Contracts from '../../components/Contracts';
import { NetworkToken } from '../../components/LegacyContracts';
import { withdrawFundsTest } from '../../test/helpers/Vault';
import { ExternalProtectionVault, TestERC20Token } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { BNT, ETH, TKN } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
import { prepareEach } from '../helpers/Fixture';
import { shouldHaveGap } from '../helpers/Proxy';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles, ExternalProtectionVault: ExternalProtectionVaultRoles } = roles;

let deployer: SignerWithAddress;

let reserveToken: TestERC20Token;

describe('ExternalProtectionVault', () => {
    shouldHaveGap('ExternalProtectionVault');

    before(async () => {
        [deployer] = await ethers.getSigners();
    });

    prepareEach(async () => {
        reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));
    });

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            const { vault } = await createSystem();

            await expect(vault.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should be payable', async () => {
            const { vault } = await createSystem();

            expect(await vault.isPayable()).to.be.true;
        });

        it('should be properly initialized', async () => {
            const vault = await Contracts.ExternalProtectionVault.deploy();
            await vault.initialize();

            expect(await vault.version()).to.equal(1);

            await expectRole(vault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [deployer.address]);
            await expectRole(
                vault,
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
                        role: roles.ExternalProtectionVault.ROLE_ASSET_MANAGER,
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
                        role: roles.ExternalProtectionVault.ROLE_ASSET_MANAGER,
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
                        role: roles.ExternalProtectionVault.ROLE_ASSET_MANAGER,
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
