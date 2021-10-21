import Contracts from '../../components/Contracts';
import { NetworkToken } from '../../components/LegacyContracts';
import { withdrawFundsTest } from '../../test/helpers/Vault';
import { StakingRewardsVault } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { BNT, ETH, TKN } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
import { prepareEach } from '../helpers/Fixture';
import { shouldHaveGap } from '../helpers/Proxy';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles, StakingRewardsVault: StakingRewardsVaultRoles } = roles;

describe('StakingRewardsVault', () => {
    shouldHaveGap('StakingRewardsVault');

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            const { stakingRewardsVault } = await createSystem();

            await expect(stakingRewardsVault.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be payable', async () => {
            const { stakingRewardsVault } = await createSystem();

            expect(await stakingRewardsVault.isPayable()).to.be.true;
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();

            const stakingRewardsVault = await Contracts.StakingRewardsVault.deploy();
            await stakingRewardsVault.initialize();

            expect(await stakingRewardsVault.version()).to.equal(1);

            await expectRole(stakingRewardsVault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [
                deployer.address
            ]);
            await expectRole(
                stakingRewardsVault,
                StakingRewardsVaultRoles.ROLE_ASSET_MANAGER,
                StakingRewardsVaultRoles.ROLE_ASSET_MANAGER,
                [deployer.address]
            );
        });
    });

    describe('asset management', () => {
        let stakingRewardsVault: StakingRewardsVault;
        let networkToken: NetworkToken;

        prepareEach(async () => {
            ({ stakingRewardsVault, networkToken } = await createSystem());
        });

        withdrawFundsTest(async () => {
            return { vault: stakingRewardsVault, networkToken };
        }, [
            {
                token: BNT,
                roles: [
                    {
                        role: roles.StakingRewardsVault.ROLE_ASSET_MANAGER,
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
                        role: roles.StakingRewardsVault.ROLE_ASSET_MANAGER,
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
                        role: roles.StakingRewardsVault.ROLE_ASSET_MANAGER,
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
