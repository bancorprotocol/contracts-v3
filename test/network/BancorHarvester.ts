import Contracts, { AutoCompoundingRewards, BancorHarvester, BancorVortex, IERC20 } from '../../components/Contracts';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { createSystem } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('BancorHarvester', () => {
    let bancorHarvester: BancorHarvester;
    let autoCompoundingRewards: AutoCompoundingRewards;
    let bancorVortex: BancorVortex;
    let bnt: IERC20;

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    shouldHaveGap('BancorHarvester', '_harvesterThresholds');

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({ bancorHarvester, autoCompoundingRewards, bancorVortex, bnt } = await createSystem());
    });

    describe('construction', () => {
        it('should revert when attempting to create with an invalid Auto Compounding Rewards contract', async () => {
            await expect(
                Contracts.BancorHarvester.deploy(ZERO_ADDRESS, bancorVortex.address, bnt.address)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid Bancor Vortex contract', async () => {
            await expect(
                Contracts.BancorHarvester.deploy(autoCompoundingRewards.address, ZERO_ADDRESS, bnt.address)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT Governance contract', async () => {
            await expect(
                Contracts.BancorHarvester.deploy(autoCompoundingRewards.address, bancorVortex.address, ZERO_ADDRESS)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(bancorHarvester.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            expect(await bancorHarvester.version()).to.equal(1);

            await expectRoles(bancorHarvester, Roles.Upgradeable);

            await expectRole(bancorHarvester, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address
            ]);

            const harvesterThresholds = await bancorHarvester.harvesterThresholds();
            expect(harvesterThresholds.processRewardsDuration).to.equal(0);
            expect(harvesterThresholds.vortexRewardsAmount).to.equal(0);
        });
    });

    describe('harvester rewards', () => {
        const newHarvesterThresholds = {
            processRewardsDuration: 100,
            vortexRewardsAmount: 200
        };

        it('should revert when a non-admin attempts to update the harvester configuration', async () => {
            await expect(
                bancorHarvester.connect(nonOwner).setHarvesterThresholds(newHarvesterThresholds)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when updating the harvester configuration with an invalid value', async () => {
            await expect(
                bancorHarvester.setHarvesterThresholds({
                    processRewardsDuration: 0,
                    vortexRewardsAmount: 1
                })
            ).to.be.revertedWith('ZeroValue');

            await expect(
                bancorHarvester.setHarvesterThresholds({
                    processRewardsDuration: 1,
                    vortexRewardsAmount: 0
                })
            ).to.be.revertedWith('ZeroValue');
        });

        it('should ignore updating to the same harvester configuration', async () => {
            await bancorHarvester.setHarvesterThresholds(newHarvesterThresholds);

            const res = await bancorHarvester.setHarvesterThresholds(newHarvesterThresholds);
            await expect(res).not.to.emit(bancorHarvester, 'HarvesterThresholdsUpdated');
        });

        it('should be able to update the harvester configuration', async () => {
            const res = await bancorHarvester.connect(deployer).setHarvesterThresholds(newHarvesterThresholds);
            await expect(res)
                .to.emit(bancorHarvester, 'HarvesterThresholdsUpdated')
                .withArgs(
                    0,
                    newHarvesterThresholds.processRewardsDuration,
                    0,
                    newHarvesterThresholds.vortexRewardsAmount
                );

            const harvesterThresholds = await bancorHarvester.harvesterThresholds();
            expect(harvesterThresholds.processRewardsDuration).to.equal(newHarvesterThresholds.processRewardsDuration);
            expect(harvesterThresholds.vortexRewardsAmount).to.equal(newHarvesterThresholds.vortexRewardsAmount);
        });
    });
});
