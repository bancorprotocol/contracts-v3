import Contracts from '../../components/Contracts';
import { NetworkToken } from '../../components/LegacyContracts';
import { withdrawFundsTest } from '../../test/helpers/Vault';
import { BancorVault, TestERC20Token } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { ZERO_ADDRESS, BNT, ETH, TKN } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
import { prepareEach } from '../helpers/Fixture';
import { shouldHaveGap } from '../helpers/Proxy';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles, BancorVault: BancorVaultRoles } = roles;

let deployer: SignerWithAddress;

let reserveToken: TestERC20Token;

describe('BancorVault', () => {
    shouldHaveGap('BancorVault');

    before(async () => {
        [deployer] = await ethers.getSigners();
    });

    prepareEach(async () => {
        reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));
    });

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
                        role: roles.BancorVault.ROLE_ASSET_MANAGER,
                        isExpectedSuccessful: true
                    },
                    {
                        role: roles.BancorVault.ROLE_NETWORK_TOKEN_MANAGER,
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
                        role: roles.BancorVault.ROLE_ASSET_MANAGER,
                        isExpectedSuccessful: true
                    },
                    {
                        role: roles.BancorVault.ROLE_NETWORK_TOKEN_MANAGER,
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
                        role: roles.BancorVault.ROLE_ASSET_MANAGER,
                        isExpectedSuccessful: true
                    },
                    {
                        role: roles.BancorVault.ROLE_NETWORK_TOKEN_MANAGER,
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
