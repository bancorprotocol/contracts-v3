import Contracts from '../../components/Contracts';
import { NetworkToken } from '../../components/LegacyContracts';
import { withdrawFundsTest } from '../../test/helpers/Vault';
import { BancorVault } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { ZERO_ADDRESS, BNT, ETH, TKN } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
import { prepareEach } from '../helpers/Fixture';
import { shouldHaveGap } from '../helpers/Proxy';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles, BancorVault: BancorVaultRoles } = roles;

describe('BancorVault', () => {
    shouldHaveGap('BancorVault');

    describe('construction', () => {
        let bancorVault: BancorVault;

        prepareEach(async () => {
            ({ bancorVault } = await createSystem());
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(bancorVault.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should be payable', async () => {
            expect(await bancorVault.isPayable()).to.be.true;
        });

        it('should be correctly versioned', async () => {
            expect(await bancorVault.version()).to.equal(1);
        });

        it('should revert when initialized with an invalid network token', async () => {
            await expect(Contracts.BancorVault.deploy(ZERO_ADDRESS)).to.be.revertedWith('InvalidAddress');
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();
            const reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));

            const vault = await Contracts.BancorVault.deploy(reserveToken.address);
            await vault.initialize();

            await expectRole(vault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [deployer.address]);
            await expectRole(vault, BancorVaultRoles.ROLE_ASSET_MANAGER, BancorVaultRoles.ROLE_ASSET_MANAGER, [
                deployer.address
            ]);
            await expectRole(vault, BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, BancorVaultRoles.ROLE_ASSET_MANAGER);
        });
    });

    describe('asset management', () => {
        let bancorVault: BancorVault;
        let networkToken: NetworkToken;

        prepareEach(async () => {
            ({ bancorVault, networkToken } = await createSystem());
        });

        withdrawFundsTest(async () => {
            return { vault: bancorVault, networkToken };
        }, [
            {
                token: BNT,
                roles: [
                    {
                        role: BancorVaultRoles.ROLE_ASSET_MANAGER,
                        isExpectedSuccessful: true
                    },
                    {
                        role: BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER,
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
                        role: BancorVaultRoles.ROLE_ASSET_MANAGER,
                        isExpectedSuccessful: true
                    },
                    {
                        role: BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER,
                        isExpectedSuccessful: false
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
                        role: BancorVaultRoles.ROLE_ASSET_MANAGER,
                        isExpectedSuccessful: true
                    },
                    {
                        role: BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER,
                        isExpectedSuccessful: false
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
