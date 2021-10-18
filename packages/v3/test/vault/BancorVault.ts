import Contracts from '../../components/Contracts';
import LegacyContracts, { NetworkToken } from '../../components/LegacyContracts';
import { withdrawFundsTest } from '../../test/helpers/Vault';
import { BancorVault, TestERC20Token } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { ZERO_ADDRESS, BNT, ETH, TKN } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
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

    beforeEach(async () => {
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

        it('should revert when initialized with an invalid network token', async () => {
            await expect(Contracts.BancorVault.deploy(ZERO_ADDRESS)).to.be.revertedWith('InvalidAddress');
        });

        it('should be properly initialized', async () => {
            const vault = await Contracts.BancorVault.deploy(reserveToken.address);
            await vault.initialize();

            expect(await vault.version()).to.equal(1);

            await expectRole(vault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [deployer.address]);
            await expectRole(vault, BancorVaultRoles.ROLE_ASSET_MANAGER, BancorVaultRoles.ROLE_ASSET_MANAGER, [
                deployer.address
            ]);
            await expectRole(vault, BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, BancorVaultRoles.ROLE_ASSET_MANAGER);
        });
    });

    describe('asset management', () => {
        let vault: BancorVault;
        let networkToken: NetworkToken;

        beforeEach(async () => {
            ({ vault, networkToken } = await createSystem());
        });

        withdrawFundsTest(async () => {
            return { vault, networkToken };
        }, [
            {
                token: BNT,
                roles: [
                    {
                        name: 'ROLE_ASSET_MANAGER',
                        role: roles.BancorVault.ROLE_ASSET_MANAGER,
                        isExpectedSuccessful: true
                    },
                    {
                        name: 'ROLE_NETWORK_TOKEN_MANAGER',
                        role: roles.BancorVault.ROLE_NETWORK_TOKEN_MANAGER,
                        isExpectedSuccessful: true
                    },
                    {
                        name: undefined,
                        role: undefined,
                        isExpectedSuccessful: false
                    }
                ]
            },
            {
                token: ETH,
                roles: [
                    {
                        name: 'ROLE_ASSET_MANAGER',
                        role: roles.BancorVault.ROLE_ASSET_MANAGER,
                        isExpectedSuccessful: true
                    },
                    {
                        name: 'ROLE_NETWORK_TOKEN_MANAGER',
                        role: roles.BancorVault.ROLE_NETWORK_TOKEN_MANAGER,
                        isExpectedSuccessful: false
                    },
                    {
                        name: undefined,
                        role: undefined,
                        isExpectedSuccessful: false
                    }
                ]
            },
            {
                token: TKN,
                roles: [
                    {
                        name: 'ROLE_ASSET_MANAGER',
                        role: roles.BancorVault.ROLE_ASSET_MANAGER,
                        isExpectedSuccessful: true
                    },
                    {
                        name: 'ROLE_NETWORK_TOKEN_MANAGER',
                        role: roles.BancorVault.ROLE_NETWORK_TOKEN_MANAGER,
                        isExpectedSuccessful: false
                    },
                    {
                        name: undefined,
                        role: undefined,
                        isExpectedSuccessful: false
                    }
                ]
            }
        ]);
    });
});
